import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import { PassThrough } from 'stream';
import type { AddressInfo } from 'net';
import User from '../models/User';
import Model from '../models/Model';
import modelsRouter from '../routes/models';
import { signToken } from '../utils/authToken';
import { callLLM } from '../engine/llmClient';
import type { IModel } from '../models/Model';
import {
  BlockedModelUrlError,
  MODEL_URL_ALLOWLIST_ENV,
  findBlockedModelUrlError,
  isAllowlistedModelUrl,
  isBlockedModelUrlError,
  isPublicAddress,
  modelFetchTransport,
  resetModelUrlDnsLookupForTests,
  safeModelFetch,
  setModelUrlDnsLookupForTests,
  validateModelBaseUrl,
} from '../security/modelUrlGuard';

/**
 * Phase 23 — SSRF / provider-URL boundary regressions.
 *
 * `Model.baseUrl` is attacker-controlled input that makes the *server* open a
 * socket, so authorisation (phase 22) is not enough. These tests pin:
 *   1. the write-path rules (scheme, credentials, query/fragment, length,
 *      non-public IP literals, local hostnames) including WHATWG normalisation
 *      tricks such as `0x7f.0.0.1` and `2130706433`;
 *   2. the request-time destination check — DNS answers are validated and the
 *      socket is pinned to the validated address;
 *   3. redirect policy — hops are re-validated, auth is dropped cross-origin,
 *      and the hop count is bounded;
 *   4. the operator allow-list (`MODEL_URL_ALLOWLIST`) and its limits;
 *   5. the API surface (`POST`/`PUT /api/models`, `POST /:id/test`) returning
 *      the safe message instead of dialling or leaking resolver detail.
 *
 * No test in this file touches the internet: DNS is stubbed and the transport
 * is replaced with a deterministic responder except for one loopback
 * round-trip that proves the allow-listed path really works end to end.
 */

const TEST_URI =
  process.env.MONGODB_URI_TEST_PHASE23 || 'mongodb://localhost:27017/hathap_test_phase23_model_url';

process.env.API_KEY_ENCRYPTION_SECRET ??= 'phase23-model-url-secret-0123456789abcdef';

const PREFIX = 'Model provider URL rejected: ';
const PUBLIC_DNS = [{ address: '93.184.216.34', family: 4 }];

/* -------------------------------------------------------------------------- */
/* Deterministic transport double                                              */
/* -------------------------------------------------------------------------- */

interface TransportCall {
  options: http.RequestOptions;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | undefined;
}

interface TransportReply {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Never answer (used for abort/timeout cases). */
  hang?: boolean;
}

type TransportHandler = (call: TransportCall, index: number) => TransportReply | undefined;

class TransportDouble {
  readonly calls: TransportCall[] = [];
  handler: TransportHandler = () => ({});

  request(options: http.RequestOptions, onResponse: (response: http.IncomingMessage) => void) {
    const call: TransportCall = {
      options,
      method: String(options.method || 'GET'),
      path: String(options.path || ''),
      headers: flattenHeaders(options.headers),
      body: undefined,
    };
    const index = this.calls.length;
    this.calls.push(call);

    let errorListener: ((error: Error) => void) | undefined;
    const request = {
      on: (event: string, listener: (error: Error) => void) => {
        if (event === 'error') errorListener = listener;
        return request;
      },
      end: (body?: unknown) => {
        call.body = body === undefined ? undefined : String(body);

        // Mirror real http.request(): an aborted signal surfaces as an
        // 'error' event rather than an answered response.
        const signal = options.signal as AbortSignal | undefined | null;
        const emitAbort = (): void => {
          const abortError = new Error('The request was aborted');
          abortError.name = 'AbortError';
          errorListener?.(abortError);
        };
        if (signal) {
          if (signal.aborted) {
            process.nextTick(emitAbort);
            return;
          }
          signal.addEventListener('abort', emitAbort, { once: true });
        }

        const reply = this.handler(call, index) || {};
        if (reply.hang) return;
        const stream = new PassThrough() as unknown as http.IncomingMessage & PassThrough;
        const typed = stream as any;
        typed.statusCode = reply.status ?? 200;
        typed.statusMessage = http.STATUS_CODES[reply.status ?? 200] || 'OK';
        typed.headers = { ...(reply.headers || {}) };
        onResponse(stream);
        if (reply.body) stream.write(reply.body);
        stream.end();
      },
    };
    return request;
  }

  reset(): void {
    this.calls.length = 0;
    this.handler = () => ({});
  }

