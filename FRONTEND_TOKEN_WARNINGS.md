# Frontend Token & Credit Warnings - Implementation Guide

## Overview

Added comprehensive frontend warnings and suggestions for API token/credit issues to help users understand and resolve problems when starting debates.

## Changes Made

### 1. CourtroomDetailPage.tsx - Enhanced Error Handling

**What Changed:**
- Added `errorSuggestions` state to track helpful suggestions
- Enhanced error message parsing in `handleStartDebate()`
- Added detailed error suggestions card UI

**Where to See It:**
When you start a debate and get an error, you'll see:
1. The main error message
2. A detailed suggestions card with specific solutions

**Error Types & Suggestions Provided:**

#### Token/Credit Issues (HTTP 402)
```
❌ Your API account has insufficient credits or cannot afford the tokens requested
💡 Solution 1: Add credits to your API account
💡 Solution 2: Use fewer agents in your debate
💡 Solution 3: Use a faster/cheaper model
💡 Solution 4: Try Ollama (local, free)
```

#### Missing API Keys
```
❌ One or more agents have invalid or missing API keys
💡 Go to the Models page and verify all API keys
💡 Ensure at least one model is marked as enabled
```

#### No Models Available
```
❌ No models are available or configured
💡 Go to the Models page and add at least one AI model
💡 Make sure the model is enabled before starting
```

### 2. ModelsPage.tsx - Token Budget Info Card

**What Changed:**
- Added a new informational card about token budgets
- Shows at top of Models page below security warning
- Provides planning guidance before creating debates

**Token Budget Information Shown:**
```
✓ 2 agents × 1 round ≈ 2,600 tokens (safe)
✓ 3 agents × 1 round ≈ 3,900 tokens (fits limits)
✗ 2 agents × 2+ rounds ≈ 5,200+ tokens (may exceed)
```

**Solutions Provided:**
1. Add credits to API account
2. Use fewer agents (start with 2)
3. Use a faster model (GPT-3.5 instead of GPT-4)
4. Try Ollama for free local hosting

## User Experience Flow

### Before Starting a Debate:
1. User navigates to **Courtrooms** → Opens a courtroom
2. User sees **Models page link** in navigation
3. Before starting, user can check Models page to see:
   - Token budget guidelines
   - How many credits they need
   - Tips to reduce token usage

### When Starting a Debate:
1. User clicks "Start Debate" button
2. If successful → Debate runs, verdict shown
3. If error (e.g., insufficient credits):
   - Main error message displays
   - Below it, suggestions card shows with:
     - What went wrong
     - 3-4 specific solutions
     - Links to relevant pages (Models page)

## Code Changes Summary

### CourtroomDetailPage.tsx
```typescript
// New state for tracking suggestions
const [errorSuggestions, setErrorSuggestions] = useState<string[]>([]);

// Enhanced error handling in handleStartDebate()
if (message.includes('402') || message.includes('credits')) {
  suggestions.push('❌ Your API account has insufficient credits...');
  suggestions.push('💡 Solution 1: Add credits...');
  // etc.
}

// New error display UI with suggestions card
{errorSuggestions.length > 0 && (
  <Card className="border-orange-500/30 bg-orange-500/5">
    {/* Renders each suggestion */}
  </Card>
)}
```

### ModelsPage.tsx
```typescript
// Added after security alert
<Card className="mb-6 border-orange-500/30 bg-orange-500/5">
  <CardBody>
    {/* Token budget info */}
    {/* Solutions */}
  </CardBody>
</Card>
```

## Key Features

✅ **Intelligent Error Detection**
- Parses error messages for specific issue types
- Provides targeted solutions

✅ **User-Friendly Language**
- Clear, non-technical explanations
- Action-oriented suggestions
- Emojis for quick visual scanning

✅ **Proactive Guidance**
- Token budget info visible before starting debate
- Helps users plan ahead
- Prevents surprise errors

✅ **No Extra Clicks**
- All information inline
- Accessible from same pages
- No modal or popup needed

## Testing the Changes

### Test Scenario 1: Token/Credit Error
1. Start with limited API credits
2. Try to start debate with 4+ agents
3. Expected: Error message + 4 suggestions appear

### Test Scenario 2: Missing API Key
1. Add model without API key
2. Try to start debate
3. Expected: API key error + relevant suggestions

### Test Scenario 3: Planning Mode
1. Navigate to Models page
2. Look for token budget card
3. Read budget guidelines
4. Create courtroom based on guidelines
5. Expected: Debate completes without credit errors

## Design Consistency

**Color Scheme:**
- Error messages: Red/Orange border and background
- Suggestions: Orange/yellow tint
- Icons: Using lucide-react AlertCircle

**Typography:**
- Bold for error type
- Regular for solutions
- Monospace for technical details

**Spacing:**
- 3px gap between icon and text
- Consistent padding in cards
- Proper list indentation

## Files Modified

1. ✅ `client/src/pages/CourtroomDetailPage.tsx`
   - Added errorSuggestions state
   - Enhanced handleStartDebate()
   - Added suggestions card UI

2. ✅ `client/src/pages/ModelsPage.tsx`
   - Added token budget info card
   - Added solutions guidance

## Browser Compatibility

- Works on all modern browsers
- Responsive design (mobile, tablet, desktop)
- Tested with:
  - Chrome/Chromium
  - Firefox
  - Safari
  - Edge

## Accessibility

- Alert icons for visual distinction
- Text descriptions (not icon-only)
- Proper color contrast
- Semantic HTML

## Future Enhancements

Possible additions:
1. **Toast notifications** when starting debate (not just on complete)
2. **Modal wizard** to select appropriate number of agents based on budget
3. **Token counter** showing estimated tokens before starting
4. **Credit tracker** showing remaining credits (if API provides)
5. **Model recommendation** based on token budget
6. **Auto-pause** if running out of tokens mid-debate

## Related Files

- `server/CREDIT_FIX.md` - Backend token fix documentation
- `server/src/engine/agentRunner.ts` - Where max_tokens is set to 2000
- `server/src/engine/llmClient.ts` - Better error messages

## Summary

The frontend now provides:
- ✅ Real-time error detection and suggestions
- ✅ Proactive token budget guidance
- ✅ Clear action items to resolve issues
- ✅ Better user experience when errors occur
- ✅ Prevention of frustration from unexpected failures
