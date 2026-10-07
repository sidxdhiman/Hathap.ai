import http from 'http';
import https from 'https';
import net from 'net';
import dns from 'dns';

/**
 * Phase 23 — SSRF guard for user-controlled model provider URLs.
 *
 * `Model.baseUrl` is untrusted input. Being authorized to create or edit a
 * model does NOT make the destination safe for the server to connect to, so
 * every outbound provider request goes through `safeModelFetch`, which:
 *
 *  1. parses with the platform WHATWG URL parser, so alternate IPv4 spellings
 *     (`0x7f.0.0.1`, `2130706433`, `127.0.0.1.`) normalise to what they
 *     really are before any check runs;
 *  2. enforces the URL rules: `http`/`https` only, no embedded credentials,
 *     and (on the write path) no query string or fragment;
 *  3. resolves the hostname exactly once, requires EVERY answer to be a public
 *     address, and pins the socket to the address that was validated through a
 *     custom `lookup`. The connect therefore cannot re-resolve the name —
 *     there is no validate-then-rebind (TOCTOU) window to win;
 *  4. refuses redirect targets that fail the same checks (max 3 hops), and
 *     drops `Authorization`/`Cookie` when a redirect changes origin.
 *
 * `validateModelBaseUrl` is the fast, DNS-free check used on the write path
 * (`POST`/`PUT /api/models`). The network-destination check always runs again
 * at request time, inside `safeModelFetch`, because a stored hostname can
 * change what it resolves to after it was saved.
 *
 * Residual limitations (what this does NOT stop) are documented in the
 * Phase 23 section of `docs/SECURITY_AUDIT_REPORT.md` and in `todos.md`.
 */

/** Operator escape hatch: exact model base URLs exempt from the destination check. */
export const MODEL_URL_ALLOWLIST_ENV = 'MODEL_URL_ALLOWLIST';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30 * 1000;
const MAX_URL_LENGTH = 2048;

const MESSAGE_PREFIX = 'Model provider URL rejected: ';

/**
 * Client-facing rejection reasons. They are deliberately coarse: a destination
 * failure never says whether the name resolved, which address it resolved to,
 * or which check fired, so a caller cannot use the error text as an internal
 * DNS/network oracle. The specific cause is logged server-side instead.
 */
const REASON = {
  notAString: 'the value must be a string.',
  tooLong: `the URL is longer than ${MAX_URL_LENGTH} characters.`,
  malformed: 'the URL is malformed.',
  protocol: 'only http and https URLs are supported.',
  credentials: 'embedded username/password credentials are not permitted.',
  queryOrFragment: 'query strings and fragments are not permitted when saving a model.',
  destination: 'the destination is not a permitted public network address.',
} as const;

/**
 * A model URL was refused. `message` is safe to return to the API client; it
 * never contains a resolved address, a resolver error, a stack or a credential.
 * `detail` is server-log only.
 */
export class BlockedModelUrlError extends Error {
  readonly reason: string;
  readonly detail?: string;

  constructor(reason: string, detail?: string) {
    super(`${MESSAGE_PREFIX}${reason}`);
    this.name = 'BlockedModelUrlError';
    this.reason = reason;
    this.detail = detail;
  }
}

export function isBlockedModelUrlError(value: unknown): value is BlockedModelUrlError {
  return (
    value instanceof BlockedModelUrlError ||
    (typeof value === 'object' &&
      value !== null &&
      (value as { name?: unknown }).name === 'BlockedModelUrlError')
  );
}

/**
 * The OpenAI SDK wraps a transport failure in `APIConnectionError`, keeping the
 * original error on `cause`. Walk that chain so callers can surface the safe
 * guard message instead of a generic "connection error".
 */
export function findBlockedModelUrlError(value: unknown, depth = 0): BlockedModelUrlError | undefined {
  if (value === null || typeof value !== 'object' || depth > 5) return undefined;
  if (isBlockedModelUrlError(value)) return value;
  const err = value as { cause?: unknown; originalError?: unknown; error?: unknown };
  return (
    findBlockedModelUrlError(err.cause, depth + 1) ||
    findBlockedModelUrlError(err.originalError, depth + 1) ||
    findBlockedModelUrlError(err.error, depth + 1)
  );
}

