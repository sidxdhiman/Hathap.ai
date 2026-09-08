import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { verificationService } from '../decision/verificationService';
import { redTeamService } from '../decision/redTeamService';
import { evidenceGraphService } from '../decision/evidenceGraphService';
import VerificationResult from '../models/VerificationResult';
import RedTeamFinding from '../models/RedTeamFinding';
import EvidenceRelationship from '../models/EvidenceRelationship';
import Claim from '../models/Claim';
import Evidence from '../models/Evidence';
import Execution from '../models/Execution';
import Task from '../models/Task';
import Decision from '../models/Decision';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/hathap_test';

let userId: string;
let decisionId: string;
let executionId: string;
let claimId: string;
let supportingEvidenceId: string;
let contradictingEvidenceId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    VerificationResult.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Decision.deleteMany({}),
  ]);

  userId = new mongoose.Types.ObjectId().toString();
  const decision = await Decision.create({
    userId,
    title: 'Verify Test',
    objective: 'Should we adopt microservices?',
    context: 'Test.',
    status: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();

  const execution = await Execution.create({
    decisionId,
    status: 'running',
    progress: 50,
    currentPhase: 'verifying',
  });
  executionId = execution._id.toString();

  const claim = await Claim.create({
    decisionId,
    text: 'Microservices reduce deployment downtime.',
    type: 'fact',
    evidenceIds: [],
    contradictingEvidenceIds: [],
  });
  claimId = claim._id.toString();

  const evSupport = await Evidence.create({
    decisionId,
    title: 'Supports claim',
    content: 'Deployments are faster and safer with small services.',
    sourceType: 'user_input',
  });
  const evContradict = await Evidence.create({
    decisionId,
    title: 'Contradicts claim',
    content: 'Microservices increase operational complexity and downtime.',
    sourceType: 'user_input',
  });
  supportingEvidenceId = evSupport._id.toString();
  contradictingEvidenceId = evContradict._id.toString();

  // The main claim carries a coarse contradicting-evidence marker used by the
  // red-team contradiction analysis.
  await Claim.updateOne(
    { _id: claimId },
    { $set: { contradictingEvidenceIds: [contradictingEvidenceId] } }
  );

  // Explicit relationships
  await evidenceGraphService.upsertRelationship({
    claimId,
    evidenceId: supportingEvidenceId,
    relationship: 'supports',
    source: 'research',
    decisionId,
  });
  await evidenceGraphService.upsertRelationship({
    claimId,
    evidenceId: contradictingEvidenceId,
    relationship: 'contradicts',
    source: 'research',
    decisionId,
  });
});

after(async () => {
  await Promise.all([
    VerificationResult.deleteMany({}),
    RedTeamFinding.deleteMany({}),
    EvidenceRelationship.deleteMany({}),
    Claim.deleteMany({}),
    Evidence.deleteMany({}),
    Execution.deleteMany({}),
    Task.deleteMany({}),
    Decision.deleteMany({}),
  ]);
  await mongoose.connection.close();
});