  install(): void {
    modelFetchTransport.http = this as any;
    modelFetchTransport.https = this as any;
  }
}

function flattenHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const pair of headers) out[String(pair[0]).toLowerCase()] = String(pair[1]);
    return out;
  }
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

const transport = new TransportDouble();
const realHttpTransport = modelFetchTransport.http;
const realHttpsTransport = modelFetchTransport.https;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function expectBlocked(run: () => unknown | Promise<unknown>): Promise<BlockedModelUrlError> {
  try {
    await run();
  } catch (error) {
    assert.ok(
      isBlockedModelUrlError(error),
      `expected BlockedModelUrlError, received: ${(error as Error)?.message || error}`
    );
    return error as BlockedModelUrlError;
  }
  assert.fail('expected the model URL to be blocked, but the call succeeded');
}

/** The client-visible message must never carry addresses, resolver text or a stack. */
function assertSafeMessage(error: BlockedModelUrlError): void {
  assert.ok(error.message.startsWith(PREFIX), `message must use the guard prefix: ${error.message}`);
  assert.ok(!/\d{1,3}(\.\d{1,3}){3}/.test(error.message), `message leaked an IPv4 address: ${error.message}`);
  assert.ok(!/::[0-9a-f]/i.test(error.message), `message leaked an IPv6 address: ${error.message}`);
  assert.ok(!/(ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo|at Object\.|node:)/.test(error.message), `message leaked resolver/stack detail: ${error.message}`);
  assert.ok(!/[\r\n]/.test(error.message), 'message must stay on one line');
}

function stubDns(lookup: (hostname: string) => Promise<Array<{ address: string; family: number }>>) {
  setModelUrlDnsLookupForTests(lookup);
}

