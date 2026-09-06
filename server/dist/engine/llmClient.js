"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLLM = callLLM;
const openai_1 = __importDefault(require("openai"));
const encryption_1 = require("../utils/encryption");
const usage_1 = require("../decision/usage");
async function callLLM(model, messages, options = {}) {
    const startedAt = Date.now();
    const storedKey = model.apiKey || process.env.OPENAI_API_KEY || '';
    const apiKey = storedKey && (0, encryption_1.isEncrypted)(storedKey) ? (0, encryption_1.decryptApiKey)(storedKey) : storedKey;
    if (!apiKey || apiKey === 'fake-key') {
        throw new Error(`No API key configured for model "${model.displayName}".`);
    }
    if (!model.modelName || !model.modelName.trim()) {
        throw new Error(`Model "${model.displayName}" has no model identifier configured. Open the Models page and set the actual model name (e.g. gpt-4o, claude-3-5-sonnet-20241022).`);
    }
    // Clean up baseURL to ensure it doesn't end with a trailing slash if openai library requires it
    let baseURL = model.baseUrl || undefined;
    if (baseURL && baseURL.endsWith('/')) {
        baseURL = baseURL.slice(0, -1);
    }
    const openai = new openai_1.default({
        apiKey,
        baseURL,
        // Many proxies and OpenRouter reject the default keep-alive streaming response
        // with a "Premature close" error. The OpenAI SDK defaults to streaming, which
        // we don't need for single-shot calls. Disable max-timeout issues and force
        // a complete response.
        maxRetries: 0,
        timeout: 30 * 1000,
        // OpenRouter recommends (and effectively requires for free-tier models)
        // these identification headers so requests aren't throttled or rejected
        // as anonymous traffic.
        defaultHeaders: {
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
            'X-Title': 'Hathap.AI',
        },
    });
    const responseFormat = options.responseFormatJson ? { type: 'json_object' } : undefined;
    // Test endpoint: exactly one attempt, no retries. Real debates get up to 2 retries
    // because flaky upstream providers are part of life in production. Tests should
    // fail fast so the user can see what's wrong and try a different model.
    let retries = 0;
    const maxRetries = options._test ? 0 : 2;
    while (retries <= maxRetries) {
        try {
            console.log(`[LLM Call] provider=${model.provider || '(unset)'} displayName="${model.displayName}" modelName="${model.modelName}" baseUrl="${model.baseUrl || '(default)'}" - Attempt ${retries + 1}`);
            const completion = await openai.chat.completions.create({
                model: model.modelName,
                messages,
                response_format: responseFormat,
                temperature: 0.7,
                max_tokens: options.maxTokens,
            }, 
            // Force a non-streamed response so the OpenAI SDK reads the full body before
            // returning. Some providers (OpenRouter, Google OpenAI-compat) close the
            // connection mid-stream and surface that as "Premature close".
            { stream: false });
            const responseContent = completion.choices[0]?.message?.content || '';
            console.log(`[LLM Response Success] Model: ${model.modelName}, Token usage:`, completion.usage);
            if (options.onUsage && completion.usage) {
                const latencyMs = Date.now() - startedAt;
                const usage = (0, usage_1.recordUsage)({
                    inputTokens: completion.usage.prompt_tokens || 0,
                    outputTokens: completion.usage.completion_tokens || 0,
                    model: model.modelName,
                    provider: model.provider || 'unknown',
                    latencyMs,
                });
                options.onUsage(usage);
            }
            if (options.responseFormatJson) {
                // Attempt to parse to verify it is valid JSON
                JSON.parse(responseContent);
            }
            return responseContent;
        }
        catch (error) {
            // Surface useful diagnostic info: HTTP status, response body, error type.
            const status = error?.status || error?.response?.status;
            const body = error?.error || error?.response?.data || error?.body;
            const errorName = error?.name || error?.constructor?.name;
            const diagnostic = {
                status,
                body: typeof body === 'string' ? body.slice(0, 500) : body,
                type: errorName,
                message: error?.message,
                cause: error?.cause?.message || error?.cause?.code,
            };
            console.error(`[LLM Error] Attempt ${retries + 1} failed:`, JSON.stringify(diagnostic, null, 2));
            // The OpenAI SDK wraps upstream errors in a way that drops the response
            // body. For "Premature close" from providers like OpenRouter / Google
            // OpenAI-compat, the actual cause is in the HTTP body that got cut off.
            // Make one raw fetch call (no retries, no SDK) so we can read the body
            // and tell the user what's really wrong.
            if (retries === 0 &&
                /Premature close|Invalid response body|fetch failed/i.test(error?.message || '')) {
                try {
                    const raw = await fetch(`${baseURL}/chat/completions`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${apiKey}`,
                            'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
                            'X-Title': 'Hathap.AI',
                        },
                        body: JSON.stringify({
                            model: model.modelName,
                            messages: [{ role: 'user', content: 'ping' }],
                            max_tokens: 8,
                            stream: false,
                        }),
                    });
                    const rawBody = await raw.text();
                    console.error(`[LLM Raw Response] status=${raw.status} body=${rawBody.slice(0, 800)}`);
                    if (raw.status >= 400) {
                        let parsed = rawBody;
                        try {
                            parsed = JSON.parse(rawBody);
                        }
                        catch {
                            /* keep raw text */
                        }
                        const providerMessage = parsed?.error?.message || parsed?.message || rawBody.slice(0, 200) || '(empty body)';
                        throw new Error(`Provider ${model.provider || ''} returned HTTP ${raw.status}: ${providerMessage}`.trim());
                    }
                }
                catch (rawErr) {
                    // If the raw fetch also fails, fall through to the normal retry/error path.
                    if (rawErr?.message?.startsWith('Provider'))
                        throw rawErr;
                    console.error(`[LLM Raw Fetch failed] ${rawErr?.message || rawErr}`);
                }
            }
            // If the error is a network/connection issue, retrying won't help.
            const isNetworkError = errorName === 'APIConnectionError' || /Premature close|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT/i.test(error?.message || '');
            if (isNetworkError && retries < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                retries++;
                continue;
            }
            if (retries >= maxRetries) {
                const reason = status ? `HTTP ${status}` : errorName || 'unknown error';
                // Provide better error message for common credit/token issues
                let detailedMessage = '';
                if (status === 402) {
                    detailedMessage = '\n\nCredit Issue: Your API account has insufficient credits or cannot afford the max_tokens requested. Solutions:\n' +
                        '1. Add credits to your API account\n' +
                        '2. Reduce the number of agents in your debate (fewer agents = fewer API calls)\n' +
                        '3. Reduce max_tokens in debate settings (if available)\n' +
                        '4. Use a different, faster model that requires fewer tokens\n' +
                        '5. Try using a local model via Ollama instead of an API-based model';
                }
                throw new Error(`LLM call failed after ${maxRetries + 1} attempts (${reason}). ` +
                    (typeof body === 'string' ? body : error?.message || 'No further details.') +
                    detailedMessage);
            }
            retries++;
            // Brief pause before retry
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    throw new Error('LLM call failed');
}
