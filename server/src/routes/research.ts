import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { describeResearchStatus, researchSetupInstructions } from '../research/researchConfig';
import { decisionOrchestrator } from '../decision/orchestrator';

const router = express.Router();

/**
 * Web-Grounded Demo — a one-click demonstration that the research engine
 * gathers real web evidence. The demo creates a decision with a predefined
 * useful question, arms it with research queries, and returns immediately so
 * the client can observe the live SSE timeline on the detail page.
 *
 * Requirements:
 *   - A real web-search provider must be configured (BRAVE_SEARCH_API_KEY).
 *   - At least one connected model is recommended but not required (the engine
 *     will use a deterministic fallback for debate/verify steps).
 *   - The decision is owned by the requesting user (existing auth + ownership).
 */
const DEMO_OBJECTIVE =
  'Should a small software startup adopt GraphQL for its public API, considering team size, ' +
  'tooling maturity, and the trade-offs against a proven REST approach?';

const DEMO_QUERIES = [
  { query: 'GraphQL vs REST trade-offs reported by engineering teams, 2024-2025', purpose: 'competitive_research' },
  { query: 'GraphQL production pitfalls and failure modes for small teams', purpose: 'technical_research' },
  { query: 'data-loading and performance concerns when adopting GraphQL at small scale', purpose: 'market_research' },
];

/**
 * GET /api/research/status
 * Non-secret view of the current research provider status. Safe to call from
 * the client on load (no secrets — only env-var names and provider identity).
 */
router.get('/status', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const status = describeResearchStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/research/demo
 * One-click web-grounded demo: creates a decision with a predefined objective
 * + research queries and starts it. Returns decision + execution IDs so the
 * client navigates to the detail page where live SSE events stream evidence
 * gathering, debate, verification, and reconciliation.
 *
 * The provider MUST be configured for real web research. If not, the route
 * returns 400 with exactly what to add to server/.env — no silent mock.
 */
router.post('/demo', requireAuth, async (req: AuthRequest, res) => {
  try {
    const status = describeResearchStatus();
    if (!status.configured || !status.real) {
      return res.status(400).json({
        error: 'Real web research is not configured. This demo gathers real evidence from the web.',
        setup: researchSetupInstructions(),
        status,
      });
    }

    const decision = await decisionOrchestrator.createDecision({
      userId: req.userId!,
      title: 'Web-Grounded Demo: GraphQL vs REST for startups',
      objective: DEMO_OBJECTIVE,
      context: 'This is an automated web-grounded research demo. All research evidence below was gathered from real web sources.',
      configuration: {
        verificationEnabled: true,
        maxRounds: 3,
      },
      metadata: {
        isWebGroundedDemo: true,
        webGroundedProvider: status.provider,
        demo: true,
      },
    });

    const execution = await decisionOrchestrator.startDecision(
      decision._id.toString(),
      req.userId!,
      {
        researchQueries: DEMO_QUERIES,
        planningMode: 'fixed',
      }
    );

    res.status(202).json({
      success: true,
      status: 'accepted',
      decisionId: decision._id.toString(),
      executionId: execution._id.toString(),
      researchQueries: DEMO_QUERIES,
      provider: status.provider,
      message: 'Demo started. Open the decision detail page to watch real web research, AI debate, and verification live.',
    });
  } catch (error: any) {
    console.error('[Research demo]', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