function logBlocked(hostname: string, detail: string): void {
  // The hostname comes from user input; keep it single-line before logging.
  const safeHost = hostname.replace(/[^\w.:[\]-]/g, '?');
  console.warn(`[model-url-guard] blocked provider host="${safeHost}" (${detail})`);
}

/* -------------------------------------------------------------------------- */
/* Address classification                                                      */
/* -------------------------------------------------------------------------- */

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/**
 * IANA IPv4 special-purpose space that must never be dialled by a
 * server-controlled outbound integration: this-network, RFC1918, CGNAT,
 * loopback, link-local (cloud metadata), IETF/TEST-NET/benchmarking/6to4
 * relays, multicast and the reserved+broadcast block.
 */
const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
];

const BLOCKED_IPV4_RANGES = BLOCKED_IPV4_CIDRS.map((cidr) => {
  const [base, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  const netValue = ipv4ToNumber(base) as number;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { mask: mask >>> 0, net: (netValue & mask) >>> 0 };
});

function isPublicIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  if (value === null) return false;
  return !BLOCKED_IPV4_RANGES.some((range) => (value & range.mask) >>> 0 === range.net);
}

function ipv6ToBytes(address: string): number[] | null {
  let text = address;
  let tail: number[] = [];

  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon < 0) return null;
    const embedded = ipv4ToNumber(text.slice(lastColon + 1));
    if (embedded === null) return null;
    tail = [(embedded >>> 24) & 255, (embedded >>> 16) & 255, (embedded >>> 8) & 255, embedded & 255];
    text = text.slice(0, lastColon + 1);
  }

  let headParts: string[];
  let tailParts: string[];
  const doubleColon = text.indexOf('::');
  if (doubleColon >= 0) {
    const before = text.slice(0, doubleColon);
    let after = text.slice(doubleColon + 2);
    if (after.endsWith(':')) after = after.slice(0, -1);
    headParts = before === '' ? [] : before.split(':');
    tailParts = after === '' ? [] : after.split(':');
  } else {
    headParts = text.split(':');
    tailParts = [];
  }

  const filler = 8 - headParts.length - tailParts.length - (tail.length > 0 ? 2 : 0);
  if (filler < 0) return null;

  const words: number[] = [];
  for (const group of [...headParts, ...new Array<string>(filler).fill('0'), ...tailParts]) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    words.push(parseInt(group, 16));
  }
  // 8 groups of 16 bits, minus the two consumed by an embedded IPv4 literal.
  if (words.length !== (tail.length > 0 ? 6 : 8)) return null;

  const bytes: number[] = [];
  for (const word of words) {
    bytes.push((word >> 8) & 255, word & 255);
  }
  const full = [...bytes, ...tail];
  return full.length === 16 ? full : null;
}

/**
 * IPv6 is allow-listed: only `2000::/3` global unicast is reachable, minus the
 * special sub-ranges inside it (2001::/23 IETF protocol assignments — Teredo,
 * ORCHID, benchmarking, AMT, AS112 — 2001:db8::/32 documentation and
 * 2002::/16 6to4). Everything else (loopback, link-local, unique-local,
 * multicast, unspecified, site-local, NAT64 local-use, documentation) is
 * refused. IPv4-mapped and IPv4-compatible addresses are judged by the
 * embedded IPv4 address instead, so `::ffff:127.0.0.1` cannot slip through.
 */
function isPublicIpv6(ip: string): boolean {
  const bytes = ipv6ToBytes(ip);
  if (!bytes || bytes.length !== 16) return false;

  const isZeroRange = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);

  if (isZeroRange(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }
  if (isZeroRange(0, 12)) {
    return isPublicIpv4(`${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`);
  }

  if ((bytes[0] & 0xe0) !== 0x20) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] <= 0x01) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return false;
  return true;
}

/**
 * True only for addresses a server-side integration is allowed to dial.
 * Returns false for anything that is not a syntactically valid IP literal.
 */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

/* -------------------------------------------------------------------------- */
/* Hostname rules                                                              */
/* -------------------------------------------------------------------------- */