function stubPublicDns(): { hosts: string[] } {
  const hosts: string[] = [];
  stubDns(async (hostname) => {
    hosts.push(hostname);
    return PUBLIC_DNS;
  });
  return { hosts };
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                   */
/* -------------------------------------------------------------------------- */

before(() => {
  transport.install();
  resetModelUrlDnsLookupForTests();
});

after(() => {
  modelFetchTransport.http = realHttpTransport;
  modelFetchTransport.https = realHttpsTransport;
  resetModelUrlDnsLookupForTests();
  delete process.env[MODEL_URL_ALLOWLIST_ENV];
});

afterEach(() => {
  transport.reset();
  resetModelUrlDnsLookupForTests();
  delete process.env[MODEL_URL_ALLOWLIST_ENV];
});

/* -------------------------------------------------------------------------- */
/* Address classification                                                       */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - public address classification', () => {
  test('IANA special-purpose and private IPv4 space is never public', () => {
    const blocked = [
      '0.0.0.0',
      '0.255.255.255',
      '10.0.0.1',
      '10.255.255.254',
      '100.64.0.1',
      '100.127.255.255',
      '127.0.0.1',
      '127.1.2.3',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.0.2.1',
      '192.88.99.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '239.255.255.250',
      '240.0.0.1',
      '255.255.255.255',
      'not-an-ip',
      '',
      '1.2.3',
      '1.2.3.4.5',
      '999.1.1.1',
    ];
    for (const address of blocked) {
      assert.equal(isPublicAddress(address), false, `${address} must be refused`);
    }
  });

  test('ordinary public IPv4 space is reachable', () => {
    for (const address of ['1.1.1.1', '8.8.8.8', '93.184.216.34', '104.16.0.1', '172.32.0.1', '100.128.0.1']) {
      assert.equal(isPublicAddress(address), true, `${address} should be public`);
    }
  });

  test('IPv6 is allow-listed to global unicast minus special ranges', () => {
    const blocked = [
      '::1',
      '::',
      'fe80::1',
      'fec0::1',
      'ff02::1',
      'fd00::1',
      'fc00::1',
      '2001:db8::1',
      '2001::1',
      '2001:1ff::1', // inside 2001::/23
      '2002::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::7f00:1',
      '64:ff9b::1', // NAT64 local-use
      '100::1', // discard-only
    ];
    for (const address of blocked) {
      assert.equal(isPublicAddress(address), false, `${address} must be refused`);
    }
    for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
      assert.equal(isPublicAddress(address), true, `${address} should be public`);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Write-path validation                                                        */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - stored base URL rules (validateModelBaseUrl)', () => {
  test('absent values stay absent', () => {
    assert.equal(validateModelBaseUrl(undefined), '');
    assert.equal(validateModelBaseUrl(null), '');
    assert.equal(validateModelBaseUrl(''), '');
    assert.equal(validateModelBaseUrl('   '), '');
  });

  test('ordinary public URLs are accepted verbatim (trimmed)', () => {
    assert.equal(
      validateModelBaseUrl('  https://api.openai.com/v1  '),
      'https://api.openai.com/v1'
    );
    assert.equal(validateModelBaseUrl('http://provider.example.test/v1'), 'http://provider.example.test/v1');
    assert.equal(validateModelBaseUrl('https://1.1.1.1/v1'), 'https://1.1.1.1/v1');
    assert.equal(validateModelBaseUrl('https://[2606:4700:4700::1111]/v1'), 'https://[2606:4700:4700::1111]/v1');
  });

  test('non-string values are refused', async () => {
    for (const value of [42, {}, [], true]) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /must be a string/);
    }
  });

  test('only http and https are supported', async () => {
    const rejected = [
      'ftp://provider.test/v1',
      'file:///etc/passwd',
      'file://provider.test/v1',
      'gopher://provider.test/v1',
      'ws://provider.test/v1',
      'javascript://provider.test/%0aalert(1)',
      'data:text/html,hi',
      'dict://provider.test:11211/',
      'jar:http://provider.test!/',
    ];
    for (const value of rejected) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /only http and https/);
    }
  });

  test('embedded credentials are refused', async () => {
    for (const value of [
      'https://user:password@provider.test/v1',
      'https://user@provider.test/v1',
      'http://:secret@provider.test/v1',
    ]) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /credentials/);
    }
  });

  test('query strings and fragments are refused on save', async () => {
    for (const value of [
      'https://provider.test/v1?x=1',
      'https://provider.test/v1#frag',
      'https://provider.test/v1?a=http://127.0.0.1/',
      'https://provider.test/?next=http://169.254.169.254/',
    ]) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /query strings and fragments/);
    }
  });

  test('malformed and absurdly long values are refused', async () => {
    for (const value of ['not a url', 'http://', 'https://', '/v1', '', '   ']) {
      if (value.trim() === '') continue;
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /malformed/);
    }
    const error = await expectBlocked(() => validateModelBaseUrl(`https://provider.test/${'a'.repeat(3000)}`));
    assertSafeMessage(error);
    assert.match(error.message, /longer than/);
  });

  test('non-public IP literals are refused, whatever spelling', async () => {
    const rejected = [
      'http://127.0.0.1/v1',
      'http://127.0.0.1:11434/v1',
      'https://0.0.0.0/v1',
      'http://10.0.0.5/v1',
      'http://172.16.0.1/v1',
      'http://192.168.1.10/v1',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/v1',
      'http://0x7f.0.0.1/v1',
      'http://2130706433/v1',
      'http://0177.0.0.1/v1',
      'http://0xa9.0xfe.0xa9.0xfe/latest/meta-data/',
      'http://127.0.0.1./v1',
      'http://[::1]/v1',
      'http://[fe80::1]/v1',
      'http://[fd00::1]/v1',
      'http://[::ffff:127.0.0.1]/v1',
      'http://[2001:db8::1]/v1',
      'http://[2002::1]/v1',
      'http://255.255.255.255/v1',
      'http://224.0.0.1/v1',
    ];
    for (const value of rejected) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /permitted public network address/);
    }
  });

  test('local and single-label hostnames are refused', async () => {
    const rejected = [
      'http://localhost:11434/v1',
      'http://LOCALHOST/v1',
      'http://localhost./v1',
      'http://api.localhost/v1',
      'http://printer.local/v1',
      'http://nas.localdomain/v1',
      'http://db.internal/v1',
      'http://router.home.arpa/v1',
      'http://intranet/v1',
      'http://openai/v1',
      'http://metadata.google.internal/computeMetadata/v1/',
    ];
    for (const value of rejected) {
      const error = await expectBlocked(() => validateModelBaseUrl(value));
      assertSafeMessage(error);
      assert.match(error.message, /permitted public network address/);
    }
  });

  test('the rejection carries no resolver detail for callers, but keeps it for logs', async () => {
    const error = await expectBlocked(() => validateModelBaseUrl('http://169.254.169.254/'));
    assertSafeMessage(error);
    assert.equal(typeof error.detail, 'string');
    assert.ok((error.detail as string).length > 0, 'server-side detail is retained for logs');
    assert.equal(error.reason, 'the destination is not a permitted public network address.');
  });

  test('findBlockedModelUrlError unwraps SDK-wrapped transport failures', () => {
    const blocked = new BlockedModelUrlError('the destination is not a permitted public network address.');
    const wrapped = Object.assign(new Error('Connection error.'), {
      name: 'APIConnectionError',
      cause: Object.assign(new Error('fetch failed'), { cause: blocked }),
    });
    assert.equal(findBlockedModelUrlError(wrapped), blocked);
    assert.equal(findBlockedModelUrlError(new Error('plain')), undefined);
    assert.equal(findBlockedModelUrlError(null), undefined);
    assert.equal(findBlockedModelUrlError({ cause: { cause: { cause: { cause: { cause: { cause: blocked } } } } } }), undefined, 'depth is bounded');
  });
});

