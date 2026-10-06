# 🚀 Deployment Checklist

## Pre-Deployment Verification

### Code Changes
- ✅ `server/src/engine/agentRunner.ts` - maxTokens added
- ✅ `server/src/engine/llmClient.ts` - Error handling improved
- ✅ `client/src/pages/CourtroomDetailPage.tsx` - Error suggestions added
- ✅ `client/src/pages/ModelsPage.tsx` - Token budget card added

### TypeScript Compilation
- ✅ No errors in agentRunner.ts
- ✅ No errors in llmClient.ts
- ✅ No errors in CourtroomDetailPage.tsx
- ✅ No errors in ModelsPage.tsx

### Documentation
- ✅ CREDIT_FIX.md (backend explanation)
- ✅ FRONTEND_TOKEN_WARNINGS.md (frontend changes)
- ✅ TOKEN_BUDGET_GUIDE.md (user guide)
- ✅ IMPLEMENTATION_SUMMARY.md (overview)
- ✅ USER_FACING_EXAMPLES.md (UI examples)
- ✅ DEPLOYMENT_CHECKLIST.md (this file)

---

## Local Testing Checklist

### Backend Testing
- [ ] Backend server starts without errors
  ```bash
  cd server
  npm run dev
  ```
  Expected: "Server running on port 4000"

- [ ] No compilation errors
  ```bash
  cd server
  npm run build
  ```
  Expected: Compiles to dist/

- [ ] Database connection works
  - Check MongoDB connection string in .env
  - Verify MongoDB is running
  - Expected: "Connected to MongoDB"

### Frontend Testing
- [ ] Frontend dev server starts without errors
  ```bash
  cd client
  npm run dev
  ```
  Expected: "VITE v5.0.0 ready in X ms"

- [ ] No TypeScript errors
  ```bash
  cd client
  npx tsc --noEmit
  ```
  Expected: No output (no errors)

- [ ] Application loads in browser
  - Navigate to http://localhost:5173
  - Expected: Login page loads
  - No console errors

---

## Feature Testing Checklist

### Test 1: Models Page Token Budget Info
- [ ] Navigate to Models page
- [ ] Look for orange "Token Budget" card
- [ ] Card shows:
  - [ ] 2 agents = 2,600 tokens ✓
  - [ ] 3 agents = 3,900 tokens ✓
  - [ ] 4 agents = too much ✗
- [ ] Card shows 4 solutions
- [ ] Mobile view is responsive

### Test 2: Successful Debate (Safe Config)
- [ ] Add at least one model with valid API key
- [ ] Create courtroom with 2 agents
- [ ] Click "Start Debate"
- [ ] Expected: Debate runs successfully
- [ ] Verdict appears

### Test 3: Error Suggestions (Simulate)
**If you have limited API credits:**
- [ ] Create courtroom with 4 agents
- [ ] Click "Start Debate"
- [ ] Expected: HTTP 402 error appears
- [ ] Expected: Suggestions card appears below
- [ ] Suggestions include:
  - [ ] Add credits link
  - [ ] Use fewer agents
  - [ ] Use faster model
  - [ ] Try Ollama

### Test 4: Missing API Key Error
- [ ] Add model without API key
- [ ] Create courtroom with that agent
- [ ] Click "Start Debate"
- [ ] Expected: "No API key" error
- [ ] Expected: Suggestions show

### Test 5: No Models Error
- [ ] Delete all models
- [ ] Try to create courtroom
- [ ] Click "Start Debate"
- [ ] Expected: "No available model" error
- [ ] Expected: Suggestions show

### Test 6: Error Recovery
- [ ] Get insufficient credits error
- [ ] Modify debate (fewer agents)
- [ ] Click "Start Debate" again
- [ ] Expected: Either success or same error (if still out of credits)

---

## UI/UX Testing Checklist

### Visual Consistency
- [ ] Error cards use consistent colors (orange/red)
- [ ] Suggestion cards match design system
- [ ] Icons render correctly
- [ ] Text is readable (contrast)
- [ ] Spacing is consistent

### Responsive Design
- [ ] Desktop view (1920px)
  - [ ] Error card full width
  - [ ] Suggestions below
  - [ ] All readable

- [ ] Tablet view (768px)
  - [ ] Cards responsive
  - [ ] Text readable
  - [ ] No text overflow

- [ ] Mobile view (375px)
  - [ ] Cards stack vertically
  - [ ] Touchable buttons
  - [ ] Readable text

### Accessibility
- [ ] Error icon visible (not just color)
- [ ] Suggestion items have proper contrast
- [ ] Can navigate with keyboard
- [ ] Screen reader friendly (if testable)

---

## Performance Testing

### Load Times
- [ ] Models page loads < 2 seconds
- [ ] Error suggestions render instantly
- [ ] No layout shift when error appears
- [ ] No memory leaks (check DevTools)

### API Performance
- [ ] Debate starts within reasonable time
- [ ] Error detection is fast
- [ ] No duplicate API calls

---

## Browser Compatibility

Test on:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

Expected: All features work identically

---

## Security Testing

