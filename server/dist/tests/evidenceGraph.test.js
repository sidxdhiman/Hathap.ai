"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const mongoose_1 = __importDefault(require("mongoose"));
const evidenceGraphService_1 = require("../decision/evidenceGraphService");
const EvidenceRelationship_1 = __importDefault(require("../models/EvidenceRelationship"));
const Claim_1 = __importDefault(require("../models/Claim"));
const Evidence_1 = __importDefault(require("../models/Evidence"));
const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';
let decisionId;
let claimId;
let evidenceIdA;
let evidenceIdB;
let evidenceIdC;
(0, node_test_1.before)(async () => {
    if (mongoose_1.default.connection.readyState === 0) {
        await mongoose_1.default.connect(TEST_URI);
    }
    await Promise.all([
        EvidenceRelationship_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
    ]);
    decisionId = new mongoose_1.default.Types.ObjectId().toString();
    const claim = await Claim_1.default.create({
        decisionId,
        text: 'Microservices reduce deployment downtime.',
        type: 'fact',
        evidenceIds: [],
    });
    claimId = claim._id.toString();
    const evA = await Evidence_1.default.create({
        decisionId,
        title: 'Evidence A',
        content: 'Supports the claim.',
        sourceType: 'user_input',
    });
    const evB = await Evidence_1.default.create({
        decisionId,
        title: 'Evidence B',
        content: 'Contradicts the claim.',
        sourceType: 'user_input',
    });
    const evC = await Evidence_1.default.create({
        decisionId,
        title: 'Evidence C',
        content: 'Related but neutral.',
        sourceType: 'user_input',
    });
    evidenceIdA = evA._id.toString();
    evidenceIdB = evB._id.toString();
    evidenceIdC = evC._id.toString();
});
(0, node_test_1.after)(async () => {
    await Promise.all([
        EvidenceRelationship_1.default.deleteMany({}),
        Claim_1.default.deleteMany({}),
        Evidence_1.default.deleteMany({}),
    ]);
    await mongoose_1.default.connection.close();
});
(0, node_test_1.describe)('EvidenceGraphService', () => {
    (0, node_test_1.test)('upsertRelationship creates a supports relationship', async () => {
        const rel = await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdA,
            relationship: 'supports',
            source: 'research',
            decisionId,
        });
        strict_1.default.equal(rel.relationship, 'supports');
        strict_1.default.equal(rel.claimId, claimId);
        strict_1.default.equal(rel.evidenceId, evidenceIdA);
    });
    (0, node_test_1.test)('upsertRelationship is idempotent (no duplicates)', async () => {
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdA,
            relationship: 'supports',
            source: 'research',
            decisionId,
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdA,
            relationship: 'supports',
            source: 'research',
            decisionId,
        });
        const count = await EvidenceRelationship_1.default.countDocuments({
            claimId,
            evidenceId: evidenceIdA,
        });
        strict_1.default.equal(count, 1, 'duplicate relationships must be prevented');
    });
    (0, node_test_1.test)('upsertRelationship can update an existing relationship type', async () => {
        // Flip evidence B from related to contradicts.
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdB,
            relationship: 'related',
            source: 'research',
            decisionId,
        });
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdB,
            relationship: 'contradicts',
            source: 'verification',
            decisionId,
            strength: 0.6,
        });
        const rels = await EvidenceRelationship_1.default.find({ claimId, evidenceId: evidenceIdB });
        strict_1.default.equal(rels.length, 1);
        strict_1.default.equal(rels[0].relationship, 'contradicts');
        strict_1.default.equal(rels[0].source, 'verification');
    });
    (0, node_test_1.test)('getRelationshipsForClaim categorizes by relationship type', async () => {
        // Ensure A supports, B contradicts, C related.
        await evidenceGraphService_1.evidenceGraphService.upsertRelationship({
            claimId,
            evidenceId: evidenceIdC,
            relationship: 'related',
            source: 'research',
            decisionId,
        });
        const rels = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(claimId);
        const supportsIds = rels.supports.map((r) => r.evidenceId);
        const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
        const relatedIds = rels.related.map((r) => r.evidenceId);
        strict_1.default.ok(supportsIds.includes(evidenceIdA));
        strict_1.default.ok(contradictsIds.includes(evidenceIdB));
        strict_1.default.ok(relatedIds.includes(evidenceIdC));
    });
    (0, node_test_1.test)('NOT(supports) !== contradicts: a related relationship is not a contradiction', async () => {
        // Evidence C is "related" only — it must NOT appear as a contradiction.
        const rels = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(claimId);
        const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
        strict_1.default.ok(!contradictsIds.includes(evidenceIdC), 'related is not a contradiction');
        // And absence of support does not imply contradiction for A's contradiction check.
        strict_1.default.ok(!rels.supports.map((r) => r.evidenceId).includes(evidenceIdB));
    });
    (0, node_test_1.test)('seedFromExistingClaims bridges coarse claim.evidenceIds', async () => {
        // Create a fresh claim with coarse evidenceIds + explicit support/contradict lists.
        const seedClaim = await Claim_1.default.create({
            decisionId,
            text: 'Seed claim.',
            type: 'inference',
            evidenceIds: [evidenceIdA, evidenceIdB, evidenceIdC],
            supportingEvidenceIds: [evidenceIdA],
            contradictingEvidenceIds: [evidenceIdB],
        });
        const { created } = await evidenceGraphService_1.evidenceGraphService.seedFromExistingClaims(decisionId);
        strict_1.default.ok(created > 0, 'relationships should be created for the seed claim');
        const rels = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForClaim(seedClaim._id.toString());
        const supportsIds = rels.supports.map((r) => r.evidenceId);
        const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
        const relatedIds = rels.related.map((r) => r.evidenceId);
        strict_1.default.ok(supportsIds.includes(evidenceIdA));
        strict_1.default.ok(contradictsIds.includes(evidenceIdB));
        // C is in evidenceIds but not in supporting/contradicting → related.
        strict_1.default.ok(relatedIds.includes(evidenceIdC));
    });
    (0, node_test_1.test)('getRelationshipsForDecision returns all relationships for a decision', async () => {
        const all = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForDecision(decisionId);
        strict_1.default.ok(Array.isArray(all));
        strict_1.default.ok(all.length >= 1);
    });
    (0, node_test_1.test)('deleteRelationshipsForDecision removes all relationships', async () => {
        await evidenceGraphService_1.evidenceGraphService.deleteRelationshipsForDecision(decisionId);
        const all = await evidenceGraphService_1.evidenceGraphService.getRelationshipsForDecision(decisionId);
        strict_1.default.equal(all.length, 0);
    });
});
