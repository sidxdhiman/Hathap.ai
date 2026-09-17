"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rubricService = exports.RubricService = exports.RubricValidationError = exports.DEFAULT_RUBRIC_NAME = exports.MAX_RUBRIC_VERSIONS = void 0;
exports.cleanRubricInput = cleanRubricInput;
const Rubric_1 = __importDefault(require("../models/Rubric"));
const types_1 = require("./types");
const evaluationPolicy_1 = require("./evaluationPolicy");
/**
 * Phase 9 — RubricService.
 *
 * Rubrics define weighted scoring criteria. Every update bumps the version and
 * appends to a bounded history so evaluation runs stay pinned to the exact
 * criterion set they were scored against (rubric/version tracking).
 */
exports.MAX_RUBRIC_VERSIONS = 20;
exports.DEFAULT_RUBRIC_NAME = 'Default rubric';
class RubricValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RubricValidationError';
    }
}
exports.RubricValidationError = RubricValidationError;
function cleanRubricInput(body) {
    if (!body || typeof body !== 'object') {
        throw new RubricValidationError('Invalid rubric payload.');
    }
    const name = body.name;
    if (typeof name !== 'string' || !name.trim()) {
        throw new RubricValidationError('Rubric "name" is required.');
    }
    let criteria;
    if (body.criteria !== undefined) {
        if (!Array.isArray(body.criteria) || body.criteria.length === 0) {
            throw new RubricValidationError('Rubric "criteria" must be a non-empty array.');
        }
        const normalized = (0, evaluationPolicy_1.normalizeCriteria)(body.criteria);
        const allowed = new Set(types_1.CRITERION_KEYS);
        for (const c of normalized) {
            if (!allowed.has(c.key)) {
                throw new RubricValidationError(`Unknown criterion key "${c.key}".`);
            }
        }
        criteria = normalized;
    }
    return {
        name: (0, evaluationPolicy_1.sanitizeSignal)(name.trim(), 200),
        description: typeof body.description === 'string' ? (0, evaluationPolicy_1.sanitizeSignal)(body.description, 1000) : undefined,
        criteria,
    };
}
class RubricService {
    getDefaultRubric(userId) {
        return new Rubric_1.default({
            userId,
            name: exports.DEFAULT_RUBRIC_NAME,
            description: 'Default evaluator-agnostic scoring criteria.',
            version: 1,
            status: 'active',
            criteria: types_1.DEFAULT_CRITERIA,
            versions: [],
        });
    }
    async createRubric(userId, input) {
        const criteria = input.criteria && Array.isArray(input.criteria) ? input.criteria : types_1.DEFAULT_CRITERIA;
        const rubric = await Rubric_1.default.create({
            userId,
            name: input.name,
            description: input.description,
            version: 1,
            status: 'active',
            criteria,
            versions: [],
        });
        return rubric;
    }
    async listRubrics(userId) {
        return Rubric_1.default.find({ userId }).sort({ updatedAt: -1 });
    }
    async getRubric(userId, rubricId) {
        return Rubric_1.default.findOne({ _id: rubricId, userId });
    }
    async getRubricSnapshot(userId, rubricId) {
        const rubric = await this.getRubric(userId, rubricId);
        if (!rubric)
            return null;
        const raw = this.rubricVersionCriteria(rubric, rubric.version);
        if (!raw)
            return null;
        return { rubricId: String(rubric._id), version: rubric.version, criteria: raw };
    }
    /**
     * Update a rubric → version advances by 1 and the previous criteria set is
     * appended to the (bounded) version history for reproducibility.
     */
    async updateRubric(userId, rubricId, input) {
        const rubric = await this.getRubric(userId, rubricId);
        if (!rubric)
            return null;
        const snapshot = {
            version: rubric.version,
            criteria: rubric.criteria.map((c) => ({ ...c })),
            createdAt: new Date(),
        };
        if (input.name !== undefined)
            rubric.name = input.name;
        if (input.description !== undefined)
            rubric.description = input.description;
        if (input.criteria !== undefined && Array.isArray(input.criteria) && input.criteria.length) {
            rubric.criteria = input.criteria;
        }
        rubric.version = (rubric.version || 1) + 1;
        const history = [...(rubric.versions || []), snapshot];
        rubric.versions = history.slice(-exports.MAX_RUBRIC_VERSIONS);
        const saved = await rubric.save();
        return saved;
    }
    async deleteRubric(userId, rubricId) {
        const removed = await Rubric_1.default.findOneAndDelete({ _id: rubricId, userId });
        return Boolean(removed);
    }
    /** Look up criteria for a pinned version (falls back to the latest). */
    rubricVersionCriteria(rubric, version) {
        if (!version || version === rubric.version)
            return rubric.criteria;
        const historical = (rubric.versions || []).find((v) => v.version === version);
        return historical ? historical.criteria : rubric.criteria;
    }
}
exports.RubricService = RubricService;
exports.rubricService = new RubricService();
