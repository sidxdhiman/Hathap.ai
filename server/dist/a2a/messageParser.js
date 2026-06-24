"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMessageText = extractMessageText;
exports.parseDebateRequest = parseDebateRequest;
function extractMessageText(message) {
    return message.parts
        .filter((part) => part.kind === 'text')
        .map((part) => part.text)
        .join('\n')
        .trim();
}
function parseDebateRequest(text) {
    if (!text) {
        throw new Error('Message text is required.');
    }
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            return normalizeDebateRequest(parsed);
        }
    }
    catch {
        // Treat as plain-text objective
    }
    return {
        skill: 'run-debate',
        objective: text,
        mode: 'consensus',
    };
}
function normalizeDebateRequest(request) {
    const skill = request.skill || (request.courtroomId ? 'courtroom-debate' : 'run-debate');
    if (skill === 'courtroom-debate') {
        if (!request.courtroomId) {
            throw new Error('courtroomId is required for courtroom-debate skill.');
        }
        return { ...request, skill };
    }
    if (!request.objective?.trim()) {
        throw new Error('objective is required for run-debate skill.');
    }
    return {
        skill: 'run-debate',
        objective: request.objective.trim(),
        mode: request.mode || 'consensus',
        agentIds: request.agentIds,
        courtroomId: request.courtroomId,
    };
}
