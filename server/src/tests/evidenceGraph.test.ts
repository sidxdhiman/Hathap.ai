import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { evidenceGraphService } from '../decision/evidenceGraphService';
import EvidenceRelationship from '../models/EvidenceRelationship';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';

let decisionId: string;
let claimId: string;
let evidenceIdA: string;
let evidenceIdB: string;
let evidenceIdC: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    EvidenceRelationship.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
  ]);

  decisionId = new mongoose.Types.ObjectId().toString();

  const claim = await Claim.create({
    decisionId,
    text: 'Microservices reduce deployment downtime.',
    type: 'fact',
    evidenceIds: [],
  });
  claimId = claim._id.toString();

  const evA = await Evidence.create({
    decisionId,
    title: 'Evidence A',
    content: 'Supports the claim.',
    sourceType: 'user_input',
  });
  const evB = await Evidence.create({
    decisionId,
    title: 'Evidence B',
    content: 'Contradicts the claim.',
    sourceType: 'user_input',
  });
  const evC = await Evidence.create({
    decisionId,
    title: 'Evidence C',
    content: 'Related but neutral.',
    sourceType: 'user_input',
  });
  evidenceIdA = evA._id.toString();
  evidenceIdB = evB._id.toString();
  evidenceIdC = evC._id.toString();
});

after(async () => {
  await Promise.all([
    EvidenceRelationship.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

describe('EvidenceGraphService', () => {
  test('upsertRelationship creates a supports relationship', async () => {
    const rel = await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdA,
      relationship: 'supports',
      source: 'research',
      decisionId,
    });
    assert.equal(rel.relationship, 'supports');
    assert.equal(rel.claimId, claimId);
    assert.equal(rel.evidenceId, evidenceIdA);
  });

  test('upsertRelationship is idempotent (no duplicates)', async () => {
    await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdA,
      relationship: 'supports',
      source: 'research',
      decisionId,
    });
    await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdA,
      relationship: 'supports',
      source: 'research',
      decisionId,
    });
    const count = await EvidenceRelationship.countDocuments({
      claimId,
      evidenceId: evidenceIdA,
    });
    assert.equal(count, 1, 'duplicate relationships must be prevented');
  });

  test('upsertRelationship can update an existing relationship type', async () => {
    // Flip evidence B from related to contradicts.
    await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdB,
      relationship: 'related',
      source: 'research',
      decisionId,
    });
    await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdB,
      relationship: 'contradicts',
      source: 'verification',
      decisionId,
      strength: 0.6,
    });
    const rels = await EvidenceRelationship.find({ claimId, evidenceId: evidenceIdB });
    assert.equal(rels.length, 1);
    assert.equal(rels[0].relationship, 'contradicts');
    assert.equal(rels[0].source, 'verification');
  });

  test('getRelationshipsForClaim categorizes by relationship type', async () => {
    // Ensure A supports, B contradicts, C related.
    await evidenceGraphService.upsertRelationship({
      claimId,
      evidenceId: evidenceIdC,
      relationship: 'related',
      source: 'research',
      decisionId,
    });
    const rels = await evidenceGraphService.getRelationshipsForClaim(claimId);
    const supportsIds = rels.supports.map((r) => r.evidenceId);
    const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
    const relatedIds = rels.related.map((r) => r.evidenceId);
    assert.ok(supportsIds.includes(evidenceIdA));
    assert.ok(contradictsIds.includes(evidenceIdB));
    assert.ok(relatedIds.includes(evidenceIdC));
  });

  test('NOT(supports) !== contradicts: a related relationship is not a contradiction', async () => {
    // Evidence C is "related" only — it must NOT appear as a contradiction.
    const rels = await evidenceGraphService.getRelationshipsForClaim(claimId);
    const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
    assert.ok(!contradictsIds.includes(evidenceIdC), 'related is not a contradiction');
    // And absence of support does not imply contradiction for A's contradiction check.
    assert.ok(!rels.supports.map((r) => r.evidenceId).includes(evidenceIdB));
  });

  test('seedFromExistingClaims bridges coarse claim.evidenceIds', async () => {
    // Create a fresh claim with coarse evidenceIds + explicit support/contradict lists.
    const seedClaim = await Claim.create({
      decisionId,
      text: 'Seed claim.',
      type: 'inference',
      evidenceIds: [evidenceIdA, evidenceIdB, evidenceIdC],
      supportingEvidenceIds: [evidenceIdA],
      contradictingEvidenceIds: [evidenceIdB],
    });

    const { created } = await evidenceGraphService.seedFromExistingClaims(decisionId);
    assert.ok(created > 0, 'relationships should be created for the seed claim');

    const rels = await evidenceGraphService.getRelationshipsForClaim(seedClaim._id.toString());
    const supportsIds = rels.supports.map((r) => r.evidenceId);
    const contradictsIds = rels.contradicts.map((r) => r.evidenceId);
    const relatedIds = rels.related.map((r) => r.evidenceId);
    assert.ok(supportsIds.includes(evidenceIdA));
    assert.ok(contradictsIds.includes(evidenceIdB));
    // C is in evidenceIds but not in supporting/contradicting → related.
    assert.ok(relatedIds.includes(evidenceIdC));
  });

  test('getRelationshipsForDecision returns all relationships for a decision', async () => {
    const all = await evidenceGraphService.getRelationshipsForDecision(decisionId);
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 1);
  });

  test('deleteRelationshipsForDecision removes all relationships', async () => {
    await evidenceGraphService.deleteRelationshipsForDecision(decisionId);
    const all = await evidenceGraphService.getRelationshipsForDecision(decisionId);
    assert.equal(all.length, 0);
  });
});