/** Strip URL brackets, trailing DNS root dots and case before any check. */
function normalizeHostname(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  while (host.endsWith('.')) host = host.slice(0, -1);
  return host;
}

const LOCAL_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.home.arpa'];

/**
 * Names that are local by definition. This is a fast-fail convenience, not
 * the security boundary: DNS resolution at request time is what actually
 * decides, so a name that is not on this list still cannot reach a private
 * address.
 */
function isLocalHostname(hostname: string): boolean {
  for (const suffix of LOCAL_HOSTNAME_SUFFIXES) {
    const bare = suffix.slice(1);
    if (hostname === bare || hostname.endsWith(suffix)) return true;
  }
  return !hostname.includes('.');
}

/* -------------------------------------------------------------------------- */
/* URL parsing / validation                                                    */
/* -------------------------------------------------------------------------- */

interface ParsedModelUrl {
  url: URL;
  hostname: string;
}

function parseModelUrlString(raw: string, strict: boolean): ParsedModelUrl {
  if (raw.length > MAX_URL_LENGTH) throw new BlockedModelUrlError(REASON.tooLong);

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedModelUrlError(REASON.malformed);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedModelUrlError(REASON.protocol);
  }
  if (url.username !== '' || url.password !== '') {
    throw new BlockedModelUrlError(REASON.credentials);
  }
  if (strict && (url.search !== '' || url.hash !== '')) {
    throw new BlockedModelUrlError(REASON.queryOrFragment);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new BlockedModelUrlError(REASON.malformed);

  return { url, hostname };
}

/**
 * Destination rules that need no DNS: an IP literal must already be public,
 * and a local/single-label name is refused outright. Called on the write path
 * and again before every request.
 */
function assertDestinationWithoutDns(parsed: ParsedModelUrl): void {
  const { hostname } = parsed;
  const family = net.isIP(hostname);
  if (family !== 0) {
    if (!isPublicAddress(hostname)) {
      logBlocked(hostname, 'IP literal outside public address space');
      throw new BlockedModelUrlError(REASON.destination, `non-public ${family === 4 ? 'IPv4' : 'IPv6'} literal`);
    }
    return;
  }
  if (isLocalHostname(hostname)) {
    logBlocked(hostname, 'local or single-label hostname');
    throw new BlockedModelUrlError(REASON.destination, 'local hostname');
  }
}

/* -------------------------------------------------------------------------- */
/* DNS                                                                         */
/* -------------------------------------------------------------------------- */

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type ModelUrlDnsLookup = (hostname: string) => Promise<ResolvedAddress[]>;

const systemLookup: ModelUrlDnsLookup = async (hostname) => {
  const answers = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => ({ address: answer.address, family: answer.family }));
};

let dnsLookup: ModelUrlDnsLookup = systemLookup;

/** @internal test seam — replaces DNS resolution. Pass null to restore. */
export function setModelUrlDnsLookupForTests(lookup: ModelUrlDnsLookup | null): void {
  dnsLookup = lookup ?? systemLookup;
}

/** @internal test seam — restore the real resolver. */
export function resetModelUrlDnsLookupForTests(): void {
  dnsLookup = systemLookup;
}

/**
 * Resolve and validate. Every answer must be public: a mixed public/private
 * answer set is refused outright rather than "picking the good one", because
 * a client that reorders answers must not be able to steer the connection.
 * Failure modes (NXDOMAIN, timeout, private answer) all collapse into the same
 * client-facing reason so the error text is not a resolver oracle.
 */
