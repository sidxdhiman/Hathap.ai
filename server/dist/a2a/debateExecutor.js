"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HathapDebateExecutor = void 0;
const uuid_1 = require("uuid");
const debateEngine_1 = require("../engine/debateEngine");
const messageParser_1 = require("./messageParser");
const courtroomService_1 = require("./courtroomService");
const types_1 = require("./types");
class HathapDebateExecutor {
    constructor() {
        this.cancelledTasks = new Set();
    }
    async execute(requestContext, eventBus) {
        const { taskId, contextId, userMessage, task, context } = requestContext;
        const userId = (0, types_1.getUserId)(context?.user);
        if (!userId) {
            this.publishError(eventBus, taskId, contextId, 'Authentication required. Provide a Bearer JWT token or X-A2A-API-Key header.');
            return;
        }
        if (this.cancelledTasks.has(taskId)) {
            this.publishCancelled(eventBus, taskId, contextId);
            this.cancelledTasks.delete(taskId);
            return;
        }
        if (!task) {
            const initialTask = {
                kind: 'task',
                id: taskId,
                contextId,
                status: {
                    state: 'submitted',
                    timestamp: new Date().toISOString(),
                },
                history: [userMessage],
            };
            eventBus.publish(initialTask);
        }
        this.publishStatus(eventBus, taskId, contextId, 'working', false);
        try {
            const text = (0, messageParser_1.extractMessageText)(userMessage);
            const debateRequest = (0, messageParser_1.parseDebateRequest)(text);
            const { courtroomId, created } = await (0, courtroomService_1.resolveCourtroomForDebate)(userId, debateRequest);
            if (this.cancelledTasks.has(taskId)) {
                this.publishCancelled(eventBus, taskId, contextId);
                this.cancelledTasks.delete(taskId);
                return;
            }
            this.publishArtifact(eventBus, taskId, contextId, 'courtroom-info', {
                courtroomId,
                created,
                objective: debateRequest.objective,
                mode: debateRequest.mode || 'consensus',
            });
            const result = await debateEngine_1.debateEngine.runDebate(courtroomId, userId);
            if (this.cancelledTasks.has(taskId)) {
                this.publishCancelled(eventBus, taskId, contextId);
                this.cancelledTasks.delete(taskId);
                return;
            }
            for (const [index, message] of result.messages.entries()) {
                this.publishArtifact(eventBus, taskId, contextId, `message-${index + 1}`, {
                    agentName: message.agentName,
                    roundNumber: message.roundNumber,
                    content: message.content,
                    parsedResponse: message.parsedResponse,
                });
            }
            this.publishArtifact(eventBus, taskId, contextId, 'verdict', result.verdict);
            const summaryMessage = {
                kind: 'message',
                messageId: (0, uuid_1.v4)(),
                role: 'agent',
                contextId,
                parts: [
                    {
                        kind: 'text',
                        text: [
                            `Debate completed for courtroom ${courtroomId}.`,
                            `Recommendation: ${result.verdict.recommendation}`,
                            `Summary: ${result.verdict.summary}`,
                            `Confidence: ${result.verdict.confidenceScore}/100`,
                        ].join('\n\n'),
                    },
                ],
            };
            eventBus.publish(summaryMessage);
            this.publishStatus(eventBus, taskId, contextId, 'completed', true);
            eventBus.finished();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown debate error';
            this.publishError(eventBus, taskId, contextId, message);
        }
    }
    async cancelTask(taskId, eventBus) {
        this.cancelledTasks.add(taskId);
        eventBus.publish({
            kind: 'status-update',
            taskId,
            contextId: taskId,
            status: { state: 'canceled', timestamp: new Date().toISOString() },
            final: true,
        });
        eventBus.finished();
    }
    publishStatus(eventBus, taskId, contextId, state, final) {
        const update = {
            kind: 'status-update',
            taskId,
            contextId,
            status: { state, timestamp: new Date().toISOString() },
            final,
        };
        eventBus.publish(update);
    }
    publishArtifact(eventBus, taskId, contextId, name, payload) {
        const update = {
            kind: 'artifact-update',
            taskId,
            contextId,
            artifact: {
                artifactId: `${taskId}-${name}`,
                name,
                parts: [{ kind: 'text', text: JSON.stringify(payload, null, 2) }],
            },
        };
        eventBus.publish(update);
    }
    publishError(eventBus, taskId, contextId, message) {
        this.publishArtifact(eventBus, taskId, contextId, 'error', { message });
        this.publishStatus(eventBus, taskId, contextId, 'failed', true);
        eventBus.finished();
    }
    publishCancelled(eventBus, taskId, contextId) {
        this.publishStatus(eventBus, taskId, contextId, 'canceled', true);
        eventBus.finished();
    }
}
exports.HathapDebateExecutor = HathapDebateExecutor;
