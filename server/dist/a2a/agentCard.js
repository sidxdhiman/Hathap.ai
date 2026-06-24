"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentCard = buildAgentCard;
exports.getA2ABaseUrl = getA2ABaseUrl;
function buildAgentCard(baseUrl) {
    const normalizedBase = baseUrl.replace(/\/$/, '');
    return {
        name: 'Hathap.AI Debate Agent',
        description: 'Multi-agent AI debate platform. Submit a topic or courtroom ID to orchestrate structured debates between AI personas and receive a synthesized verdict.',
        protocolVersion: '0.3.0',
        version: '0.1.0',
        url: `${normalizedBase}/a2a/jsonrpc`,
        skills: [
            {
                id: 'run-debate',
                name: 'Run Debate',
                description: 'Run a multi-agent debate on a topic. Send plain text (the objective) or JSON with objective, mode, agentIds, and optional courtroomId.',
                tags: ['debate', 'consensus', 'multi-agent', 'courtroom'],
                examples: [
                    'Should our startup migrate from monolith to microservices?',
                    JSON.stringify({
                        skill: 'run-debate',
                        objective: 'Evaluate adopting GraphQL for our public API',
                        mode: 'consensus',
                        agentIds: [],
                    }, null, 2),
                ],
            },
            {
                id: 'courtroom-debate',
                name: 'Courtroom Debate',
                description: 'Run a debate on an existing Hathap courtroom by ID.',
                tags: ['debate', 'courtroom'],
                examples: [
                    JSON.stringify({ skill: 'courtroom-debate', courtroomId: '<courtroom-id>' }, null, 2),
                ],
            },
        ],
        capabilities: {
            streaming: true,
            pushNotifications: false,
            stateTransitionHistory: true,
        },
        defaultInputModes: ['text'],
        defaultOutputModes: ['text'],
        additionalInterfaces: [
            { url: `${normalizedBase}/a2a/jsonrpc`, transport: 'JSONRPC' },
            { url: `${normalizedBase}/a2a/rest`, transport: 'HTTP+JSON' },
        ],
    };
}
function getA2ABaseUrl() {
    return process.env.A2A_BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
}