async function resolvePublicAddresses(parsed: ParsedModelUrl): Promise<ResolvedAddress[]> {
  const { hostname } = parsed;

  const family = net.isIP(hostname);
  if (family !== 0) return [{ address: hostname, family }];

  let answers: ResolvedAddress[];
  try {
    answers = await dnsLookup(hostname);
  } catch (error: any) {
    logBlocked(hostname, `resolver error ${error?.code || error?.name || 'lookup failed'}`);
    throw new BlockedModelUrlError(REASON.destination, `resolver error ${error?.code || 'lookup failed'}`);
  }

  const normalized = answers
    .filter((answer) => answer && typeof answer.address === 'string')
    .map((answer) => ({
      address: normalizeHostname(answer.address),
      family: answer.family || net.isIP(answer.address),
    }));

  if (normalized.length === 0) {
    logBlocked(hostname, 'no addresses returned');
    throw new BlockedModelUrlError(REASON.destination, 'no addresses returned');
  }

  const invalid = normalized.filter((answer) => !isPublicAddress(answer.address));
  if (invalid.length > 0) {
    logBlocked(hostname, `resolved=[${normalized.map((a) => a.address).join(', ')}] non-public=[${invalid.map((a) => a.address).join(', ')}]`);
    throw new BlockedModelUrlError(REASON.destination, 'non-public address in resolver answer');
  }

  return normalized;
}

/* -------------------------------------------------------------------------- */
/* Operator allow-list                                                         */
/* -------------------------------------------------------------------------- */

function canonicalModelUrl(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

let warnedMalformedAllowlistEntry = false;

function allowlistEntries(): Set<string> {
  const raw = process.env[MODEL_URL_ALLOWLIST_ENV] || '';
  const entries = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      entries.add(canonicalModelUrl(parseModelUrlString(trimmed, true).url));
    } catch {
      if (!warnedMalformedAllowlistEntry) {
        warnedMalformedAllowlistEntry = true;
        console.warn(
          `[model-url-guard] ignoring a malformed entry in ${MODEL_URL_ALLOWLIST_ENV}; ` +
            'entries must be exact http(s) base URLs such as http://localhost:11434/v1'
        );
      }
    }
  }
  return entries;
}

/**
 * Exact-match exemption for operators who intentionally run a model provider
 * on a local/private address (the shipped "Ollama (local)" preset). Default is
 * empty, so every environment rejects private destinations until someone
 * explicitly opts in.
 *
 * An entry is the canonical `origin + path` of a base URL (trailing slashes
 * stripped). It matches that exact URL and anything beneath it, because the
 * SDK appends `/chat/completions` to the base; `http://localhost:11434/v1`
 * therefore permits `http://localhost:11434/v1/chat/completions` and nothing
 * else — no other host, port, or a sibling path such as `/v12`. There is no
 * wildcard syntax: a malformed entry never matches anything.
 *
 * The entry only exempts the network destination. Syntactic rules (http/https,
 * no embedded credentials, no query/fragment on the stored value) still apply,
 * and redirect targets are checked independently — an allow-listed base URL
 * cannot launder a redirect to a host the operator never named.
 */
export function isAllowlistedModelUrl(url: URL): boolean {
  const raw = process.env[MODEL_URL_ALLOWLIST_ENV];
  if (!raw || raw.trim() === '') return false;
  const canonical = canonicalModelUrl(url);
  for (const entry of allowlistEntries()) {
    if (canonical === entry || canonical.startsWith(`${entry}/`)) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Public validation entry points                                              */
/* -------------------------------------------------------------------------- */

/**
 * Write-path validation for `Model.baseUrl` (no DNS, so saving stays fast and
 * deterministic). Returns the trimmed value, or `''` when the field is absent
 * or empty. Throws `BlockedModelUrlError` for anything the server must refuse.
 *
 * A hostname that only becomes non-public after resolution is caught later,
 * when the request is actually made.
 */
export function validateModelBaseUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new BlockedModelUrlError(REASON.notAString);

  const trimmed = value.trim();
  if (trimmed === '') return '';

  const parsed = parseModelUrlString(trimmed, true);
  if (!isAllowlistedModelUrl(parsed.url)) assertDestinationWithoutDns(parsed);
  return trimmed;
}

interface RequestTarget {
  hostname: string;
  /** null when the operator allow-list exempts this URL from destination checks. */
  addresses: ResolvedAddress[] | null;
}

/** Full request-time check: syntax, then (unless allow-listed) DNS + addresses. */
async function assertModelUrlAllowedForRequest(url: URL): Promise<RequestTarget> {
  const hostname = normalizeHostname(url.hostname);
  if (!hostname) throw new BlockedModelUrlError(REASON.malformed);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedModelUrlError(REASON.protocol);
  }
  if (url.username !== '' || url.password !== '') {
    throw new BlockedModelUrlError(REASON.credentials);
  }

  if (isAllowlistedModelUrl(url)) return { hostname, addresses: null };

  const parsed: ParsedModelUrl = { url, hostname };
  assertDestinationWithoutDns(parsed);
  const addresses = await resolvePublicAddresses(parsed);
  return { hostname, addresses };
}