/* -------------------------------------------------------------------------- */
/* Request-time destination checks                                              */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - request-time destination checks', () => {
  test('a hostname resolving to a private address is refused before any socket opens', async () => {
    stubDns(async () => [{ address: '127.0.0.1', family: 4 }]);
    const error = await expectBlocked(() =>
      safeModelFetch('https://evil.example.test/v1/chat/completions', { method: 'POST', body: '{}' })
    );
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 0, 'no socket must be opened');
  });

  test('a cloud metadata answer is refused', async () => {
    stubDns(async () => [{ address: '169.254.169.254', family: 4 }]);
    await expectBlocked(() => safeModelFetch('http://metadata.example.test/'));
    assert.equal(transport.calls.length, 0);
  });

  test('a mixed public/private answer set is refused, not filtered', async () => {
    stubDns(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    const error = await expectBlocked(() => safeModelFetch('https://mixed.example.test/'));
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 0, 'the private half must not be "used anyway"');
  });

  test('a failed lookup is refused with the same coarse message (no resolver oracle)', async () => {
    stubDns(async () => {
      const error: any = new Error('getaddrinfo ENOTFOUND evil.example.test');
      error.code = 'ENOTFOUND';
      throw error;
    });
    const error = await expectBlocked(() => safeModelFetch('https://evil.example.test/'));
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 0);
  });

  test('an empty answer set is refused', async () => {
    stubDns(async () => []);
    await expectBlocked(() => safeModelFetch('https://nowhere.example.test/'));
    assert.equal(transport.calls.length, 0);
  });

  test('the local-name and IP-literal checks run without touching DNS', async () => {
    let dnsCalls = 0;
    stubDns(async () => {
      dnsCalls += 1;
      return PUBLIC_DNS;
    });
    await expectBlocked(() => safeModelFetch('http://localhost:11434/v1'));
    await expectBlocked(() => safeModelFetch('http://10.0.0.1/v1'));
    assert.equal(dnsCalls, 0, 'local/IP-literal rules must not need a resolver round-trip');
  });

  test('a public hostname resolves once and the socket is pinned to that answer', async () => {
    const { hosts } = stubPublicDns();
    transport.handler = () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: '{"ok":true}' });

    const response = await safeModelFetch('https://api.example.test/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: '{"model":"x"}',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(hosts, ['api.example.test'], 'exactly one resolution per hop');

    const call = transport.calls[0];
    assert.equal(call.options.hostname, 'api.example.test');
    assert.equal(call.options.port, 443);
    assert.equal(call.options.protocol, 'https:');
    assert.equal(call.path, '/v1/chat/completions');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.authorization, 'Bearer secret');
    assert.equal(call.headers['content-length'], String(Buffer.byteLength('{"model":"x"}')));

    const lookup = call.options.lookup as any;
    assert.equal(typeof lookup, 'function', 'the connect must be pinned to the validated address');

    const all: any = await new Promise((resolve, reject) =>
      lookup('api.example.test', { all: true, hints: 0 }, (err: any, addrs: any) => (err ? reject(err) : resolve(addrs)))
    );
    assert.deepEqual(all, PUBLIC_DNS, 'lookup returns only the validated answers');

    const single: any = await new Promise((resolve, reject) =>
      lookup('api.example.test', {}, (err: any, address: any, family: any) =>
        err ? reject(err) : resolve({ address, family })
      )
    );
    assert.equal(single.address, PUBLIC_DNS[0].address);
    assert.equal(single.family, 4);

    const wrongName: any = await new Promise((resolve) =>
      lookup('rebound.example.test', { all: true }, (err: any, addrs: any) => resolve({ err, addrs }))
    );
    assert.ok(wrongName.err, 'the pinned lookup refuses a different hostname');
    assert.equal(wrongName.addrs, undefined);
  });

  test('an allow-listed local provider is dialed without DNS and without pinning', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'http://localhost:11434/v1';
    stubDns(async () => {
      throw new Error('DNS must not run for an allow-listed URL');
    });
    transport.handler = () => ({ status: 200, body: 'ok' });

    const response = await safeModelFetch('http://localhost:11434/v1/chat/completions', { method: 'POST', body: '{}' });
    assert.equal(response.status, 200);
    assert.equal(transport.calls.length, 1);
    assert.equal(transport.calls[0].options.hostname, 'localhost');
    assert.equal(transport.calls[0].options.port, 11434);
    assert.equal(transport.calls[0].options.lookup, undefined, 'no pinning for the operator-allow-listed path');
  });

  test('an already-aborted caller signal rejects without dialing', async () => {
    stubPublicDns();
    const controller = new AbortController();
    controller.abort();
    transport.handler = () => ({ hang: true });

    await assert.rejects(
      () => safeModelFetch('https://api.example.test/v1', { signal: controller.signal }),
      (error: any) => {
        assert.equal(error.name, 'AbortError');
        return true;
      }
    );
    assert.equal(transport.calls.length, 0, 'an aborted request must never reach the transport');
  });
});