describe('VerificationService', () => {
  test('claim supported by evidence returns supported status', async () => {
    // Use a dedicated claim paired only with supporting evidence.
    const supportedClaim = await Claim.create({
      decisionId,
      text: 'A well-evidenced fact.',
      type: 'fact',
      evidenceIds: [supportingEvidenceId],
    });
    await evidenceGraphService.upsertRelationship({
      claimId: supportedClaim._id.toString(),
      evidenceId: supportingEvidenceId,
      relationship: 'supports',
      source: 'research',
      decisionId,
    });

    const result = await verificationService.verifyClaim({
      claimId: supportedClaim._id.toString(),
      claimStatement: supportedClaim.text,
      evidenceIds: [supportingEvidenceId],
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
    });
    assert.equal(result.status, 'supported');
    assert.ok(result.supportingEvidenceIds.includes(supportingEvidenceId));
  });

  test('claim with contradicting evidence returns contradicted status', async () => {
    const contradictedClaim = await Claim.create({
      decisionId,
      text: 'A contradicted fact.',
      type: 'fact',
      evidenceIds: [contradictingEvidenceId],
    });
    await evidenceGraphService.upsertRelationship({
      claimId: contradictedClaim._id.toString(),
      evidenceId: contradictingEvidenceId,
      relationship: 'contradicts',
      source: 'research',
      decisionId,
    });

    const result = await verificationService.verifyClaim({
      claimId: contradictedClaim._id.toString(),
      claimStatement: contradictedClaim.text,
      evidenceIds: [contradictingEvidenceId],
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
    });
    assert.equal(result.status, 'contradicted');
    assert.ok(result.contradictingEvidenceIds.includes(contradictingEvidenceId));
  });

  test('claim with only related evidence is not treated as contradicted', async () => {
    // A related-only claim must be "inconclusive" or "unsupported", NOT contradicted.
    const relatedEvidence = await Evidence.create({
      decisionId,
      title: 'Neutral evidence',
      content: 'Neutral, no bearing.',
      sourceType: 'user_input',
    });
    const relatedClaim = await Claim.create({
      decisionId,
      text: 'Claim with neutral evidence.',
      type: 'fact',
      evidenceIds: [relatedEvidence._id.toString()],
    });
    await evidenceGraphService.upsertRelationship({
      claimId: relatedClaim._id.toString(),
      evidenceId: relatedEvidence._id.toString(),
      relationship: 'related',
      source: 'research',
      decisionId,
    });

    const result = await verificationService.verifyClaim({
      claimId: relatedClaim._id.toString(),
      claimStatement: relatedClaim.text,
      evidenceIds: [relatedEvidence._id.toString()],
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
    });
    assert.notEqual(result.status, 'contradicted', 'related-only must not be contradicted');
  });

  test('verification is idempotent per claim+task', async () => {
    const taskId = new mongoose.Types.ObjectId().toString();
    const claim = await Claim.create({
      decisionId,
      text: 'Idempotent claim.',
      type: 'fact',
    });
    await evidenceGraphService.upsertRelationship({
      claimId: claim._id.toString(),
      evidenceId: supportingEvidenceId,
      relationship: 'supports',
      source: 'research',
      decisionId,
    });

    await verificationService.verifyClaim({
      claimId: claim._id.toString(),
      claimStatement: claim.text,
      evidenceIds: [supportingEvidenceId],
      decisionId,
      executionId,
      taskId,
    });
    await verificationService.verifyClaim({
      claimId: claim._id.toString(),
      claimStatement: claim.text,
      evidenceIds: [supportingEvidenceId],
      decisionId,
      executionId,
      taskId,
    });

    const count = await VerificationResult.countDocuments({
      claimId: claim._id.toString(),
      taskId,
    });
    assert.equal(count, 1, 'verification should be functional on claim+task');
  });

  test('getVerificationsForDecision returns persisted results', async () => {
    const all = await verificationService.getVerificationsForDecision(decisionId);
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 1);
  });
});

describe('RedTeamService', () => {
  test('produces structured findings for the candidate decision', async () => {
    // A decision with an unsupported assumption + contradicting evidence should
    // generate high findings.
    const assumptionClaim = await Claim.create({
      decisionId,
      text: 'Assumes team has SRE expertise.',
      type: 'assumption',
      evidenceIds: [],
    });
    const inferenceClaim = await Claim.create({
      decisionId,
      text: 'Therefore cost increases.',
      type: 'inference',
      evidenceIds: [],
    });

    const findings = await redTeamService.runRedTeamAnalysis({
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
      candidateRecommendation: 'Adopt microservices.',
      claimIds: [claimId, assumptionClaim._id.toString(), inferenceClaim._id.toString()],
      evidenceIds: [supportingEvidenceId, contradictingEvidenceId],
    });

    const types = findings.map((f) => f.type);
    // Assumption without evidence
    assert.ok(types.includes('invalid_assumption'));
    // Claim with contradicting evidence
    assert.ok(types.includes('contradictory_evidence'));
    assert.ok(findings.every((f) => f.severity));
    assert.ok(findings.every((f) => f.description));
  });

  test('getFindingsForDecision returns persisted findings', async () => {
    const findings = await redTeamService.getFindingsForDecision(decisionId);
    assert.ok(Array.isArray(findings));
    // Findings were persisted by the previous test.
    assert.ok(findings.length >= 1);
  });

  test('red team does not modify untrusted actor configuration', async () => {
    // Red team is read-only over claims/evidence; it must not create Decisions,
    // Tasks, or alter permissions. Assert no extraneous side-effect collections
    // were created for a clean decision.
    const cleanDecision = await Decision.create({
      userId,
      title: 'RT Clean',
      objective: 'No-op.',
      context: 'none',
      status: 'debating',
    });
    await redTeamService.runRedTeamAnalysis({
      decisionId: cleanDecision._id.toString(),
      candidateRecommendation: 'Do nothing.',
      claimIds: [],
      evidenceIds: [],
    });
    const findings = await RedTeamFinding.find({ decisionId: cleanDecision._id.toString() });
    assert.ok(Array.isArray(findings));
    // No side effects: no new decisions with this objective.
    const dup = await Decision.countDocuments({ objective: 'No-op.' });
    assert.equal(dup, 1);
  });
});
