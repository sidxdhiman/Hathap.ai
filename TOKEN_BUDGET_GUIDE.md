# 🎯 Token Budget & Credit Management Guide

## Quick Start

### Before You Start a Debate:
1. Go to **Models page** 
2. Look for the **"💡 Token Budget & Debate Planning"** card
3. Check how many agents you can use safely
4. Plan your debate accordingly

### If You Get a Credit Error:
1. Error message appears at top of courtroom page
2. **Below it**: A suggestions card with 4 specific solutions
3. Pick the solution that works for you
4. Try again

---

## Token Economics

### How Many Tokens Does Each Debate Use?

Each agent response consumes tokens. Here's the breakdown:

```
Per Agent Per Round:
├─ System Prompt: ~300 tokens (fixed)
├─ User Prompt + Context: ~800-1000 tokens
└─ Agent Response: ~200-300 tokens
└─ Total: ~1300-1600 tokens per agent
```

### Safe Debate Configurations

| Configuration | Total Tokens | Risk Level | Notes |
|---|---|---|---|
| 2 agents × 1 round | ~2,600 | ✅ Safe | Works for most accounts |
| 3 agents × 1 round | ~3,900 | ✅ Safe | Fits budget limits |
| 2 agents × 2 rounds | ~5,200 | ⚠️ Risky | May exceed credits |
| 4 agents × 1 round | ~6,400 | ❌ Too Much | Will fail |
| 3 agents × 2 rounds | ~7,800 | ❌ Too Much | Will fail |

### Token Factors

**Increases Token Usage:**
- More agents (more API calls)
- More debate rounds
- Longer conversation history
- Complex/detailed objectives

**Decreases Token Usage:**
- Fewer agents
- Single round
- Shorter objectives
- First debate (no history)

---

## Solutions to Credit Issues

### ✅ Solution 1: Add Credits
**How:** Visit your API provider and add payment method
- OpenAI: https://platform.openai.com/account/billing/overview
- Anthropic: https://console.anthropic.com
- Google AI: https://makersuite.google.com
- DeepSeek: https://platform.deepseek.com

**Cost:** Typically $5-50 depending on usage

### ✅ Solution 2: Use Fewer Agents
**How:** When creating a courtroom, select 2 agents instead of 4+

**Benefit:**
- 2 agents = ~2,600 tokens (within limits)
- 4 agents = ~6,400 tokens (exceeds limits)

**Trade-off:** Fewer perspectives, but still valuable debate

### ✅ Solution 3: Use Faster Models
**How:** In Models page, add a faster model
- ✅ **Faster** (fewer tokens): GPT-3.5, Claude Haiku, Gemini 1.5 Flash
- ❌ **Slower** (more tokens): GPT-4o, Claude Opus, Gemini Ultra

**Benefit:** Same quality, lower token cost

**Example:**
- GPT-4o: ~1600 tokens per response
- GPT-3.5: ~800 tokens per response
- **Savings:** 50% token reduction

### ✅ Solution 4: Use Ollama (Free Local Model)
**How:** Install Ollama and run local models
1. Download: https://ollama.ai
2. Run a model: `ollama run llama2`
3. In Hathap.ai, add model with base URL: `http://localhost:11434`

**Benefit:**
- ✅ Free
- ✅ No API costs
- ✅ Unlimited tokens
- ✅ Private (data stays local)

**Trade-off:**
- Requires local machine
- Slower responses
- Lower quality than cloud models

---

## Error Messages & Solutions

### Error: "402 - Insufficient Credits"

```
❌ Your API account has insufficient credits or cannot afford the 
   tokens requested. You requested up to 16384 tokens, but can only 
   afford 3996.
```

**Cause:** Number of agents × tokens per response exceeds your budget

**Fix (Pick One):**
1. Use 2 agents instead of 4
2. Use a faster model (GPT-3.5)
3. Add credits to account
4. Try Ollama (free)

---

### Error: "No API key configured"

```
❌ No API key configured for model "GPT-4". Open the Models page and 
   set the actual model configuration.
```

**Cause:** Model doesn't have API key saved

**Fix:**
1. Go to Models page
2. Edit the model
3. Add/update API key
4. Click "Test" to verify
5. Try debate again

---

### Error: "No available model configured"

```
❌ No available model configured to run agent. Please ensure you have 
   added and enabled at least one model.
```

**Cause:** No enabled models with valid API keys

