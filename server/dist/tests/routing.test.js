"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const DecisionPlan_1 = __importDefault(require("../models/DecisionPlan"));
const Agent_1 = __importDefault(require("../models/Agent"));
const Model_1 = __importDefault(require("../models/Model"));
const executor_1 = require("../decision/executor");
const worker_1 = require("../tasks/worker");
const verifyClaimHandler_1 = require("../tasks/handlers/verifyClaimHandler");
const redTeamHandler_1 = require("../tasks/handlers/redTeamHandler");
const reconciliationHandler_1 = require("../tasks/handlers/reconciliationHandler");
const planner_1 = require("../planning/planner");
const planningPolicy_1 = require("../planning/planningPolicy");
const routing_1 = require("../routing");
const candidateResolver_1 = require("../routing/candidateResolver");
const encryption_1 = require("../utils/encryption");
// Isolation: node:test runs each file in its own process, so seeding a stable
// test-only encryption secret here cannot affect other suites. The real
// encryption path (scrypt + AES-256-GCM) is fully exercised.
(_a = process.env).API_KEY_ENCRYPTION_SECRET ?? (_a.API_KEY_ENCRYPTION_SECRET = 'test-routing-secret-0123456789abcdef');
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test_routing';
const handlers_1 = require("../tasks/handlers");
async function clean() {
    await Promise.all([
        Decision_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        DecisionPlan_1.default.deleteMany({}),
        Agent_1.default.deleteMany({}),
        Model_1.default.deleteMany({}),
    ]);
}
function isSelected(r) {
    strict_1.default.ok(r && r.status === 'selected', `expected selected, got ${JSON.stringify(r)}`);
}
/** Exercises a routing result and returns a compact model/agent identity pair. */
function picked(r) {
    isSelected(r);
    return { model: r.model.id, agent: r.agent?.id || '' };
}
(0, node_test_1.describe)('Phase 6 — routing unit: availability, scoring, fallback', () => {
    let userId;
    let otherUserId;
    let budgetUser;
    let gpt4oId;
    let claudeId;
    let untestedId;
    let brokenId;
    let keylessId;
    let unknownPriceId;
    let researchAgentId;
    let genericAgentId;
    let budgetGptId;
    let budgetClaudeId;
    const input = (extra) => ({
        userId: userId || '',
        decisionId: 'd1',
        executionId: 'e1',
        taskId: 't1',
        taskType: 'debate',
        routingMode: 'auto',
        ...extra,
    });
    (0, node_test_1.before)(async () => {
        if (mongoose_1.default.connection.readyState === 0) {
            await mongoose_1.default.connect(TEST_URI);
        }
        await clean();
        userId = new mongoose_1.default.Types.ObjectId().toString();
        otherUserId = new mongoose_1.default.Types.ObjectId().toString();
        budgetUser = new mongoose_1.default.Types.ObjectId().toString();
        // Models for the main user, in deterministic creation order.
        const modelsDef = [
            { provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected', apiKey: (0, encryption_1.encryptApiKey)('sk-test-openai') },
            { provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected', apiKey: (0, encryption_1.encryptApiKey)('sk-test-anthropic') },
            { provider: 'mock', displayName: 'Custom Model', modelName: 'my-custom-model', status: 'connected', apiKey: (0, encryption_1.encryptApiKey)('sk-test-custom') },
            { provider: 'openai', displayName: 'GPT-4 Turbo (untested)', modelName: 'gpt-4-turbo', status: 'untested', apiKey: (0, encryption_1.encryptApiKey)('sk-test-turbo') },
            { provider: 'openai', displayName: 'Broken model', modelName: 'claude-3-opus', status: 'error', apiKey: (0, encryption_1.encryptApiKey)('sk-test-broken') },
            { provider: 'openai', displayName: 'Keyless model', modelName: 'gpt-3.5-turbo', status: 'connected' },
        ];
        const created = [];
        for (const def of modelsDef) {
            const m = await Model_1.default.create({ ...def, userId });
            created.push(m);
        }
        [gpt4oId, claudeId, unknownPriceId, untestedId, brokenId, keylessId] = created.map((m) => m._id.toString());
        const agentsDef = [
            { name: 'Researcher', capabilities: ['research', 'reasoning'] },
            { name: 'Fact Checker', capabilities: ['fact_checking', 'reasoning'] },
            { name: 'Generic', capabilities: [] },
        ];
        const agentsCreated = [];
        for (const def of agentsDef) {
            const a = await Agent_1.default.create({ ...def, userId });
            agentsCreated.push(a);
        }
        [researchAgentId, , genericAgentId] = agentsCreated.map((a) => a._id.toString());
        // A second user with nothing at all (ownership isolation).
        const budgetGpt = await Model_1.default.create({
            provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected',
            apiKey: (0, encryption_1.encryptApiKey)('sk-test-budget-1'), userId: budgetUser,
        });
        const budgetClaude = await Model_1.default.create({
            provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected',
            apiKey: (0, encryption_1.encryptApiKey)('sk-test-budget-2'), userId: budgetUser,
        });
        budgetGptId = budgetGpt._id.toString();
        budgetClaudeId = budgetClaude._id.toString();
        await Agent_1.default.create({ name: 'Budget Agent', capabilities: ['reasoning'], userId: budgetUser });
    });
    (0, node_test_1.after)(async () => {
        await clean();
        await mongoose_1.default.connection.close();
    });
    (0, node_test_1.describe)('availability & ownership', () => {
        (0, node_test_1.test)('disabled/errored/keyless models are not routable; keyed models become candidates', async () => {
            const { candidates, modelCount, agentCount } = await (0, candidateResolver_1.resolveCandidates)({
                userId,
                taskType: 'debate',
                requirements: [],
                policy: (0, routing_1.makeRoutingPolicy)(),
            });
            strict_1.default.equal(agentCount, 3);
            strict_1.default.equal(modelCount, 4); // gpt-4o, claude, unknown price, untested
            const modelIds = new Set(candidates.map((c) => String(c.model._id)));
            strict_1.default.ok(modelIds.has(gpt4oId));
            strict_1.default.ok(modelIds.has(claudeId));
            strict_1.default.ok(modelIds.has(untestedId));
            strict_1.default.ok(modelIds.has(unknownPriceId));
            strict_1.default.ok(!modelIds.has(brokenId), 'errored model excluded');
            strict_1.default.ok(!modelIds.has(keylessId), 'keyless model excluded');
        });
        (0, node_test_1.test)('a user with no models or agents gets a skip (backward-compat, never a failure)', async () => {
            const result = await routing_1.RouteTaskRouter.buildForTest().routeTask(input({ userId: otherUserId }));
            strict_1.default.equal(result.status, 'skipped');
            strict_1.default.match(result.reason, /routing skipped/);
        });
        (0, node_test_1.test)('manual mode with an unavailable or missing model is a hard failure', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest();
            const broken = await router.routeTask(input({ routingMode: 'manual', manualModelId: brokenId }));
            strict_1.default.equal(broken.status, 'failed');
            strict_1.default.equal(broken.code, 'MANUAL_MODEL_UNAVAILABLE');
            const missing = await router.routeTask(input({ routingMode: 'manual' }));
            strict_1.default.equal(missing.code, 'MANUAL_MODEL_UNAVAILABLE');
            const ok = await router.routeTask(input({ routingMode: 'manual', manualModelId: claudeId }));
            isSelected(ok);
            strict_1.default.equal(ok.model.id, claudeId);
            strict_1.default.equal(ok.mode, 'manual');
        });
        (0, node_test_1.test)('budget gate fails when every pricing-known candidate exceeds the per-task budget', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({ maxEstimatedCostPerTask: 1e-9 });
            const result = await router.routeTask(input({ userId: budgetUser }));
            strict_1.default.equal(result.status, 'failed');
            strict_1.default.equal(result.code, 'NO_CANDIDATE_WITHIN_BUDGET');
        });
        (0, node_test_1.test)('manual pins cannot bypass the budget gate', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({ maxEstimatedCostPerTask: 1e-9 });
            const result = await router.routeTask(input({ userId: budgetUser, routingMode: 'manual', manualModelId: budgetGptId }));
            strict_1.default.equal(result.status, 'failed');
            strict_1.default.equal(result.code, 'NO_CANDIDATE_WITHIN_BUDGET');
        });
    });
    (0, node_test_1.describe)('deterministic scoring', () => {
        (0, node_test_1.test)('when all else is equal, the cheapest known-price model wins', async () => {
            const r = await routing_1.RouteTaskRouter.buildForTest().routeTask(input());
            isSelected(r);
            strict_1.default.equal(r.model.id, claudeId, 'claude-3-5-sonnet is the cheapest routable model');
            strict_1.default.ok(r.agent?.capabilities.includes('reasoning'), 'selected agent covers the debate soft requirement');
            strict_1.default.ok(r.estimate.pricingKnown);
            const cost = r.score.factors.find((f) => f.name === 'cost');
            strict_1.default.equal(cost?.value, 1, 'cheapest model scores max on the cost factor');
        });
        (0, node_test_1.test)('quality override dominates cost', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({
                qualityOverrides: { 'gpt-4o': 1, 'claude-3-5-sonnet': 0 },
            });
            const r = await router.routeTask(input());
            isSelected(r);
            strict_1.default.equal(r.model.id, gpt4oId);
        });
        (0, node_test_1.test)('reliability status prior drives selection when it is the only weight', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({ weights: { reliability: 1 } });
            const r = await router.routeTask(input());
            isSelected(r);
            strict_1.default.equal(r.model.status, 'connected', 'connected beats untested under pure reliability weighting');
            const reliability = r.score.factors.find((f) => f.name === 'reliability');
            strict_1.default.ok(reliability?.note?.includes('connected'));
        });
        (0, node_test_1.test)('capability soft preference favors an agent that covers the task soft requirements', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({ weights: { capability: 1 } });
            const r = await router.routeTask(input());
            isSelected(r);
            const capability = r.score.factors.find((f) => f.name === 'capability');
            strict_1.default.equal(capability?.value, 1);
            strict_1.default.notEqual(r.agent?.id, genericAgentId, 'winner is not the agent with zero soft coverage');
            strict_1.default.ok(r.agent?.capabilities.includes('reasoning'), 'winner beats agents with no coverage');
        });
        (0, node_test_1.test)('hard requirements gate out agents that do not cover them (relaxable by policy)', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest();
            const relaxed = await router.routeTask(input({ requirements: ['security_review'] }));
            isSelected(relaxed);
            strict_1.default.equal(relaxed.capabilityGateRelaxed, true);
            strict_1.default.ok(relaxed.reasons.some((x) => x.includes('gate relaxed')));
            const strict = routing_1.RouteTaskRouter.buildForTest({ allowCapabilityGateRelaxation: false });
            const failed = await strict.routeTask(input({ requirements: ['security_review'] }));
            strict_1.default.equal(failed.status, 'failed');
            strict_1.default.equal(failed.code, 'NO_AGENT_COVERS_REQUIREMENTS');
        });
        (0, node_test_1.test)('verify_claim applies a soft diversity bonus for a provider different from the debate', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest({ weights: { cost: 0 } });
            const r1 = await router.routeTask(input({
                taskType: 'verify_claim',
                requirements: ['fact_checking'],
                primaryProvider: 'openai',
            }));
            isSelected(r1);
            strict_1.default.notEqual(r1.model.provider, 'openai', 'a non-openai provider differs from the openai primary');
            strict_1.default.ok(r1.reasons.some((x) => x.includes('diversity')));
            const r2 = await router.routeTask(input({
                taskType: 'verify_claim',
                requirements: ['fact_checking'],
                primaryProvider: 'anthropic',
            }));
            isSelected(r2);
            strict_1.default.notEqual(r2.model.provider, 'anthropic', 'a non-anthropic provider differs from the anthropic primary');
            strict_1.default.ok(r2.reasons.some((x) => x.includes('diversity')));
        });
        (0, node_test_1.test)('selection is deterministic across repeated invocations', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest();
            const a = await router.routeTask(input());
            const b = await router.routeTask(input());
            isSelected(a);
            isSelected(b);
            strict_1.default.deepEqual(picked(a), picked(b));
            strict_1.default.equal(a.score.total, b.score.total);
            strict_1.default.deepEqual(a.reasons, b.reasons);
            strict_1.default.equal(a.policyVersion, 'routing-v1');
        });
    });
    (0, node_test_1.describe)('fallback (bounded reselection)', () => {
        (0, node_test_1.test)('retry fallback excludes the failed model and marks the reselection fallbackUsed', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest();
            const first = await router.routeTask(input());
            isSelected(first);
            strict_1.default.equal(first.model.id, claudeId); // cheapest, as established above
            const fallback = await router.routeFallbackForRetry(input({ excludeModelIds: [claudeId] }));
            isSelected(fallback);
            strict_1.default.equal(fallback.fallbackUsed, true);
            strict_1.default.equal(fallback.fallbackFrom?.modelId, claudeId);
            strict_1.default.notEqual(fallback.model.id, claudeId);
            strict_1.default.equal(fallback.model.id, gpt4oId, 'gpt-4o is the next best after excluding claude');
        });
        (0, node_test_1.test)('excluding every routable model skips (no alternative keeps retries bounded)', async () => {
            const result = await routing_1.RouteTaskRouter.buildForTest().routeTask(input({
                userId: budgetUser,
                excludeModelIds: [budgetGptId, budgetClaudeId],
            }));
            strict_1.default.equal(result.status, 'skipped');
        });
        (0, node_test_1.test)('fallback never re-picks an excluded (failed) model', async () => {
            const router = routing_1.RouteTaskRouter.buildForTest();
            const excluded = [claudeId, gpt4oId];
            const fallback = await router.routeFallbackForRetry(input({ excludeModelIds: excluded }));
            isSelected(fallback);
            strict_1.default.ok(!excluded.includes(fallback.model.id), 'failed model is not re-picked');
            strict_1.default.notEqual(fallback.model.status, 'error', 'fallback target is routable');
            strict_1.default.equal(fallback.fallbackUsed, true);
            strict_1.default.equal(fallback.fallbackFrom?.modelId, gpt4oId, 'fallback records the most recently failed model');
            // Excluding every routable model leaves no alternative: the router skips
            // rather than retrying the failed model (keeps runtime fallback bounded).
            const exhausted = await router.routeTask(input({ excludeModelIds: [claudeId, gpt4oId, unknownPriceId, untestedId] }));
            strict_1.default.equal(exhausted.status, 'skipped');
        });
    });
});
(0, node_test_1.describe)('Phase 6 — executor integration: persist, reuse, and complete routed runs', () => {
    let capturedRouting;
    let userId;
    let decisionId;
    let claudeId;
    let researchAgentId;
    class FakeDebateHandler {
        constructor() {
            this.type = 'debate';
        }
        canHandle(type) {
            return type === 'debate';
        }
        async execute(task, context) {
            capturedRouting = context.routing;
            await Claim_1.default.create({
                decisionId: context.decisionId,
                executionId: context.executionId,
                taskId: context.taskId,
                text: 'Routed decision claim.',
                type: 'fact',
                status: 'proposed',
                evidenceIds: [],
                supportingEvidenceIds: [],
                provenanceKind: 'inferred',
            });
            return {
                output: {
                    verdict: { recommendation: 'Proceed.', confidenceScore: 0.8 },
                    messages: [],
                    strategy: 'consensus',
                },
            };
        }
    }
    function makeRegistry() {
        return new handlers_1.DefaultTaskHandlerRegistry([
            new FakeDebateHandler(),
            verifyClaimHandler_1.verifyClaimHandler,
            redTeamHandler_1.redTeamHandler,
            reconciliationHandler_1.reconciliationHandler,
        ]);
    }
    function simplePlan() {
        return {
            version: '1.0',
            source: 'intelligent',
            tasks: [
                {
                    tempId: 'debate',
                    type: 'debate',
                    purpose: 'Simple decision: debate it.',
                    input: { strategy: 'judge', description: 'Simple decision.' },
                    dependsOn: [],
                    priority: 1,
                    requirements: ['reasoning'],
                },
            ],
            termination: { requiresVerification: false, requiresRedTeam: false, requiresReconciliation: true },
            rationale: { summary: 'simple', research: 'none', debate: '1', verification: 'off', redTeam: 'off' },
            estimates: { estimatedTasks: 1, estimatedResearchTasks: 0, estimatedLLMTasks: 1 },
        };
    }
    const planCallFor = (plan) => async () => ({ ok: true, text: JSON.stringify(plan) });
    async function waitUntil(fn, timeoutMs = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await fn())
                return;
            await new Promise((r) => setTimeout(r, 30));
        }
        throw new Error('Timed out waiting for condition');
    }
    async function runRoutedExecution(withMetadataRouting) {
        const execution = await Execution_1.default.create({
            decisionId,
            status: 'pending',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
            planningStatus: 'planning',
            planningMode: 'intelligent',
            metadata: withMetadataRouting
                ? { routing: { mode: 'auto' } }
                : undefined,
        });
        const executionId = execution._id.toString();
        const planner = new planner_1.DecisionPlanner({ policy: (0, planningPolicy_1.makePlanningPolicy)() });
        const result = await planner.planExecution({
            executionId,
            userId,
            planningMode: 'intelligent',
            planCall: planCallFor(simplePlan()),
        });
        strict_1.default.equal(result.planSource, 'intelligent');
        await Execution_1.default.updateOne({ _id: execution._id }, { $set: { status: 'queued', planningStatus: 'planned' } });
        const worker = makeWorker();
        for (let i = 0; i < 50 && (await Execution_1.default.findById(executionId))?.status !== 'completed'; i++) {
            await worker.tickNow();
            await new Promise((r) => setTimeout(r, 30));
        }
        await waitUntil(async () => {
            const e = await Execution_1.default.findById(executionId);
            return !!e && e.status === 'completed';
        });
        const tasks = await Task_1.default.find({ executionId });
        strict_1.default.equal(tasks.length, 1);
        return { executionId, task: tasks[0] };
    }
    function makeWorker() {
        const executor = new executor_1.TaskExecutor({
            registry: makeRegistry(),
            workerId: 'test-routing-worker',
            backoff: () => 5,
            router: routing_1.RouteTaskRouter.buildForTest(),
        });
        return new worker_1.Worker({
            executor,
            pollIntervalMs: 100000,
            maxConcurrentTasks: 6,
            staleTaskTimeoutMs: 120000,
        });
    }
    (0, node_test_1.before)(async () => {
        if (mongoose_1.default.connection.readyState === 0) {
            await mongoose_1.default.connect(TEST_URI);
        }
        await clean();
        userId = new mongoose_1.default.Types.ObjectId().toString();
        const gpt = await Model_1.default.create({
            provider: 'openai', displayName: 'GPT-4o', modelName: 'gpt-4o', status: 'connected',
            apiKey: (0, encryption_1.encryptApiKey)('sk-test-openai'), userId,
        });
        void gpt;
        const claude = await Model_1.default.create({
            provider: 'anthropic', displayName: 'Claude 3.5 Sonnet', modelName: 'claude-3-5-sonnet', status: 'connected',
            apiKey: (0, encryption_1.encryptApiKey)('sk-test-anthropic'), userId,
        });
        gpt4oId: void gpt;
        claudeId = claude._id.toString();
        const research = await Agent_1.default.create({ name: 'Researcher', capabilities: ['research', 'reasoning'], userId });
        researchAgentId = research._id.toString();
        const decision = await Decision_1.default.create({
            userId,
            title: 'Routing E2E',
            objective: 'Should we adopt microservices?',
            context: 'Routed execution.',
            status: 'debating',
            configuration: { strategy: 'consensus', maxRounds: 2 },
            assumptions: [],
        });
        decisionId = decision._id.toString();
    });
    (0, node_test_1.after)(async () => {
        await clean();
        await mongoose_1.default.connection.close();
    });
    (0, node_test_1.test)('an auto-routed execution persists chosen agent/model and hands routing to the handler', async () => {
        capturedRouting = undefined;
        const { task: debate } = await runRoutedExecution(true);
        strict_1.default.equal(debate.type, 'debate');
        strict_1.default.equal(debate.status, 'completed');
        const routingMeta = debate.metadata?.routing;
        strict_1.default.ok(routingMeta, 'task carries persisted routing metadata');
        strict_1.default.equal(routingMeta.mode, 'auto');
        strict_1.default.equal(routingMeta.selection?.status, 'selected');
        strict_1.default.equal(String(debate.assignedAgent), String(routingMeta.selection?.agent?.id));
        strict_1.default.equal(String(debate.assignedModel), String(routingMeta.selection?.model?.id));
        strict_1.default.equal(routingMeta.selection?.policyVersion, 'routing-v1');
        // Deterministic outcome for this seed: cheapest connected model + researcher.
        strict_1.default.equal(routingMeta.selection?.model.id, claudeId);
        // The handler received routing through the context (never a credential).
        const routingFromHandler = capturedRouting;
        strict_1.default.ok(routingFromHandler, 'handler received routing context');
        strict_1.default.equal(routingFromHandler.modelId, String(debate.assignedModel));
        strict_1.default.equal(routingFromHandler.modelName, 'claude-3-5-sonnet');
        strict_1.default.equal(routingFromHandler.agentId, researchAgentId);
        strict_1.default.equal(routingFromHandler.provider, 'anthropic');
    });
    (0, node_test_1.test)('a routed task reuses its persisted selection on re-execution (idempotent, no reselection)', async () => {
        const { executionId, task } = await runRoutedExecution(true);
        const first = task.metadata?.routing;
        strict_1.default.ok(first.selection);
        const firstRoutedAt = first.selection?.routedAt?.toISOString();
        const another = await Task_1.default.findById(task._id);
        const exec = await Execution_1.default.findById(executionId);
        strict_1.default.ok(another && exec);
        await Task_1.default.updateOne({ _id: another._id }, { $set: { status: 'pending', error: undefined, completedAt: undefined, workerId: undefined, leasedAt: undefined } });
        const executor = new executor_1.TaskExecutor({
            registry: makeRegistry(),
            workerId: 'routing-retry-worker',
            backoff: () => 5,
            router: routing_1.RouteTaskRouter.buildForTest(),
        });
        await executor.execute(userId, exec, another);
        const after = (await Task_1.default.findById(another._id));
        const second = after.metadata?.routing;
        strict_1.default.equal(second.selection?.model.id, first.selection?.model.id);
        strict_1.default.equal(second.selection?.routedAt?.toISOString(), firstRoutedAt, 'selection reused, not recreated');
    });
    (0, node_test_1.test)('legacy executions without routing metadata skip routing and still complete', async () => {
        capturedRouting = undefined;
        const { task } = await runRoutedExecution(false);
        strict_1.default.equal(task.status, 'completed');
        strict_1.default.ok(!task.metadata?.routing, 'no routing metadata written on the legacy path');
        strict_1.default.ok(!capturedRouting, 'handler got no routing context on the legacy path');
    });
});
