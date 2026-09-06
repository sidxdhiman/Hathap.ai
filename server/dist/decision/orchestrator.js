"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionOrchestrator = exports.DecisionOrchestrator = void 0;
const Decision_1 = __importDefault(require("../models/Decision"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const Courtroom_1 = __importDefault(require("../models/Courtroom"));
const stateMachine_1 = require("./stateMachine");
const usage_1 = require("./usage");
const debateEngine_1 = require("../engine/debateEngine");
const debateValidation_1 = require("../services/debateValidation");
class DecisionOrchestrator {
    async createDecision(input) {
        const decision = new Decision_1.default({
            userId: input.userId,
            title: input.title,
            objective: input.objective,
            context: input.context,
            status: 'draft',
            currentPhase: 'draft',
            configuration: {
                strategy: input.configuration?.strategy || 'consensus',
                maxRounds: input.configuration?.maxRounds || 3,
                maxAgents: input.configuration?.maxAgents || 10,
                pauseOnAgreement: input.configuration?.pauseOnAgreement ?? true,
                verificationEnabled: input.configuration?.verificationEnabled ?? false,
            },
            participants: input.participants || [],
            assumptions: input.assumptions || [],
            metadata: input.metadata,
        });
        await decision.save();
        await this.recordEvidence({
            decisionId: decision._id.toString(),
            type: 'objective',
            title: 'Decision Objective',
            content: input.objective,
            sourceType: 'user_input',
            retrievedAt: new Date(),
        });
        return decision;
    }
    /**
     * Start a decision execution. Creates a persistent Execution and runs
     * a series of Tasks through the debate engine (the existing, proven
     * execution layer) while recording granular lifecycle data.
     */
    async startDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision) {
            throw new Error('Decision not found.');
        }
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'debating');
        decision.status = 'debating';
        decision.currentPhase = 'debating';
        await decision.save();
        const execution = new Execution_1.default({
            decisionId,
            status: 'running',
            startedAt: new Date(),
            currentPhase: 'debating',
            progress: 0,
        });
        await execution.save();
        const usageRecords = [];
        try {
            // ---- Phase 1: Initial Analysis Task ----
            await this.createTask(execution._id.toString(), {
                type: 'analysis',
                input: { description: 'Initial agent analysis' },
                priority: 1,
            });
            // ---- Phase 2: Run the debate via DebateEngine ----
            const result = await this.runDebate(decision, execution, usageRecords);
            decision.confidence = result.verdict?.confidenceScore;
            // ---- Phase 3: Persist claims from debate messages ----
            await this.persistClaimsFromDebate(decision, result.messages);
            // ---- Finalize execution ----
            const totalUsage = (0, usage_1.aggregateUsage)(usageRecords);
            execution.tokenUsage = totalUsage;
            execution.estimatedCost = totalUsage.estimatedCost;
            execution.actualCost = totalUsage.estimatedCost;
            execution.progress = 100;
            execution.status = 'completed';
            execution.completedAt = new Date();
            await execution.save();
            // ---- Finalize decision ----
            stateMachine_1.StateMachine.transitionDecision(decision.status, 'completed');
            decision.status = 'completed';
            decision.currentPhase = 'completed';
            decision.completedAt = new Date();
            await decision.save();
            return execution;
        }
        catch (error) {
            execution.status = 'failed';
            execution.error = {
                code: this.classifyError(error),
                message: error?.message || 'Decision execution failed.',
                retryable: true,
                retryCount: execution.retryCount,
                createdAt: new Date(),
            };
            const totalUsage = (0, usage_1.aggregateUsage)(usageRecords);
            execution.tokenUsage = totalUsage;
            execution.estimatedCost = totalUsage.estimatedCost;
            execution.completedAt = new Date();
            await execution.save();
            decision.status = 'failed';
            await decision.save();
            throw error;
        }
    }
    /**
     * Create a persistent Execution and linked Decision for a debate that ran
     * through the classic Courtroom path (`debateEngine.runDebate`). This keeps
     * the two execution models in sync without forcing the courtroom flow to
     * change its behavior.
     */
    async createCourthouseExecution(courtroomId, userId, result, usageRecords) {
        const courtroom = await Courtroom_1.default.findOne({ _id: courtroomId, userId });
        if (!courtroom)
            return null;
        const decision = await this.linkFromCourtroom(courtroom, null, result.messages || [], result.verdict, usageRecords);
        const totalUsage = (0, usage_1.aggregateUsage)(usageRecords);
        const execution = new Execution_1.default({
            decisionId: decision?._id,
            status: 'completed',
            startedAt: new Date(),
            completedAt: new Date(),
            currentPhase: 'completed',
            progress: 100,
            tokenUsage: totalUsage,
            estimatedCost: totalUsage.estimatedCost,
            actualCost: totalUsage.estimatedCost,
            metadata: { courtroomId },
        });
        await execution.save();
        return execution;
    }
    async pauseDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'paused');
        decision.status = 'paused';
        await decision.save();
    }
    async resumeDecision(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        stateMachine_1.StateMachine.transitionDecision(decision.status, 'debating');
        decision.status = 'debating';
        await decision.save();
    }
    async getSnapshot(decisionId, userId) {
        const decision = await Decision_1.default.findOne({ _id: decisionId, userId });
        if (!decision)
            throw new Error('Decision not found.');
        const executions = await Execution_1.default.find({ decisionId }).sort({ createdAt: -1 });
        const tasks = await Task_1.default.find({
            executionId: { $in: executions.map((e) => e._id) },
        }).sort({ priority: 1 });
        const claims = await Claim_1.default.find({ decisionId });
        const evidence = await Evidence_1.default.find({ decisionId });
        return {
            id: decision._id.toString(),
            status: decision.status,
            currentPhase: decision.currentPhase,
            confidence: decision.confidence,
            executions,
            tasks,
            claims,
            evidence,
        };
    }
    async linkFromCourtroom(courtroom, execution, messages, verdict, usageRecords) {
        const existing = await Decision_1.default.findOne({ courtroomId: courtroom._id });
        if (existing)
            return existing;
        const decision = new Decision_1.default({
            userId: courtroom.userId,
            courtroomId: courtroom._id,
            title: courtroom.name || 'Untitled Decision',
            objective: courtroom.objective || '',
            status: 'completed',
            currentPhase: 'completed',
            completedAt: new Date(),
            configuration: {
                strategy: courtroom.mode || 'consensus',
                maxRounds: 3,
                participants: courtroom.participants,
            },
            participants: courtroom.participants,
            confidence: verdict?.confidenceScore,
            metadata: { linkedFromCourtroom: true },
        });
        const saved = await decision.save();
        await this.recordEvidence({
            decisionId: saved._id.toString(),
            type: 'objective',
            title: 'Decision Objective',
            content: courtroom.objective || '',
            sourceType: 'user_input',
            retrievedAt: new Date(),
        });
        await this.recordEvidence({
            decisionId: saved._id.toString(),
            type: 'verdict',
            title: 'Synthesized Verdict',
            content: verdict?.recommendation || '',
            sourceType: 'agent_generated',
            retrievedAt: new Date(),
        });
        for (const msg of messages) {
            if (msg.parsedResponse) {
                await this.persistClaimsFromMessage(saved, msg);
            }
        }
        return saved;
    }
    async runDebate(decision, execution, usageRecords) {
        const strategy = decision.configuration?.strategy || 'consensus';
        const normalized = (0, debateValidation_1.normalizeDebateMode)(strategy);
        const results = [];
        const taskResults = {
            messages: [],
            verdict: null,
        };
        try {
            const result = await debateEngine_1.debateEngine.executeForDecision({
                decisionId: decision._id.toString(),
                userId: decision.userId.toString(),
                strategy: normalized,
                participants: decision.participants,
                onUsage: (usage) => usageRecords.push(usage),
            });
            taskResults.messages = result.messages;
            taskResults.verdict = result.verdict;
            results.push(result);
        }
        catch (error) {
            throw error;
        }
        return {
            messages: taskResults.messages,
            verdict: taskResults.verdict,
        };
    }
    async createTask(executionId, definition) {
        const task = new Task_1.default({
            executionId,
            type: definition.type,
            status: 'completed',
            priority: definition.priority || 0,
            input: definition.input || {},
            assignedAgent: definition.assignedAgent,
            assignedModel: definition.assignedModel,
            dependencies: definition.dependencies || [],
            startedAt: new Date(),
            completedAt: new Date(),
        });
        await task.save();
        return task;
    }
    async persistClaimsFromDebate(decision, messages) {
        for (const msg of messages) {
            await this.persistClaimsFromMessage(decision, msg);
        }
    }
    async persistClaimsFromMessage(decision, msg) {
        const parsed = msg.parsedResponse;
        if (!parsed)
            return;
        const claims = [];
        if (parsed.position && typeof parsed.position === 'string') {
            claims.push({ text: parsed.position, type: 'opinion' });
        }
        if (Array.isArray(parsed.arguments)) {
            for (const arg of parsed.arguments) {
                claims.push({ text: String(arg), type: 'inference' });
            }
        }
        if (Array.isArray(parsed.risks)) {
            for (const risk of parsed.risks) {
                claims.push({ text: String(risk), type: 'risk' });
            }
        }
        if (parsed.recommendation && typeof parsed.recommendation === 'string') {
            claims.push({ text: parsed.recommendation, type: 'recommendation' });
        }
        for (const c of claims) {
            const claim = new Claim_1.default({
                decisionId: decision._id.toString(),
                agentId: msg.agentId || msg.agentName,
                text: c.text,
                type: c.type,
                status: 'proposed',
                evidenceIds: [],
                sourceAgentId: msg.agentId,
            });
            await claim.save();
        }
    }
    async recordEvidence(params) {
        const evidence = new Evidence_1.default({
            decisionId: params.decisionId,
            type: params.type,
            title: params.title,
            content: params.content,
            sourceType: params.sourceType,
            source: params.source,
            retrievedAt: params.retrievedAt,
            metadata: params.metadata,
        });
        await evidence.save();
        return evidence;
    }
    classifyError(error) {
        const message = error?.message || '';
        if (/timeout/i.test(message))
            return 'TIMEOUT';
        if (/rate limit|429/i.test(message))
            return 'RATE_LIMIT';
        if (/credit|402/i.test(message))
            return 'INSUFFICIENT_CREDITS';
        if (/api key|invalid key|401/i.test(message))
            return 'INVALID_API_KEY';
        if (/malformed|parse/i.test(message))
            return 'MALFORMED_OUTPUT';
        if (/model.*unavailable|not found/i.test(message))
            return 'MODEL_UNAVAILABLE';
        if (/network|fetch failed|ECONNRESET/i.test(message))
            return 'NETWORK_FAILURE';
        return 'AGENT_FAILURE';
    }
}
exports.DecisionOrchestrator = DecisionOrchestrator;
exports.decisionOrchestrator = new DecisionOrchestrator();
