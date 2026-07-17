# User-Facing UI Examples

## What Users Will See

---

## 1️⃣ Models Page - Token Budget Info Card

### Location: Models Page (top, after security warning)

```
┌─────────────────────────────────────────────────────────────┐
│  💡 Token Budget & Debate Planning                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Each debate uses tokens based on the number of agents:     │
│                                                               │
│  ✓ 2 agents × 1 round ≈ 2,600 tokens (safe for most)       │
│  ✓ 3 agents × 1 round ≈ 3,900 tokens (fits budget)         │
│  ✗ 2 agents × 2+ rounds ≈ 5,200+ tokens (may fail)         │
│                                                               │
│  If you get "Insufficient credits" error:                   │
│                                                               │
│  1. Add credits to your API account                         │
│  2. Use fewer agents (start with 2)                         │
│  3. Use a faster model (GPT-3.5 not GPT-4)                  │
│  4. Try Ollama for free local model hosting                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

**User Takeaway:** "I need 2 agents max to stay safe" or "I can safely run 3 agents"

---

## 2️⃣ Courtroom Page - Before Error (Safe)

### Location: Courtroom Detail Page

```
Back to Courtrooms

My Technical Decision
Objective discussion about microservices vs monolith

[Mode: consensus]  [Status: draft]  
[Start Debate]

Objective: Should we use microservices or monolith architecture?

✓ Setup complete
  • 2 agents selected
  • Model GPT-3.5 enabled
  • Ready to start
```

**User Action:** Clicks "Start Debate" → Debate runs successfully ✅

---

## 3️⃣ Courtroom Page - After Error (Insufficient Credits)

### Location: Courtroom Detail Page

```
Back to Courtrooms

My Technical Decision
Objective discussion about microservices vs monolith

[Mode: consensus]  [Status: draft]  
[Start Debate]

Objective: Should we use microservices or monolith architecture?

┌──────────────────────────────────────────────────┐
│ ⚠ Debate Error                                   │
│                                                   │
│ LLM call failed after 3 attempts (HTTP 402).     │
│ This request requires more credits, or fewer     │
│ max_tokens. You requested up to 3996 tokens,     │
│ but can only afford 2000.                        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ ⚠️  How to Fix This                              │
├──────────────────────────────────────────────────┤
│                                                   │
│ ❌ Your API account has insufficient credits    │
│    or cannot afford the tokens requested.        │
│                                                   │
│ 💡 Solution 1:                                   │
│    Add credits to your API account               │
│    Visit: https://platform.openai.com/...       │
│                                                   │
│ 💡 Solution 2:                                   │
│    Use fewer agents in your debate               │
│    Try 2 agents instead of 4                     │
│                                                   │
│ 💡 Solution 3:                                   │
│    Use a faster/cheaper model                    │
│    Try GPT-3.5 instead of GPT-4                  │
│                                                   │
│ 💡 Solution 4:                                   │
│    Try using Ollama (local, free)                │
│    Visit: https://ollama.ai                      │
│                                                   │
└──────────────────────────────────────────────────┘

[Modify Agents]  [Go to Models Page]  [Try Ollama Guide]
```

**User Takeaway:** 
- "Oh, I need more credits" OR
- "Let me try with just 2 agents" OR  
- "I'll try the faster GPT-3.5 model" OR
- "Let me download Ollama"

---

## 4️⃣ Error Scenario: Missing API Key

### Location: Courtroom Detail Page (Error Section)

```
┌──────────────────────────────────────────────────┐
│ ⚠ Debate Error                                   │
│                                                   │
│ No API key configured for model "GPT-4".         │
│ Open the Models page and set the actual model    │
│ name (e.g. gpt-4o, gpt-4-turbo-preview).        │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ ⚠️  How to Fix This                              │
├──────────────────────────────────────────────────┤
│                                                   │
│ ❌ One or more agents have invalid or missing    │
│    API keys                                       │
│                                                   │
│ 💡 Solution 1:                                   │
│    Go to the Models page and verify all          │
│    API keys are correctly configured             │
│                                                   │
│ 💡 Solution 2:                                   │
│    Ensure at least one model is marked as        │
│    enabled before starting the debate            │
│                                                   │
└──────────────────────────────────────────────────┘

[Go to Models Page]
```

---

## 5️⃣ Error Scenario: No Models Available

### Location: Courtroom Detail Page (Error Section)

```
┌──────────────────────────────────────────────────┐
│ ⚠ Debate Error                                   │
│                                                   │
│ No available model configured to run agent       │
│ "Senior Architect". Please ensure you have       │
│ added and enabled at least one model.            │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ ⚠️  How to Fix This                              │
├──────────────────────────────────────────────────┤
│                                                   │
│ ❌ No models are available or configured         │
│                                                   │
│ 💡 Solution 1:                                   │
│    Go to the Models page and add at least        │
│    one AI model with a valid API key             │
│                                                   │
│ 💡 Solution 2:                                   │
│    Make sure the model is enabled before         │
│    starting the debate                           │
│                                                   │
│ 💡 Solution 3:                                   │
│    Need a free option? Try Ollama                │
│    (runs locally, no API key needed)             │
│                                                   │
└──────────────────────────────────────────────────┘

