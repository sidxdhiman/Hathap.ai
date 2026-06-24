"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callLLM = callLLM;
const openai_1 = __importDefault(require("openai"));
async function callLLM(model, messages, options = {}) {
    const apiKey = model.apiKey || process.env.OPENAI_API_KEY || 'fake-key';
    // Clean up baseURL to ensure it doesn't end with a trailing slash if openai library requires it
    let baseURL = model.baseUrl || undefined;
    if (baseURL && baseURL.endsWith('/')) {
        baseURL = baseURL.slice(0, -1);
    }
    const openai = new openai_1.default({
        apiKey,
        baseURL,
    });
    // Most modern models support response_format json_object
    // But let's build it so it handles any errors gracefully.
    const responseFormat = options.responseFormatJson ? { type: 'json_object' } : undefined;
    let retries = 0;
    const maxRetries = 2;
    while (retries <= maxRetries) {
        try {
            console.log(`[LLM Call] Model: ${model.displayName} (${model.modelName}) - Attempt ${retries + 1}`);
            const completion = await openai.chat.completions.create({
                model: model.modelName,
                messages,
                response_format: responseFormat,
                temperature: 0.7,
            });
            const responseContent = completion.choices[0]?.message?.content || '';
            console.log(`[LLM Response Success] Model: ${model.modelName}, Token usage:`, completion.usage);
            if (options.responseFormatJson) {
                // Attempt to parse to verify it is valid JSON
                JSON.parse(responseContent);
            }
            return responseContent;
        }
        catch (error) {
            console.error(`[LLM Error] Attempt ${retries + 1} failed:`, error.message);
            retries++;
            if (retries > maxRetries) {
                throw new Error(`LLM call failed after ${maxRetries + 1} attempts. Original error: ${error.message}`);
            }
            // Brief pause before retry
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }
    throw new Error('LLM call failed');
}