/* -------------------------------------------------------------------------- */
/* Redirect policy                                                              */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - redirect policy', () => {
  test('a same-origin redirect is followed and keeps the authorization header', async () => {
    stubPublicDns();
    transport.handler = (_call, index) =>
      index === 0
        ? { status: 307, headers: { location: 'https://api.example.test/v2/responses' } }
        : { status: 200, body: '{"ok":true}' };

    const response = await safeModelFetch('https://api.example.test/v1/responses', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
      body: '{"x":1}',
    });

    assert.equal(response.status, 200);
    assert.equal(transport.calls.length, 2);
    assert.equal(transport.calls[1].path, '/v2/responses');
    assert.equal(transport.calls[1].headers.authorization, 'Bearer secret-token');
    assert.equal(transport.calls[1].method, 'POST', '307/308-style same-origin follow keeps the method');
    assert.equal(transport.calls[1].body, '{"x":1}');
    assert.equal(response.url, 'https://api.example.test/v2/responses');
  });

  test('a cross-origin redirect drops Authorization/Cookie but keeps the body on 307', async () => {
    stubPublicDns();
    transport.handler = (_call, index) =>
      index === 0
        ? {
            status: 307,
            headers: {
              location: 'https://other.example.test/collect',
              'set-cookie': 'sid=1',
            },
          }
        : { status: 200, body: '[]' };

    const response = await safeModelFetch('https://api.example.test/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', Cookie: 'session=abc', 'X-Keep': 'yes' },
      body: '{"leak":false}',
    });

    assert.equal(response.status, 200);
    assert.equal(transport.calls.length, 2);
    const hop = transport.calls[1];
    assert.equal(hop.options.hostname, 'other.example.test');
    assert.equal(hop.headers.authorization, undefined, 'the model API key must not follow a redirect to another origin');
    assert.equal(hop.headers.cookie, undefined);
    assert.equal(hop.headers['x-keep'], 'yes', 'unrelated headers survive');
    assert.equal(hop.method, 'POST', '307 preserves the method');
    assert.equal(hop.body, '{"leak":false}', '307 preserves the body');
  });

  test('301/302/303 turn a POST into a bodyless GET', async () => {
    stubPublicDns();
    transport.handler = (_call, index) =>
      index === 0 ? { status: 302, headers: { location: '/moved' } } : { status: 200, body: 'ok' };

    const response = await safeModelFetch('https://api.example.test/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
      body: '{"x":1}',
    });

    assert.equal(response.status, 200);
    const hop = transport.calls[1];
    assert.equal(hop.method, 'GET');
    assert.equal(hop.body, undefined, 'the POST body is not replayed');
    assert.equal(hop.headers['content-length'], undefined, 'no stale content-length on a bodyless request');
    assert.equal(hop.path, '/moved');
    assert.equal(hop.headers.authorization, 'Bearer secret-token', 'same origin keeps auth');
  });

  test('a redirect to a private address is refused and nothing further is dialed', async () => {
    stubPublicDns();
    transport.handler = () => ({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });

    const error = await expectBlocked(() =>
      safeModelFetch('https://api.example.test/v1', { headers: { Authorization: 'Bearer k' } })
    );
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 1, 'only the first hop was ever dialed');
  });

  test('a redirect to a local hostname is refused', async () => {
    stubPublicDns();
    transport.handler = () => ({ status: 307, headers: { location: 'http://localhost:9200/_cat/indices' } });
    await expectBlocked(() => safeModelFetch('https://api.example.test/v1'));
    assert.equal(transport.calls.length, 1);
  });

  test('a redirect that fails DNS resolution is refused', async () => {
    stubPublicDns();
    transport.handler = () => ({ status: 302, headers: { location: 'https://private-after-rebind.example.test/' } });
    stubDns(async (hostname) => {
      if (hostname === 'private-after-rebind.example.test') return [{ address: '192.168.1.1', family: 4 }];
      return PUBLIC_DNS;
    });
    await expectBlocked(() => safeModelFetch('https://api.example.test/v1'));
    assert.equal(transport.calls.length, 1);
  });

  test('redirects are bounded and the raw 3xx is returned to the caller', async () => {
    stubPublicDns();
    transport.handler = () => ({ status: 302, headers: { location: 'https://api.example.test/loop' } });

    const response = await safeModelFetch('https://api.example.test/v1');
    assert.equal(response.status, 302, 'the caller sees the 3xx once the hop budget is spent');
    assert.equal(response.headers.get('location'), 'https://api.example.test/loop');
    assert.equal(transport.calls.length, 4, 'one initial attempt + MAX_REDIRECTS follows');
  });

  test('an unparseable Location is not followed', async () => {
    stubPublicDns();
    transport.handler = () => ({ status: 302, headers: { location: 'http://' } });
    const response = await safeModelFetch('https://api.example.test/v1');
    assert.equal(response.status, 302);
    assert.equal(transport.calls.length, 1);
  });

  test('the allow-list cannot launder a redirect to a private host', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'http://localhost:8080/v1';
    stubDns(async () => {
      throw new Error('DNS must not run for an allow-listed URL');
    });
    transport.handler = () => ({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });

    const error = await expectBlocked(() => safeModelFetch('http://localhost:8080/v1/chat/completions'));
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 1, 'the allow-listed hop happened, the redirect did not');
  });
});