[Go to Models Page]  [Learn About Ollama]
```

---

## 6️⃣ Models Page Layout

### Before: Without Warning Card
```
┌─────────────────────────────┐
│ 🔒 API Key Security Notice  │
│ Keys are encrypted...       │
└─────────────────────────────┘

Your Models
├─ Model 1
├─ Model 2
└─ [Add Model Button]
```

### After: With Warning Card
```
┌─────────────────────────────┐
│ 🔒 API Key Security Notice  │
│ Keys are encrypted...       │
└─────────────────────────────┘

┌──────────────────────────────────┐
│ 💡 Token Budget & Debate Planning │  ← NEW
│ Safe: 2-3 agents                 │
│ Unsafe: 4+ agents                │
│ Solutions: ...                    │
└──────────────────────────────────┘

Your Models
├─ Model 1
├─ Model 2
└─ [Add Model Button]
```

---

## 7️⃣ Successful Debate Flow

```
1. User opens Models page
2. Sees token budget info card
3. Thinks: "2-3 agents is safe"
4. Creates courtroom with 2 agents
5. Clicks "Start Debate"
6. ✅ Debate runs successfully
7. Verdict appears
8. Happy user! 😊
```

---

## 8️⃣ Credit Error Recovery Flow

```
1. User creates courtroom with 4 agents
2. Clicks "Start Debate"
3. ❌ Gets HTTP 402 error
4. Sees error message
5. Sees suggestions card with 4 solutions
6. User picks Solution 2: "Use fewer agents"
7. User reduces to 2 agents
8. Clicks "Start Debate" again
9. ✅ Works!
10. Happy user! 😊
```

---

## 9️⃣ Mobile View

### Models Page (Mobile)
```
┌────────────────────────────┐
│  💡 Token Budget Info      │
├────────────────────────────┤
│                             │
│ Safe:                       │
│ • 2 agents → 2,600 tokens  │
│ • 3 agents → 3,900 tokens  │
│                             │
│ Unsafe:                     │
│ • 4+ agents                │
│ • 2+ rounds                │
│                             │
│ Solutions:                  │
│ • Add credits              │
│ • Use fewer agents         │
│ • Use faster model         │
│ • Try Ollama               │
│                             │
└────────────────────────────┘
```

### Error on Mobile
```
┌────────────────────────────┐
│ ⚠ Debate Error             │
├────────────────────────────┤
│ Insufficient credits       │
│                             │
│ 💡 Solutions:              │
│ • Add credits              │
│ • 2 agents max             │
│ • Try faster model         │
│ • Use Ollama               │
│                             │
│ [Go to Models Page]        │
└────────────────────────────┘
```

---

## 🎨 Color Scheme

### Error Messages
- Background: Light red/orange tint
- Border: Orange/red (#ea580c or similar)
- Text: White (primary), light gray (secondary)

### Suggestions Card
- Background: Slightly warmer (orange tint)
- Border: Orange accent
- Icons: ❌, 💡 for quick scanning
- Text: Easy to read

### Success
- Green checkmarks ✅
- "Debate completed" toast notification
- Verdict displayed

---

## 📱 Responsive Design

### Desktop (Courtroom Page)
```
[Left Sidebar: Participants]
[Center: Messages & Debate Thread]
[Right Sidebar: Verdict & Consensus]
[Error Card: Full Width Above]
```

### Tablet
```
[Error Card: Full Width]
[Messages & Thread: Full Width]
[Verdict: Below]
```

### Mobile
```
[Error Card: Full Width]
[Messages: Full Width]
[Verdict: Below]
[Swipe to switch views]
```

---

## ✨ Visual Hierarchy

1. **Error Message** (Red, top)
   - Clear problem statement
   - User focuses here first

2. **Suggestions Card** (Orange, below)
   - Actionable solutions
   - Easy to scan
   - Icons for quick reference

3. **Supporting Info**
   - Links to Models page
   - Links to guides
   - Buttons for next steps

---

## 📊 Typical User Flows

### Flow A: Happy Path (No Issues)
```
View Models → See budget info → Plan debate → 
Start debate → Success ✅
```

### Flow B: Credit Issue (Common)
```
View Models → Plan debate → Start → Error 🔴 →
See suggestions → Pick solution → 
Adjust debate → Start again → Success ✅
```

### Flow C: First Time User
```
Add model → See warning on Models page →
"Oh, I need 2 agents" → Create courtroom → 
Start → Success ✅
```

### Flow D: Out of Credits
```
Add model → Try debate → Error 🔴 →
See "add credits" suggestion →
Visit OpenAI.com → Add credits →
Try debate again → Success ✅
```

---

## 🎯 Key Messages

### Message 1 (Models Page)
> "Plan your debate based on token budget. 2-3 agents is safe."

### Message 2 (Error - Credits)
> "You're out of credits. Here are 4 ways to fix it."

### Message 3 (Error - API Key)
> "Missing API key. Check Models page."

### Message 4 (Error - No Models)
> "Add at least one model before starting."

---

## Summary

Users will now:
1. ✅ See token budget before debating
2. ✅ Get clear error messages if something breaks
3. ✅ Have 3-4 specific solutions to try
4. ✅ Understand the issue (not confusing)
5. ✅ Know next steps to recover
6. ✅ Be able to fix most issues themselves

Result: **Better UX, fewer support questions, happier users! 😊**