- [ ] API keys not exposed in error messages
- [ ] No sensitive data logged
- [ ] Error messages don't leak information
- [ ] Tokens not visible in localStorage — **open item**. Server-side credential
      invalidation is implemented (Phase 17): logout, password change and account
      deletion all end outstanding credentials. That bounds how long a stolen token
      is useful; it does not stop page scripts from reading it. Moving the token
      into an `HttpOnly` cookie is specified but unimplemented — see
      [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md)
- [ ] Expired or revoked credentials end the session promptly in the UI — **done**
      (Phase 18). Every client request goes through one layer; a `401` on a
      credentialed request clears the session once and the route guard redirects.
      Since Phase 20 this is also proactive: a stored token is validated on page
      load with `GET /api/auth/me`, so an already-dead token is rejected before
      the protected shell renders. A validation request that cannot reach a
      verdict (network failure, `5xx`) deliberately keeps the session.
- [ ] HTTPS ready (for production)

---

## Authentication & Session Prerequisites (Phase 16)

> **Phase 17 + 18 status.** The revocable-credential half is **done and does not
> need any of these answers**: `POST /api/auth/logout`, password-change
> invalidation, account-deletion invalidation and A2A parity are implemented and
> tested over the existing bearer token, and the client now has a single
> credential/request layer with one 401 → sign-out path. The questions below gate
> only the **cookie migration**, which remains unimplemented. They also gate the
> shortened TTL, the CSRF token and the split rate limiter described in §5–§6 of
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md).
>
> **Phase 19 status: still open, now formally recorded.** Phase 19 inventoried
> every tracked file and confirmed the production topology is **absent from the
> repository** — there is no Dockerfile, compose file, Kubernetes manifest,
> proxy config, PaaS descriptor, deploy workflow, production env file, or
> production hostname anywhere. CI only typechecks, tests and builds. So these
> questions cannot be answered from the code; they need a human decision. The
> authoritative, expanded decision record is **§4.4** of
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md) —
> fill it in there rather than here, so there is one source of truth.

Session cookies (`HttpOnly`, `Secure`, `SameSite`) cannot be configured until the
production topology is pinned down. The repository supports two mutually exclusive
shapes and currently commits to neither. Record the answers in §4.4 before
starting the migration:

- [ ] **Topology** — same-origin (SPA + API behind one origin) or cross-origin?
- [ ] If cross-origin: is the API on the **same registrable domain** as the SPA?
      `SameSite` is evaluated on the *site* (scheme + registrable domain), not the
      *origin*, so subdomains and different ports are still same-site and
      `SameSite=Lax` works for them. If the API is on an **unrelated** domain
      (e.g. `*.vercel.app` + `*.herokuapp.com`), `SameSite=None; Secure` is
      forced, which removes all `SameSite` CSRF protection and makes the CSRF
      token the only defence.
- [ ] Is the public origin HTTPS for both SPA and API? (`SameSite=None` requires
      it, and a `Secure` cookie is dropped on any other plaintext origin.)
- [ ] Where does TLS terminate, and how many proxy hops sit in front of Express?
      (`trust proxy` is currently never configured.)
- [ ] Exact origins to place in `CORS_ORIGINS` (only if cross-origin).
- [ ] Does a reverse proxy serve `client/dist`, or should Express serve it?
      (Express currently serves no static files and has no SPA fallback.)
- [ ] How many API replicas? More than one forbids any in-memory session store and
      requires the process-local SSE event bus to be addressed first.

### What to set before any production deploy (independent of the cookie decision)

These are safe to action now and do **not** depend on the topology answers above:

- [ ] Set `NODE_ENV=production`. It is read by the server but was previously
      undocumented; unset, the process behaves as development, which silently
      permits the predictable fallback JWT secret. CORS is already deny-by-default
      in production (only the `CORS_ORIGINS` allow-list is ever reflected, and the
      `Host` header is never trusted), so this is chiefly a JWT-secret concern.
- [ ] Set `JWT_SECRET` to a strong random value (>= 16 chars).
- [ ] Set `API_KEY_ENCRYPTION_SECRET` to a random value (>= 32 chars).
- [ ] Optionally set `APP_URL` to the public origin — it is sent to
      OpenAI-compatible providers as `HTTP-Referer` and was previously
      undocumented.

---

## Production Deployment

### Pre-Deployment
- [ ] All local tests passed
- [ ] Team code review complete
- [ ] Documentation reviewed
- [ ] Staging environment tested

### Deployment Steps

#### Step 1: Backend Deployment
```bash
# Ensure environment is set
export MONGODB_URI=<production-uri>
export JWT_SECRET=<production-secret>
export API_KEY_ENCRYPTION_SECRET=<production-secret>
export NODE_ENV=production
export APP_URL=<public-frontend-origin>   # optional; HTTP-Referer for LLM providers

# Build
cd server
npm run build

# Deploy dist/ folder to hosting
# (Heroku, Railway, AWS, etc.)

# Restart server
```

