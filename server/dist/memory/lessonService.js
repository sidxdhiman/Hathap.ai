"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lessonsService = exports.LessonsService = exports.LessonValidationError = void 0;
exports.cleanLessonInput = cleanLessonInput;
const DecisionLesson_1 = __importDefault(require("../models/DecisionLesson"));
const eventBus_1 = require("../decision/eventBus");
const LESSON_SOURCES = ['human', 'llm_suggestion'];
const LESSON_STATUSES = ['confirmed', 'unconfirmed'];
class LessonValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LessonValidationError';
    }
}
exports.LessonValidationError = LessonValidationError;
function cleanLessonInput(body) {
    if (!body || typeof body !== 'object') {
        throw new LessonValidationError('Invalid lesson payload.');
    }
    const text = body.text;
    if (typeof text !== 'string' || !text.trim()) {
        throw new LessonValidationError('Lesson "text" is required.');
    }
    const source = body.source === 'llm_suggestion' ? 'llm_suggestion' : 'human';
    let status;
    if (body.status === undefined) {
        // A generated suggestion is unconfirmed by default; a human-entered
        // lesson is confirmed by the act of the human writing it.
        status = source === 'llm_suggestion' ? 'unconfirmed' : 'confirmed';
    }
    else if (LESSON_STATUSES.includes(body.status)) {
        status = body.status;
    }
    else {
        throw new LessonValidationError(`Invalid lesson status "${body.status}". Expected one of: ${LESSON_STATUSES.join(', ')}.`);
    }
    // No automatic truth conversion: an LLM suggestion can never be created as a
    // confirmed fact. Only a later explicit human-led update can confirm it.
    if (source === 'llm_suggestion' && status === 'confirmed') {
        throw new LessonValidationError('An LLM-suggested lesson cannot be created as confirmed. It must start unconfirmed and be confirmed by a human.');
    }
    return {
        text: text.trim(),
        source,
        status,
        outcomeId: typeof body.outcomeId === 'string' ? body.outcomeId : undefined,
        metricName: typeof body.metricName === 'string' ? body.metricName : undefined,
        feedbackId: typeof body.feedbackId === 'string' ? body.feedbackId : undefined,
        evidenceIds: Array.isArray(body.evidenceIds)
            ? body.evidenceIds.filter((e) => typeof e === 'string').slice(0, 20)
            : [],
    };
}
/**
 * Phase 8 — LessonsService.
 *
 * Lessons are associated with a decision (and ideally an outcome/metric/
 * evidence/feedback). Unconfirmed generated suggestions and confirmed human
 * lessons are always distinguishable via source + status.
 */
class LessonsService {
    async list(userId, decisionId) {
        return DecisionLesson_1.default.find({ decisionId, userId }).sort({ createdAt: 1 });
    }
    async create(userId, decisionId, input) {
        const created = await DecisionLesson_1.default.create({
            userId,
            decisionId,
            text: input.text,
            source: input.source,
            status: input.status,
            outcomeId: input.outcomeId,
            metricName: input.metricName,
            feedbackId: input.feedbackId,
            evidenceIds: input.evidenceIds,
        });
        eventBus_1.executionEventBus.emit({
            type: 'lesson.created',
            decisionId,
            data: {
                lessonId: created._id.toString(),
                source: created.source,
                status: created.status,
            },
        });
        return created;
    }
    async update(userId, decisionId, lessonId, patch) {
        const lesson = await DecisionLesson_1.default.findOne({ _id: lessonId, decisionId, userId });
        if (!lesson)
            return null;
        if (patch.text !== undefined)
            lesson.text = patch.text;
        if (patch.status !== undefined) {
            // Human confirmation via update is allowed — that is the documented
            // path to confirming a generated suggestion.
            lesson.status = patch.status;
        }
        if (patch.outcomeId !== undefined)
            lesson.outcomeId = patch.outcomeId;
        if (patch.metricName !== undefined)
            lesson.metricName = patch.metricName;
        if (patch.feedbackId !== undefined)
            lesson.feedbackId = patch.feedbackId;
        if (patch.evidenceIds !== undefined)
            lesson.evidenceIds = patch.evidenceIds;
        const saved = await lesson.save();
        eventBus_1.executionEventBus.emit({
            type: 'lesson.updated',
            decisionId,
            data: {
                lessonId: saved._id.toString(),
                source: saved.source,
                status: saved.status,
            },
        });
        return saved;
    }
}
exports.LessonsService = LessonsService;
exports.lessonsService = new LessonsService();