**Fix:**
1. Go to Models page
2. Add at least one model
3. Make sure it's enabled (toggle on)
4. Test the connection
5. Try debate again

---

## Planning Your Debate

### Step 1: Check Your Budget
- Go to Models page
- Read token budget card
- Decide: Can I afford 2,600 tokens? 3,900 tokens?

### Step 2: Choose Agents
- Select 2-3 agents for safe execution
- Avoid 4+ agents (too expensive)

### Step 3: Set Objective
- Keep it reasonable
- Don't make it too complex
- Simpler = fewer tokens

### Step 4: Start Debate
- Click "Start Debate"
- If successful: Great! 🎉
- If error: See suggestions card for solutions

---

## Real-World Examples

### Example 1: Limited Budget ($5 credit)
**Can afford:** ~4,000 tokens

**Safe configuration:**
- ✅ 2 agents, 1 round, GPT-3.5
- ✅ 3 agents, 1 round, Claude Haiku
- ❌ 4 agents (too expensive)
- ❌ 2 rounds (too expensive)

**Recommendation:** Start with 2 agents, 1 round

### Example 2: Generous Budget ($100+ credits)
**Can afford:** ~100,000+ tokens

**Safe configurations:**
- ✅ 4 agents, multiple rounds
- ✅ 5 agents, 3 rounds
- ✅ Any combination with expensive models

**Recommendation:** Can use any configuration

### Example 3: No Budget (Using Ollama)
**Cost:** Free! 0 tokens = 0 cost

**Safe configurations:**
- ✅ 10 agents, 10 rounds (still free!)
- ✅ Complex objectives
- ✅ Experiment freely

**Recommendation:** Excellent for testing/learning

---

## Frequently Asked Questions

### Q: Can I see my remaining credits?
**A:** Not yet, but we're adding this feature. For now:
- OpenAI: https://platform.openai.com/account/usage
- Anthropic: Check your console
- Others: See provider dashboard

### Q: Why does my debate sometimes use fewer tokens?
**A:** Several factors affect token usage:
- Shorter agent responses (good!)
- Shorter objectives
- No debate history (first debate)
- Model-specific tokenization

### Q: Can I stop a debate mid-way if running out of credits?
**A:** Not yet, but coming soon. For now, ensure budget before starting.

### Q: Does using 2 rounds = 2× the tokens?
**A:** Not exactly. More tokens per agent because they see previous debate history. Roughly:
- 1 round: ~2,600 tokens
- 2 rounds: ~5,200 tokens (2x)
- 3 rounds: ~7,800 tokens (3x)

### Q: Is Ollama as good as GPT-4?
**A:** No, but it's pretty good:
- ✅ Better than older models
- ✅ Good for testing
- ✅ Great for learning
- ❌ Less capable than GPT-4
- ❌ Slower responses

### Q: Will my API key be exposed?
**A:** No! Keys are:
- Encrypted with AES-256-GCM
- Never shown in UI
- Only used for API calls
- Never logged or stored plaintext

---

## Tips & Tricks

### 💡 Tip 1: Start Small
- Use 2 agents for your first debate
- Once comfortable, try 3
- Save 4+ for later

### 💡 Tip 2: Mix Model Speeds
- Fast model (GPT-3.5): Save credits
- Slow model (GPT-4): Use for important debates
- Hybrid: 2 agents = 1 fast + 1 slow

### 💡 Tip 3: Monitor Usage
- Keep eye on API provider dashboard
- Set budget alerts if available
- Add credits before they run out

### 💡 Tip 4: Use Ollama for Testing
- Test debate setups with Ollama (free)
- Once happy, run with GPT-4 (paid)
- Saves money on experimentation

### 💡 Tip 5: Shorter Objectives = Fewer Tokens
- ❌ Bad: "Compare microservices vs monolith considering 50 factors"
- ✅ Good: "Should we use microservices?"

---

## Troubleshooting Checklist

- [ ] Do I have enough credits? (Check provider dashboard)
- [ ] Is my API key valid? (Click "Test" on Models page)
- [ ] Am I using too many agents? (Try 2 instead of 4)
- [ ] Is my model enabled? (Check Models page toggle)
- [ ] Did I read the token budget card? (Check Models page)

---

## Need Help?

If you're still having issues:
1. Check this guide again
2. Read error suggestions in the app
3. Look at Models page token budget info
4. Try Ollama as a free alternative
5. Contact support with error message

---

**Last Updated:** 2024
**Version:** 1.0