/* -------------------------------------------------------------------------- */
/* Outbound transport                                                          */
/* -------------------------------------------------------------------------- */

export interface ModelTransportRequestLike {
  on(event: 'error', listener: (error: Error) => void): unknown;
  end(chunk?: unknown): void;
}

export interface ModelHttpTransport {
  request(
    options: http.RequestOptions,
    onResponse: (response: http.IncomingMessage) => void
  ): ModelTransportRequestLike;
}

/**
 * The HTTP clients `safeModelFetch` issues requests through.
 *
 * @internal test seam — tests substitute a deterministic responder here so the
 * allow-path and redirect rules can be exercised without the internet. Nothing
 * outside this module and the test suite writes to it.
 */
export const modelFetchTransport: { http: ModelHttpTransport; https: ModelHttpTransport } = {
  http: {
    request: (options, onResponse) => http.request(options, onResponse),
  },
  https: {
    request: (options, onResponse) => https.request(options, onResponse),
  },
};

/**
 * A `lookup` that can only ever return the addresses that were just validated
 * for this exact hostname. Node calls it immediately before `connect`, so the
 * socket goes to the validated address: a name re-resolving to something else
 * between check and connect cannot change where the connection lands.
 */
function pinnedLookup(hostname: string, addresses: ResolvedAddress[]) {
  return (lookupHostname: string, options: any, callback: any): void => {
    const requested = normalizeHostname(lookupHostname);
    const valid = addresses.filter((answer) => isPublicAddress(answer.address));
    if (requested !== hostname || valid.length === 0) {
      process.nextTick(callback, new Error('hostname resolution was refused by the model URL guard'));
      return;
    }
    if (options && options.all) {
      process.nextTick(callback, null, valid);
      return;
    }
    // Node's lookup callback is `(err, address, family)` — the error slot is
    // mandatory, so a success must still pass `null` first.
    process.nextTick(callback, null, valid[0].address, valid[0].family);
  };
}

interface GuardedResponse {
  status: number;
  statusText: string;
  headers: Headers;
  bodyText: string;
  url: string;
}

function collectResponse(response: http.IncomingMessage, requestUrl: string): Promise<GuardedResponse> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    response.on('error', reject);
    response.on('aborted', () => reject(new Error('The provider response was aborted')));
    response.on('end', () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers || {})) {
        if (value === undefined) continue;
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else headers.append(name, value);
      }
      resolve({
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? '',
        headers,
        bodyText: Buffer.concat(chunks).toString('utf8'),
        url: requestUrl,
      });
    });
  });
}

function toFetchResponse(guarded: GuardedResponse): Response {
  const response = {
    status: guarded.status,
    statusText: guarded.statusText,
    ok: guarded.status >= 200 && guarded.status < 300,
    url: guarded.url,
    headers: guarded.headers,
    body: null,
    redirected: false,
    type: 'basic',
    text: async () => guarded.bodyText,
    json: async () => JSON.parse(guarded.bodyText),
    arrayBuffer: async () => new Uint8Array(Buffer.from(guarded.bodyText, 'utf8')).buffer,
    formData: async () => {
      throw new Error('formData() is not supported by the model provider fetch');
    },
    blob: async () => {
      throw new Error('blob() is not supported by the model provider fetch');
    },
    clone: () => {
      throw new Error('clone() is not supported by the model provider fetch');
    },
  };
  return response as unknown as Response;
}