/* -------------------------------------------------------------------------- */
/* Operator allow-list                                                          */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - MODEL_URL_ALLOWLIST', () => {
  test('the allow-list is empty by default, so the shipped local preset is refused', async () => {
    delete process.env[MODEL_URL_ALLOWLIST_ENV];
    const error = await expectBlocked(() => validateModelBaseUrl('http://localhost:11434/v1'));
    assertSafeMessage(error);
    assert.equal(isAllowlistedModelUrl(new URL('http://localhost:11434/v1')), false);
  });

  test('an exact entry (with or without trailing slash) exempts only that base URL', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'http://localhost:11434/v1, https://gateway.corp.test:8443/openai/';

    assert.equal(validateModelBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
    assert.equal(validateModelBaseUrl(' http://localhost:11434/v1/ '), 'http://localhost:11434/v1/');
    assert.equal(validateModelBaseUrl('https://gateway.corp.test:8443/openai'), 'https://gateway.corp.test:8443/openai');

    // The SDK appends /chat/completions, so an entry covers exactly that
    // subtree and nothing else — no other port, host, scheme or sibling path.
    const covered = (value: string) => isAllowlistedModelUrl(new URL(value));
    assert.equal(covered('http://localhost:11434/v1/chat/completions'), true);
    assert.equal(covered('https://gateway.corp.test:8443/openai/chat/completions'), true);
    assert.equal(covered('http://localhost:11434/v2'), false, 'a sibling path is not covered');
    assert.equal(covered('http://localhost:9999/v1'), false, 'another port is not covered');
    assert.equal(covered('https://localhost:11434/v1'), false, 'another scheme is not covered');
    assert.equal(covered('https://gateway.corp.test:8443/openaix'), false, 'a sibling path is not covered');
    assert.equal(covered('http://gateway.corp.test:8443/openai'), false, 'another scheme is not covered');
    assert.equal(covered('http://other.test/v1'), false, 'another host is not covered');

    // Values no entry covers fall back to the ordinary destination/syntax rules.
    for (const value of [
      'http://localhost:9999/v1',
      'http://localhost:11434/v2',
      'http://127.0.0.1:11434/v1',
      'http://localhost:11434/v1?x=1',
      'http://user:pass@localhost:11434/v1',
    ]) {
      await expectBlocked(() => validateModelBaseUrl(value));
    }
  });

  test('malformed allow-list entries are ignored rather than opening a hole', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'not-a-url, *, file:///etc/passwd, ftp://x/,';
    await expectBlocked(() => validateModelBaseUrl('http://localhost:11434/v1'));
    await expectBlocked(() => validateModelBaseUrl('file:///etc/passwd'));
    await expectBlocked(() => validateModelBaseUrl('ftp://provider.test/v1'));
  });

  test('the allow-list exempts the destination check but never the syntax check', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'http://localhost:11434/v1';
    await expectBlocked(() => validateModelBaseUrl('https://localhost:11434/v1')); // different scheme/port
    await expectBlocked(() => validateModelBaseUrl('http://localhost:11434/v1#x'));
  });
});