> There is no deployment configuration in this repository — no Dockerfile, no
> compose file, no PaaS descriptor, no deploy workflow, and no reverse-proxy
> config. The commands above therefore describe *what to set*, not a procedure
> that exists. Hosting, TLS termination and the SPA/API topology are decisions
> you have to make and encode; see the decision record in
> [`docs/AUTHENTICATION_ARCHITECTURE.md`](docs/AUTHENTICATION_ARCHITECTURE.md) §4.4.

#### Step 2: Frontend Deployment
```bash
# Build for production
cd client
npm run build

# Deploy dist/ folder to CDN/hosting
# (Vercel, Netlify, S3+CloudFront, etc.)
```

#### Step 3: Verification
- [ ] Backend health check: `GET /api/health` returns 200
- [ ] Frontend loads: Navigate to https://your-domain.com
- [ ] Login works
- [ ] Models page shows token budget card
- [ ] Can start debate successfully
- [ ] Error handling works

### Post-Deployment Monitoring

**First 24 hours:**
- [ ] Monitor error logs
- [ ] Check API response times
- [ ] Verify database connections
- [ ] Monitor user sessions

**Daily:**
- [ ] Check error rates
- [ ] Monitor performance
- [ ] Review user feedback
- [ ] Test key features

**Weekly:**
- [ ] Review usage statistics
- [ ] Check for any issues
- [ ] Plan any needed updates

---

## Rollback Plan

If issues occur post-deployment:

### Quick Rollback
```bash
# Backend
# Revert to previous commit and redeploy

# Frontend  
# Revert to previous build and redeploy
```

### Database Backup
- Ensure daily backups
- Can restore if needed
- Keep backup for 30 days

---

## Communication

### Before Deployment
- [ ] Notify team of upcoming deployment
- [ ] Share deployment time window
- [ ] Identify point-person for issues

### During Deployment
- [ ] Monitor deployment progress
- [ ] Document any issues
- [ ] Have rollback plan ready

### After Deployment
- [ ] Confirm all systems working
- [ ] Test key features
- [ ] Communicate success to team

---

## Documentation

### Update These After Deployment
- [ ] README.md - if deployment steps changed
- [ ] API documentation - if endpoints changed
- [ ] Known Issues section - add any new issues found
- [ ] Changelog - document all changes

### Notify Users
- [ ] Blog post about improvements (optional)
- [ ] In-app notification about token budgets
- [ ] Help documentation updated
- [ ] Support team trained

---

## Post-Deployment Support

### Common Questions from Users
1. **"Why do I need fewer agents?"**
   - Answer: Tokens are limited, fewer agents = lower cost

2. **"Can I use 5 agents?"**
   - Answer: If you have enough credits, yes. Otherwise 2-3.

3. **"What's Ollama?"**
   - Answer: Free local AI models, no API needed

4. **"How do I get more credits?"**
   - Answer: Visit your API provider (OpenAI, Anthropic, etc.)

### User Support Resources
- Provide TOKEN_BUDGET_GUIDE.md link
- Direct to USER_FACING_EXAMPLES.md for visuals
- Point to Models page for token info
- Suggest Ollama for no-cost option

---

## Metrics to Track

### Success Metrics
- Debate success rate (target: 95%+)
- Error recovery rate (users fixing their own errors)
- User satisfaction with suggestions
- Time to resolve credit issues

### Failure Metrics
- Error rate (target: <1%)
- Users stuck at "Insufficient credits" (target: 0%)
- Bug reports (target: 0 critical)
- Performance degradation (target: none)

### Usage Metrics
- Debates using 2 agents (most common)
- Debates using 3 agents
- Debates using 4+ agents (rare after update)
- Users accessing Models page token info

---

## Sign-Off Checklist

- [ ] Technical Lead: Code reviewed and approved
- [ ] Product Owner: Features meet requirements
- [ ] QA: Testing complete, no critical issues
- [ ] DevOps: Deployment plan verified
- [ ] Documentation: All docs updated
- [ ] Support: Team trained and ready

---

## Final Verification

```
DEPLOYMENT STATUS: [ ] Ready to Deploy
DEPLOYMENT TIME: [  ]
DEPLOYED BY: [  ]
VERIFICATION COMPLETE: [ ]
ROLLBACK READY: [ ]
SUCCESS: [ ]
```

---

## Post-Deployment Timeline

| When | Action | Owner |
|------|--------|-------|
| T-1h | Final checks | Tech Lead |
| T-0 | Deploy backend | DevOps |
| T+5m | Verify backend | Tech Lead |
| T+10m | Deploy frontend | DevOps |
| T+15m | Verify frontend | Tech Lead |
| T+30m | Test key features | QA |
| T+1h | Full verification | All |
| T+24h | Monitor issues | Support |
| T+1w | Review metrics | Product |

---

## Contact & Escalation

### During Deployment
- **Technical Issues:** Technical Lead
- **Deployment Issues:** DevOps/Infrastructure
- **Emergency:** CTO/Management

### After Deployment
- **User Issues:** Support Team
- **Bug Reports:** Development Team
- **Performance Issues:** DevOps/Backend Team

---

**Deployment Checklist Version:** 1.0
**Last Updated:** 2024
**Status:** Ready for Use
