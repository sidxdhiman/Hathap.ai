"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const reconciliationService_1 = require("../decision/reconciliationService");
const verificationService_1 = require("../decision/verificationService");
const redTeamService_1 = require("../decision/redTeamService");
const evidenceGraphService_1 = require("../decision/evidenceGraphService");
const ReconciliationResult_1 = __importDefault(require("../models/ReconciliationResult"));
const VerificationResult_1 = __importDefault(require("../models/VerificationResult"));
const RedTeamFinding_1 = __importDefault(require("../models/RedTeamFinding"));
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const Execution_1 = __importDefault(require("../models/Execution"));
const Task_1 = __importDefault(require("../models/Task"));
const Decision_1 = __importDefault(require("../models/Decision"));
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';
let userId;
let decisionId;
let executionId;
let supportingClaimId;
let contradictedClaimId;
let assumptionClaimId;
let supportingEvidenceId;
let contradictingEvidenceId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await Promise.all([
        ReconciliationResult_1.default.deleteMany({}),
        VerificationResult_1.default.deleteMany({}),
        RedTeamFinding_1.default.deleteMany({}),
        EvidenceRelationship_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
    userId = new mongoose_1.default.Types.ObjectId().toString();
    const decision = await Decision_1.default.create({
        userId,
        title: 'Recon Test',
        objective: 'Pick a datastore.',
        context: 'Test.',
        status: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
    const execution = await Execution_1.default.create({
        decisionId,
        status: 'running',
        progress: 75,
        currentPhase: 'verifying',
    });
    executionId = execution._id.toString();
    const evSupport = await Evidence_1.default.create({
        decisionId,
        title: 'Supports',
        content: 'Good.',
        sourceType: 'user_input',
    });
    const evContradict = await Evidence_1.default.create({
        decisionId,
        title: 'Contradicts',
        content: 'Bad.',
        sourceType: 'user_input',
    });
    supportingEvidenceId = evSupport._id.toString();
    contradictingEvidenceId = evContradict._id.toString();
    const supported = await Claim_1.default.create({
        decisionId,
        text: 'Supported claim.',
        type: 'fact',
        evidenceIds: [supportingEvidenceId],
    });
    const contradicted = await Claim_1.default.create({
        decisionId,
        text: 'Contradicted claim.',
        type: 'fact',
        evidenceIds: [contradictingEvidenceId],
        contradictingEvidenceIds: [contradictingEvidenceId],
    });
    supportingClaimId = supported._id.toString();
    contradictedClaimId = contradicted._id.toString();
    // An unsupported assumption that the red team should flag.
    const assumption = await Claim_1.default.create({
        decisionId,
        text: 'Assumes a stable team.',
        type: 'assumption',
        evidenceIds: [],
    });
    assumptionClaimId = assumption._id.toString();
    await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
        claimId: supportingClaimId,
        evidenceId: supportingEvidenceId,
        relationship: 'supports',
        source: 'research',
        decisionId,
    });
    await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
        claimId: contradictedClaimId,
        evidenceId: contradictingEvidenceId,
        relationship: 'contradicts',
        source: 'research',
        decisionId,
    });
    // Persist verification results for both claims.
    await verificationService_1.verificationService.verifyClaim({
        claimId: supportingClaimId,
        claimStatement: 'Supported claim.',
        evidenceIds: [supportingEvidenceId],
        decisionId,
        executionId,
        taskId: new mongoose_1.default.Types.ObjectId().toString(),
    });
    await verificationService_1.verificationService.verifyClaim({
        claimId: contradictedClaimId,
        claimStatement: 'Contradicted claim.',
        evidenceIds: [contradictingEvidenceId],
        decisionId,
        executionId,
        taskId: new mongoose_1.default.Types.ObjectId().toString(),
    });
    // Persist a red-team finding flagging the contradicted claim.
    await redTeamService_1.redTeamService.runRedTeamAnalysis({
        decisionId,
        executionId,
        taskId: new mongoose_1.default.Types.ObjectId().toString(),
        candidateRecommendation: 'Adopt the datastore.',
        claimIds: [supportingClaimId, contradictedClaimId, assumptionClaimId],
        evidenceIds: [supportingEvidenceId, contradictingEvidenceId],
    });
});
(0, node_test_1.after)(async () => {
    await Promise.all([
        ReconciliationResult_1.default.deleteMany({}),
        VerificationResult_1.default.deleteMany({}),
        RedTeamFinding_1.default.deleteMany({}),
        EvidenceRelationship_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
        Execution_1.default.deleteMany({}),
        Task_1.default.deleteMany({}),
        Decision_1.default.deleteMany({}),
    ]);
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('ReconciliationService', () => {
    (0, node_test_1.test)('rejects contradicted claims and keeps supported claims', async () => {
        const result = await reconciliationService_1.reconciliationService.runReconciliation({
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
            candidateRecommendation: 'Adopt the datastore.',
            claimIds: [supportingClaimId, contradictedClaimId],
            verifyClaimTaskIds: [],
            redTeamTaskId: undefined,
        });
        strict_1.default.ok(result.survivingClaimIds.includes(supportingClaimId));
        strict_1.default.ok(result.rejectedClaimIds.includes(contradictedClaimId));
    });
    (0, node_test_1.test)('flags needsMoreResearch when claims are contradicted', async () => {
        const result = await reconciliationService_1.reconciliationService.runReconciliation({
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
            candidateRecommendation: 'Adopt the datastore.',
            claimIds: [supportingClaimId, contradictedClaimId],
            verifyClaimTaskIds: [],
            redTeamTaskId: undefined,
        });
        strict_1.default.equal(result.needsMoreResearch, true);
        strict_1.default.ok(Array.isArray(result.researchQuestions));
        strict_1.default.ok(result.researchQuestions.length >= 1);
    });
    (0, node_test_1.test)('combines red-team findings', async () => {
        const redTeamFindings = await RedTeamFinding_1.default.find({ decisionId });
        const redTeamStateStore = redTeamFindings.map((f) => f._id);
        strict_1.default.ok(redTeamStateStore.length >= 1);
    });
    (0, node_test_1.test)('reconciliation is persisted per decision', async () => {
        const result = await reconciliationService_1.reconciliationService.runReconciliation({
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
            candidateRecommendation: 'Adopt the datastore.',
            claimIds: [supportingClaimId],
            verifyClaimTaskIds: [],
            redTeamTaskId: undefined,
        });
        const persisted = await ReconciliationResult_1.default.find({ decisionId, taskId: result.taskId });
        strict_1.default.ok(persisted.length >= 1);
    });
    (0, node_test_1.test)('persists a single reconciliation result (upsert keyed on decision+task)', async () => {
        const taskId = new mongoose_1.default.Types.ObjectId().toString();
        await reconciliationService_1.reconciliationService.runReconciliation({
            decisionId,
            executionId,
            taskId,
            candidateRecommendation: 'Adopt.',
            claimIds: [supportingClaimId],
            verifyClaimTaskIds: [],
            redTeamTaskId: undefined,
        });
        await reconciliationService_1.reconciliationService.runReconciliation({
            decisionId,
            executionId,
            taskId,
            candidateRecommendation: 'Adopt.',
            claimIds: [supportingClaimId],
            verifyClaimTaskIds: [],
            redTeamTaskId: undefined,
        });
        const count = await ReconciliationResult_1.default.countDocuments({ decisionId, taskId });
        strict_1.default.equal(count, 1);
    });
});
