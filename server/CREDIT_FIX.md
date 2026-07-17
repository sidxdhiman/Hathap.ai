# LLM Credit Issue - Fix Applied

## Problem
When starting a debate, you were getting HTTP 402 error:
```
LLM call failed after 3 attempts (HTTP 402). 402 This request requires more credits, or fewer max_tokens. You requested up to 16384 tokens, but can only afford 3996.
```

## Root Cause
- The `max_tokens` parameter was not being specified in the LLM call
- When undefined, OpenAI SDK defaults to **16,384 tokens**
- Your API account credits could only afford **3,996 tokens**
- The mismatch caused the 402 (Payment Required) error

## Solution Applied

### Change 1: Set Default max_tokens to 2000
**File**: `server/src/engine/agentRunner.ts`

Changed the LLM call to include `maxTokens: 2000`:
```typescript
// Before
const rawResponse = await callLLM(
  model,
  [...],
  { responseFormatJson: true }
);

// After
const rawResponse = await callLLM(
  model,
  [...],
  { responseFormatJson: true, maxTokens: 2000 }
);
```

**Why 2000?**
- Sufficient for structured JSON responses (position, arguments, risks, recommendation)
- Well within credit limits (leaves buffer)
- Balances quality vs. token economy
- Can be reduced further to 1000-1500 if needed

### Change 2: Better Error Messages for Credit Issues
**File**: `server/src/engine/llmClient.ts`

Added intelligent error message detection for HTTP 402 errors:
```
Credit Issue: Your API account has insufficient credits or cannot afford the 
max_tokens requested. Solutions:
1. Add credits to your API account
2. Reduce the number of agents in your debate (fewer agents = fewer API calls)
3. Reduce max_tokens in debate settings (if available)
4. Use a different, faster model that requires fewer tokens
5. Try using a local model via Ollama instead of an API-based model
```

## Testing the Fix

### To verify it works:
1. Restart your backend server: `npm run dev` (in server folder)
2. Start a new debate with 2-3 agents
3. Should complete successfully now
4. Check console logs for token usage

### If issues persist:

**Option A: Use even fewer tokens**
Edit `server/src/engine/agentRunner.ts` line 49:
```typescript
{ responseFormatJson: true, maxTokens: 1500 }  // Reduce to 1500
```

**Option B: Use fewer agents**
- Start with 2 agents instead of 4+
- Each agent = 1 API call
- 2 agents = ~4000 tokens (within limits)
- 4 agents = ~8000 tokens (over limits)

**Option C: Add credits to API account**
- Visit your API provider (OpenAI, OpenRouter, etc.)
- Upgrade to paid account or add credits
- This gives you unlimited token budget

**Option D: Use Ollama (local, free)**
- Install Ollama: https://ollama.ai
- Add local model via UI
- No API costs, runs on your machine

## How Token Economy Works

Each agent response uses approximately:
- **System prompt**: ~300 tokens (fixed)
- **User prompt + context**: ~800-1000 tokens (grows with debate history)
- **Response**: ~200-300 tokens

**Token cost per agent per round**: 1300-1600 tokens

**Total for a debate**:
- 2 agents × 2 rounds = ~5200 tokens ❌ Over limit (3996)
- 2 agents × 1 round = ~2600 tokens ✅ Within limit
- 3 agents × 1 round = ~3900 tokens ✅ Just within limit

## Files Modified
- ✅ `server/src/engine/agentRunner.ts` - Added maxTokens parameter
- ✅ `server/src/engine/llmClient.ts` - Better error handling

## Next Steps
1. Pull/deploy these changes
2. Restart backend server
3. Try starting a debate again
4. Report back if issues persist

---

**Note**: These changes are permanent. The 2000 token limit is reasonable for debate responses and should work for most use cases. Adjust if needed based on your specific requirements.