/* -------------------------------------------------------------------------- */
/* callLLM integration                                                         */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - callLLM boundary', () => {
  function modelWith(baseUrl: string): IModel {
    return {
      provider: 'custom',
      displayName: 'Phase 23 Model',
      modelName: 'test-model',
      baseUrl,
      apiKey: 'sk-test-key',
      status: 'untested',
      enabled: true,
    } as unknown as IModel;
  }

  test('a private base URL is refused before any client is constructed', async () => {
    stubPublicDns();
    const error = await expectBlocked(() =>
      callLLM(modelWith('http://127.0.0.1:11434/v1'), [{ role: 'user', content: 'hi' }], { _test: true })
    );
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 0, 'no attempt, no retry, no socket');
  });

  test('a public-looking host that resolves private is refused without retries', async () => {
    stubDns(async () => [{ address: '10.0.0.9', family: 4 }]);
    const error = await expectBlocked(() =>
      callLLM(modelWith('https://looks-fine.example.test/v1'), [{ role: 'user', content: 'hi' }], { _test: true })
    );
    assertSafeMessage(error);
    assert.equal(transport.calls.length, 0, 'a blocked destination is not a retryable network error');
  });

  test('the guard message survives SDK wrapping instead of becoming a generic failure', async () => {
    stubDns(async () => [{ address: '192.168.0.10', family: 4 }]);
    try {
      await callLLM(modelWith('https://internal.example.test/v1'), [{ role: 'user', content: 'hi' }], { _test: true });
      assert.fail('expected a rejection');
    } catch (error: any) {
      assert.ok(error.message.startsWith(PREFIX), `got: ${error.message}`);
      assert.ok(!/LLM call failed after/.test(error.message), 'the retry wrapper must not swallow the guard message');
      assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(error.message), 'no address in the client message');
    }
  });

  test('a full round trip through the guarded fetch still works', async () => {
    stubPublicDns();
    transport.handler = () => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
      }),
    });

    const result = await callLLM(modelWith('https://api.example.test/v1'), [{ role: 'user', content: 'ping' }], {
      maxTokens: 16,
      _test: true,
    });

    assert.equal(result, 'OK');
    assert.equal(transport.calls.length, 1);
    const call = transport.calls[0];
    assert.equal(call.path, '/v1/chat/completions');
    assert.equal(call.method, 'POST');
    assert.equal(call.headers.authorization, 'Bearer sk-test-key');
    const sent = JSON.parse(call.body || '{}');
    assert.equal(sent.model, 'test-model');
    assert.equal(sent.stream, undefined, 'non-streaming response requested');
  });
});

/* -------------------------------------------------------------------------- */
/* API surface                                                                  */
/* -------------------------------------------------------------------------- */

