/**
 * Phase 8 — Decision Memory & Outcomes.
 *
 * Public surface of the memory layer. Consumers should import from here rather
 * than deep-importing individual services.
 */
export * from './types';
export * from './memoryPolicy';
export { structuredSimilarityProvider } from './similarityService';
export { decisionMemoryService } from './decisionMemoryService';
export {
  outcomeService,
  OutcomeService,
  OutcomeValidationError,
  cleanOutcomeInput,
  cleanOutcomePatch,
  pairMetrics,
  validateOutcomeStatus,
} from './outcomeService';
export {
  feedbackService,
  FeedbackService,
  FeedbackValidationError,
  cleanFeedbackInput,
} from './feedbackService';
export {
  lessonsService,
  LessonsService,
  LessonValidationError,
  cleanLessonInput,
} from './lessonService';
export { decisionRetrievalService } from './decisionRetrievalService';
export { memoryContextBuilder } from './memoryContextBuilder';
export { default as DecisionMemory } from '../models/DecisionMemory';
export { default as Outcome } from '../models/Outcome';
export { default as DecisionFeedback } from '../models/DecisionFeedback';
export { default as DecisionLesson } from '../models/DecisionLesson';