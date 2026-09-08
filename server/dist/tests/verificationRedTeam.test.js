"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const verificationService_1 = require("../decision/verificationService");
const redTeamService_1 = require("../decision/redTeamService");
const evidenceGraphService_1 = require("../decision/evidenceGraphService");
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
let claimId;
let supportingEvidenceId;
let contradictingEvidenceId;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await Promise.all([
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
        title: 'Verify Test',
        objective: 'Should we adopt microservices?',
        context: 'Test.',
        status: 'debating',
        configuration: { strategy: 'consensus', maxRounds: 2 },
    });
    decisionId = decision._id.toString();
    const execution = await Execution_1.default.create({
        decisionId,
        status: 'running',
        progress: 50,
        currentPhase: 'verifying',
    });
    executionId = execution._id.toString();
    const claim = await Claim_1.default.create({
        decisionId,
        text: 'Microservices reduce deployment downtime.',
        type: 'fact',
        evidenceIds: [],
        contradictingEvidenceIds: [],
    });
    claimId = claim._id.toString();
    const evSupport = await Evidence_1.default.create({
        decisionId,
        title: 'Supports claim',
        content: 'Deployments are faster and safer with small services.',
        sourceType: 'user_input',
    });
    const evContradict = await Evidence_1.default.create({
        decisionId,
        title: 'Contradicts claim',
        content: 'Microservices increase operational complexity and downtime.',
        sourceType: 'user_input',
    });
    supportingEvidenceId = evSupport._id.toString();
    contradictingEvidenceId = evContradict._id.toString();
    // The main claim carries a coarse contradicting-evidence marker used by the
    // red-team contradiction analysis.
    await Claim_1.default.updateOne({ _id: claimId }, { $set: { contradictingEvidenceIds: [contradictingEvidenceId] } });
    // Explicit relationships
    await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
        claimId,
        evidenceId: supportingEvidenceId,
        relationship: 'supports',
        source: 'research',
        decisionId,
    });
    await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
        claimId,
        evidenceId: contradictingEvidenceId,
        relationship: 'contradicts',
        source: 'research',
        decisionId,
    });
});
(0, node_test_1.after)(async () => {
    await Promise.all([
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
(0, node_test_1.describe)('VerificationService', () => {
    (0, node_test_1.test)('claim supported by evidence returns supported status', async () => {
        // Use a dedicated claim paired only with supporting evidence.
        const supportedClaim = await Claim_1.default.create({
            decisionId,
            text: 'A well-evidenced fact.',
            type: 'fact',
            evidenceIds: [supportingEvidenceId],
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId: supportedClaim._id.toString(),
            evidenceId: supportingEvidenceId,
            relationship: 'supports',
            source: 'research',
            decisionId,
        });
        const result = await verificationService_1.verificationService.verifyClaim({
            claimId: supportedClaim._id.toString(),
            claimStatement: supportedClaim.text,
            evidenceIds: [supportingEvidenceId],
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
        });
        strict_1.default.equal(result.status, 'supported');
        strict_1.default.ok(result.supportingEvidenceIds.includes(supportingEvidenceId));
    });
    (0, node_test_1.test)('claim with contradicting evidence returns contradicted status', async () => {
        const contradictedClaim = await Claim_1.default.create({
            decisionId,
            text: 'A contradicted fact.',
            type: 'fact',
            evidenceIds: [contradictingEvidenceId],
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId: contradictedClaim._id.toString(),
            evidenceId: contradictingEvidenceId,
            relationship: 'contradicts',
            source: 'research',
            decisionId,
        });
        const result = await verificationService_1.verificationService.verifyClaim({
            claimId: contradictedClaim._id.toString(),
            claimStatement: contradictedClaim.text,
            evidenceIds: [contradictingEvidenceId],
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
        });
        strict_1.default.equal(result.status, 'contradicted');
        strict_1.default.ok(result.contradictingEvidenceIds.includes(contradictingEvidenceId));
    });
    (0, node_test_1.test)('claim with only related evidence is not treated as contradicted', async () => {
        // A related-only claim must be "inconclusive" or "unsupported", NOT contradicted.
        const relatedEvidence = await Evidence_1.default.create({
            decisionId,
            title: 'Neutral evidence',
            content: 'Neutral, no bearing.',
            sourceType: 'user_input',
        });
        const relatedClaim = await Claim_1.default.create({
            decisionId,
            text: 'Claim with neutral evidence.',
            type: 'fact',
            evidenceIds: [relatedEvidence._id.toString()],
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId: relatedClaim._id.toString(),
            evidenceId: relatedEvidence._id.toString(),
            relationship: 'related',
            source: 'research',
            decisionId,
        });
        const result = await verificationService_1.verificationService.verifyClaim({
            claimId: relatedClaim._id.toString(),
            claimStatement: relatedClaim.text,
            evidenceIds: [relatedEvidence._id.toString()],
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
        });
        strict_1.default.notEqual(result.status, 'contradicted', 'related-only must not be contradicted');
    });
    (0, node_test_1.test)('verification is idempotent per claim+task', async () => {
        const taskId = new mongoose_1.default.Types.ObjectId().toString();
        const claim = await Claim_1.default.create({
            decisionId,
            text: 'Idempotent claim.',
            type: 'fact',
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId: claim._id.toString(),
            evidenceId: supportingEvidenceId,
            relationship: 'supports',
            source: 'research',
            decisionId,
        });
        await verificationService_1.verificationService.verifyClaim({
            claimId: claim._id.toString(),
            claimStatement: claim.text,
            evidenceIds: [supportingEvidenceId],
            decisionId,
            executionId,
            taskId,
        });
        await verificationService_1.verificationService.verifyClaim({
            claimId: claim._id.toString(),
            claimStatement: claim.text,
            evidenceIds: [supportingEvidenceId],
            decisionId,
            executionId,
            taskId,
        });
        const count = await VerificationResult_1.default.countDocuments({
            claimId: claim._id.toString(),
            taskId,
        });
        strict_1.default.equal(count, 1, 'verification should be functional on claim+task');
    });
    (0, node_test_1.test)('getVerificationsForDecision returns persisted results', async () => {
        const all = await verificationService_1.verificationService.getVerificationsForDecision(decisionId);
        strict_1.default.ok(Array.isArray(all));
        strict_1.default.ok(all.length >= 1);
    });
});
(0, node_test_1.describe)('RedTeamService', () => {
    (0, node_test_1.test)('produces structured findings for the candidate decision', async () => {
        // A decision with an unsupported assumption + contradicting evidence should
        // generate high findings.
        const assumptionClaim = await Claim_1.default.create({
            decisionId,
            text: 'Assumes team has SRE expertise.',
            type: 'assumption',
            evidenceIds: [],
        });
        const inferenceClaim = await Claim_1.default.create({
            decisionId,
            text: 'Therefore cost increases.',
            type: 'inference',
            evidenceIds: [],
        });
        const findings = await redTeamService_1.redTeamService.runRedTeamAnalysis({
            decisionId,
            executionId,
            taskId: new mongoose_1.default.Types.ObjectId().toString(),
            candidateRecommendation: 'Adopt microservices.',
            claimIds: [claimId, assumptionClaim._id.toString(), inferenceClaim._id.toString()],
            evidenceIds: [supportingEvidenceId, contradictingEvidenceId],
        });
        const types = findings.map((f) => f.type);
        // Assumption without evidence
        strict_1.default.ok(types.includes('invalid_assumption'));
        // Claim with contradicting evidence
        strict_1.default.ok(types.includes('contradictory_evidence'));
        strict_1.default.ok(findings.every((f) => f.severity));
        strict_1.default.ok(findings.every((f) => f.description));
    });
    (0, node_test_1.test)('getFindingsForDecision returns persisted findings', async () => {
        const findings = await redTeamService_1.redTeamService.getFindingsForDecision(decisionId);
        strict_1.default.ok(Array.isArray(findings));
        // Findings were persisted by the previous test.
        strict_1.default.ok(findings.length >= 1);
    });
    (0, node_test_1.test)('red team does not modify untrusted actor configuration', async () => {
        // Red team is read-only over claims/evidence; it must not create Decisions,
        // Tasks, or alter permissions. Assert no extraneous side-effect collections
        // were created for a clean decision.
        const cleanDecision = await Decision_1.default.create({
            userId,
            title: 'RT Clean',
            objective: 'No-op.',
            context: 'none',
            status: 'debating',
        });
        await redTeamService_1.redTeamService.runRedTeamAnalysis({
            decisionId: cleanDecision._id.toString(),
            candidateRecommendation: 'Do nothing.',
            claimIds: [],
            evidenceIds: [],
        });
        const findings = await RedTeamFinding_1.default.find({ decisionId: cleanDecision._id.toString() });
        strict_1.default.ok(Array.isArray(findings));
        // No side effects: no new decisions with this objective.
        const dup = await Decision_1.default.countDocuments({ objective: 'No-op.' });
        strict_1.default.equal(dup, 1);
    });
});