describe('Phase 23 - /api/models write path', () => {
  let server: http.Server;
  let port: number;
  let userId: string;
  let token: string;

  async function request(
    path: string,
    opts: { method?: string; body?: any; token?: string } = {}
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = {};
    const useToken = opts.token === undefined ? token : opts.token;
    if (useToken) headers.Authorization = `Bearer ${useToken}`;
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }
    return { status: res.status, body: json };
  }

  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_URI);
    }
    await Model.deleteMany({});
    await User.deleteMany({});
    const user = await User.create({ email: 'phase23@test.local', name: 'Phase 23', passwordHash: 'x' });
    userId = String(user._id);
    token = await signToken(user);

    const app = express();
    app.use(express.json());
    app.use('/api/models', modelsRouter);
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as AddressInfo).port;
  });

  after(async () => {
    server?.close();
    await Model.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  test('POST refuses a private base URL with 400 and stores nothing', async () => {
    const before = await Model.countDocuments({ userId });
    const res = await request('/api/models', {
      method: 'POST',
      body: {
        provider: 'custom',
        displayName: 'Loopback',
        modelName: 'llama3',
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: 'sk-local',
      },
    });

    assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.error.startsWith(PREFIX), res.body.error);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(res.body.error), 'no address in the API error');
    assert.equal(await Model.countDocuments({ userId }), before, 'nothing was persisted');
  });

  test('POST refuses credentials, query strings and metadata IPs', async () => {
    const before = await Model.countDocuments({ userId });
    for (const baseUrl of [
      'https://user:pass@provider.test/v1',
      'https://provider.test/v1?debug=1',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:11434/v1',
      'file:///etc/passwd',
    ]) {
      const res = await request('/api/models', {
        method: 'POST',
        body: { displayName: 'Bad', modelName: 'm', baseUrl, apiKey: 'sk-x' },
      });
      assert.equal(res.status, 400, `${baseUrl} must be refused`);
      assert.ok(res.body.error.startsWith(PREFIX), res.body.error);
    }
    assert.equal(await Model.countDocuments({ userId }), before);
  });

  test('POST still accepts an ordinary public base URL', async () => {
    const before = await Model.countDocuments({ userId });
    const res = await request('/api/models', {
      method: 'POST',
      body: {
        provider: 'custom',
        displayName: 'Public',
        modelName: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-public',
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.baseUrl, 'https://api.openai.com/v1');
    assert.equal(await Model.countDocuments({ userId }), before + 1);
  });

  test('PUT cannot rewrite a stored base URL into private space', async () => {
    const created = await request('/api/models', {
      method: 'POST',
      body: { displayName: 'Updatable', modelName: 'm', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-a' },
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const id = created.body.id || created.body._id;
    assert.ok(id, `missing id in ${JSON.stringify(created.body)}`);

    const res = await request(`/api/models/${id}`, {
      method: 'PUT',
      body: { baseUrl: 'http://192.168.1.1/v1' },
    });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(res.body.error.startsWith(PREFIX), res.body.error);

    const stored = await Model.findById(id);
    assert.ok(stored);
    assert.equal(stored!.baseUrl, 'https://api.openai.com/v1', 'the stored URL is untouched after a refused update');
  });

  test('PUT accepts a public base URL change', async () => {
    const created = await request('/api/models', {
      method: 'POST',
      body: { displayName: 'Movable', modelName: 'm', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-b' },
    });
    const id = created.body.id || created.body._id;

    const res = await request(`/api/models/${id}`, {
      method: 'PUT',
      body: { baseUrl: 'https://gateway.example.test/openai/v1/' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.baseUrl, 'https://gateway.example.test/openai/v1/');
  });

  test('with an explicit allow-list entry the shipped local preset can be saved', async () => {
    process.env[MODEL_URL_ALLOWLIST_ENV] = 'http://localhost:11434/v1';
    const res = await request('/api/models', {
      method: 'POST',
      body: { displayName: 'Ollama', modelName: 'llama3', baseUrl: 'http://localhost:11434/v1', apiKey: 'sk-ollama' },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.baseUrl, 'http://localhost:11434/v1');
    delete process.env[MODEL_URL_ALLOWLIST_ENV];
  });

  test('authentication is unchanged: no token means 401', async () => {
    const before = await Model.countDocuments({ userId });
    const res = await request('/api/models', {
      method: 'POST',
      body: { displayName: 'Anon', modelName: 'm', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x' },
      token: '',
    });
    assert.equal(res.status, 401);
    assert.equal(await Model.countDocuments({ userId }), before, 'an unauthenticated write stores nothing');
  });

  test('POST /:id/test reports the guard message and never dials a private host', async () => {
    // Simulate a row written before this phase (validation only guards new writes).
    const legacy = await Model.create({
      userId,
      displayName: 'Legacy Loopback',
      modelName: 'llama3',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'sk-legacy',
      status: 'connected',
    });

    stubPublicDns();
    const res = await request(`/api/models/${String(legacy._id)}/test`, { method: 'POST' });

    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.ok(res.body.error.startsWith(PREFIX), res.body.error);
    assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(res.body.error), 'no address in the API error');
    assert.equal(res.body.success, false);
    assert.equal(transport.calls.length, 0, 'the legacy private base URL is never dialled');

    const fresh = await Model.findById(String(legacy._id));
    assert.equal(fresh!.status, 'error', 'the model is marked as failing');
  });

  test('other users cannot probe the guard through someone else’s model', async () => {
    const other = await User.create({ email: 'phase23-b@test.local', name: 'B', passwordHash: 'x' });
    const otherToken = await signToken(other);
    const target = await Model.create({
      userId,
      displayName: 'Owner Model',
      modelName: 'm',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-owner',
    });

    const res = await request(`/api/models/${String(target._id)}/test`, { method: 'POST', token: otherToken });
    assert.equal(res.status, 404, 'phase 22 ownership behaviour is unchanged');

    await User.deleteOne({ _id: String(other._id) });
  });
});
