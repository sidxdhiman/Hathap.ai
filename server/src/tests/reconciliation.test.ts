import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { reconciliationService } from '../decision/reconciliationService';
import { verificationService } from '../decision/verificationService';
import { redTeamService } from '../decision/redTeamService';
import { evidenceGraphService } from '../decision/evidenceGraphService';
import ReconciliationResult from '../models/ReconciliationResult';
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
let supportingClaimId: string;
let contradictedClaimId: string;
let assumptionClaimId: string;
let supportingEvidenceId: string;
let contradictingEvidenceId: string;

before(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_URI);
  }
  await Promise.all([
    ReconciliationResult.deleteMany({}),
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
    title: 'Recon Test',
    objective: 'Pick a datastore.',
    context: 'Test.',
    status: 'debating',
    configuration: { strategy: 'consensus', maxRounds: 2 },
  });
  decisionId = decision._id.toString();

  const execution = await Execution.create({
    decisionId,
    status: 'running',
    progress: 75,
    currentPhase: 'verifying',
  });
  executionId = execution._id.toString();

  const evSupport = await Evidence.create({
    decisionId,
    title: 'Supports',
    content: 'Good.',
    sourceType: 'user_input',
  });
  const evContradict = await Evidence.create({
    decisionId,
    title: 'Contradicts',
    content: 'Bad.',
    sourceType: 'user_input',
  });
  supportingEvidenceId = evSupport._id.toString();
  contradictingEvidenceId = evContradict._id.toString();

  const supported = await Claim.create({
    decisionId,
    text: 'Supported claim.',
    type: 'fact',
    evidenceIds: [supportingEvidenceId],
  });
  const contradicted = await Claim.create({
    decisionId,
    text: 'Contradicted claim.',
    type: 'fact',
    evidenceIds: [contradictingEvidenceId],
    contradictingEvidenceIds: [contradictingEvidenceId],
  });
  supportingClaimId = supported._id.toString();
  contradictedClaimId = contradicted._id.toString();

  // An unsupported assumption that the red team should flag.
  const assumption = await Claim.create({
    decisionId,
    text: 'Assumes a stable team.',
    type: 'assumption',
    evidenceIds: [],
  });
  assumptionClaimId = assumption._id.toString();

  await evidenceGraphService.upsertRelationship({
    claimId: supportingClaimId,
    evidenceId: supportingEvidenceId,
    relationship: 'supports',
    source: 'research',
    decisionId,
  });
  await evidenceGraphService.upsertRelationship({
    claimId: contradictedClaimId,
    evidenceId: contradictingEvidenceId,
    relationship: 'contradicts',
    source: 'research',
    decisionId,
  });

  // Persist verification results for both claims.
  await verificationService.verifyClaim({
    claimId: supportingClaimId,
    claimStatement: 'Supported claim.',
    evidenceIds: [supportingEvidenceId],
    decisionId,
    executionId,
    taskId: new mongoose.Types.ObjectId().toString(),
  });
  await verificationService.verifyClaim({
    claimId: contradictedClaimId,
    claimStatement: 'Contradicted claim.',
    evidenceIds: [contradictingEvidenceId],
    decisionId,
    executionId,
    taskId: new mongoose.Types.ObjectId().toString(),
  });

  // Persist a red-team finding flagging the contradicted claim.
  await redTeamService.runRedTeamAnalysis({
    decisionId,
    executionId,
    taskId: new mongoose.Types.ObjectId().toString(),
    candidateRecommendation: 'Adopt the datastore.',
    claimIds: [supportingClaimId, contradictedClaimId, assumptionClaimId],
    evidenceIds: [supportingEvidenceId, contradictingEvidenceId],
  });
});

after(async () => {
  await Promise.all([
    ReconciliationResult.deleteMany({}),
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

describe('ReconciliationService', () => {
  test('rejects contradicted claims and keeps supported claims', async () => {
    const result = await reconciliationService.runReconciliation({
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
      candidateRecommendation: 'Adopt the datastore.',
      claimIds: [supportingClaimId, contradictedClaimId],
      verifyClaimTaskIds: [],
      redTeamTaskId: undefined,
    });

    assert.ok(result.survivingClaimIds.includes(supportingClaimId));
    assert.ok(result.rejectedClaimIds.includes(contradictedClaimId));
  });

  test('flags needsMoreResearch when claims are contradicted', async () => {
    const result = await reconciliationService.runReconciliation({
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
      candidateRecommendation: 'Adopt the datastore.',
      claimIds: [supportingClaimId, contradictedClaimId],
      verifyClaimTaskIds: [],
      redTeamTaskId: undefined,
    });

    assert.equal(result.needsMoreResearch, true);
    assert.ok(Array.isArray(result.researchQuestions));
    assert.ok(result.researchQuestions!.length >= 1);
  });

  test('combines red-team findings', async () => {
    const redTeamFindings = await RedTeamFinding.find({ decisionId });
    const redTeamStateStore = redTeamFindings.map((f) => f._id);
    assert.ok(redTeamStateStore.length >= 1);
  });

  test('reconciliation is persisted per decision', async () => {
    const result = await reconciliationService.runReconciliation({
      decisionId,
      executionId,
      taskId: new mongoose.Types.ObjectId().toString(),
      candidateRecommendation: 'Adopt the datastore.',
      claimIds: [supportingClaimId],
      verifyClaimTaskIds: [],
      redTeamTaskId: undefined,
    });
    const persisted = await ReconciliationResult.find({ decisionId, taskId: result.taskId });
    assert.ok(persisted.length >= 1);
  });

  test('persists a single reconciliation result (upsert keyed on decision+task)', async () => {
    const taskId = new mongoose.Types.ObjectId().toString();
    await reconciliationService.runReconciliation({
      decisionId,
      executionId,
      taskId,
      candidateRecommendation: 'Adopt.',
      claimIds: [supportingClaimId],
      verifyClaimTaskIds: [],
      redTeamTaskId: undefined,
    });
    await reconciliationService.runReconciliation({
      decisionId,
      executionId,
      taskId,
      candidateRecommendation: 'Adopt.',
      claimIds: [supportingClaimId],
      verifyClaimTaskIds: [],
      redTeamTaskId: undefined,
    });
    const count = await ReconciliationResult.countDocuments({ decisionId, taskId });
    assert.equal(count, 1);
  });
});