function normalizeHeaders(init: HeadersInit | undefined | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!init) return headers;

  if (!Array.isArray(init) && typeof (init as Headers).forEach === 'function') {
    (init as Headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    return headers;
  }
  if (Array.isArray(init)) {
    for (const pair of init) {
      if (pair && pair.length >= 2 && pair[1] !== undefined) {
        headers[String(pair[0]).toLowerCase()] = String(pair[1]);
      }
    }
    return headers;
  }
  for (const [name, value] of Object.entries(init as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    headers[name.toLowerCase()] = String(value);
  }
  return headers;
}

function normalizeBody(body: unknown): Buffer | string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body;
  if (ArrayBuffer.isView(body)) {
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof URLSearchParams) return body.toString();
  throw new Error('Unsupported request body for a model provider request.');
}

function applyContentLength(headers: Record<string, string>, body: Buffer | string | undefined): void {
  if (body === undefined) {
    delete headers['content-length'];
    return;
  }
  headers['content-length'] = String(Buffer.byteLength(body));
}

async function performRequest(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | string | undefined,
  externalSignal: AbortSignal | null | undefined,
  timeoutMs: number
): Promise<GuardedResponse> {
  const target = await assertModelUrlAllowedForRequest(url);
  const isHttps = url.protocol === 'https:';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    // An already-cancelled caller must not reach the transport at all.
    if (controller.signal.aborted) {
      const abortError = new Error('The provider request was aborted by the caller');
      abortError.name = 'AbortError';
      throw abortError;
    }

    const options: https.RequestOptions = {
      protocol: url.protocol,
      hostname: target.hostname,
      host: target.hostname,
      port: url.port ? Number(url.port) : isHttps ? 443 : 80,
      path: `${url.pathname}${url.search}`,
      method,
      headers,
      signal: controller.signal,
      ...(target.addresses ? { lookup: pinnedLookup(target.hostname, target.addresses) } : {}),
      ...(isHttps && net.isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
    };

    const transport = isHttps ? modelFetchTransport.https : modelFetchTransport.http;

    return await new Promise<GuardedResponse>((resolve, reject) => {
      const request = transport.request(options, (response) => {
        collectResponse(response, url.toString()).then(resolve, reject);
      });
      request.on('error', (error: Error) => {
        if (controller.signal.aborted) {
          const abortError = new Error('The provider request timed out');
          abortError.name = 'AbortError';
          reject(abortError);
          return;
        }
        reject(error);
      });
      request.end(body);
    });
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Statuses that must not replay a POST body when followed. */
const REMETHOD_STATUSES = new Set([301, 302, 303]);

/**
 * The single outbound entry point for model provider traffic.
 *
 * Behaviour contract:
 *  - never dials a non-public destination (see the module header);
 *  - does not silently follow a redirect to somewhere that would not have been
 *    allowed in the first place — the redirect target goes through the exact
 *    same checks, and after `MAX_REDIRECTS` hops the raw 3xx is returned to
 *    the caller instead of following it;
 *  - drops `authorization`/`cookie`/`proxy-authorization` on a cross-origin
 *    redirect so a provider cannot forward the model API key to another host;
 *  - rejects with `BlockedModelUrlError` (safe message) rather than leaking a
 *    socket error, and enforces its own 30s timeout as well as the caller's
 *    `AbortSignal`.
 */
export async function safeModelFetch(url: RequestInfo, init?: RequestInit): Promise<Response> {
  const rawInput = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
  let current = parseModelUrlString(String(rawInput), false).url;
  let method = (init?.method || 'GET').toUpperCase();
  const headers = normalizeHeaders(init?.headers);
  let body = normalizeBody(init?.body);

  for (let hop = 0; ; hop++) {
    applyContentLength(headers, body);
    const guarded = await performRequest(current, method, headers, body, init?.signal, DEFAULT_TIMEOUT_MS);

    const location = guarded.headers.get('location');
    if (!REDIRECT_STATUSES.has(guarded.status) || !location || hop >= MAX_REDIRECTS) {
      return toFetchResponse(guarded);
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return toFetchResponse(guarded);
    }

    if (REMETHOD_STATUSES.has(guarded.status) && method !== 'GET' && method !== 'HEAD') {
      method = 'GET';
      body = undefined;
      delete headers['content-length'];
    }
    if (next.origin !== current.origin) {
      delete headers['authorization'];
      delete headers['cookie'];
      delete headers['proxy-authorization'];
    }
    current = next;
  }
}
