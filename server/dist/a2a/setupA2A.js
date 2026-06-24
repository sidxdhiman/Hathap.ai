"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupA2A = setupA2A;
const sdk_1 = require("@a2a-js/sdk");
const server_1 = require("@a2a-js/sdk/server");
const express_1 = require("@a2a-js/sdk/server/express");
const agentCard_1 = require("./agentCard");
const debateExecutor_1 = require("./debateExecutor");
const userBuilder_1 = require("./userBuilder");
function setupA2A(app) {
    const baseUrl = (0, agentCard_1.getA2ABaseUrl)();
    const agentCard = (0, agentCard_1.buildAgentCard)(baseUrl);
    const executor = new debateExecutor_1.HathapDebateExecutor();
    const requestHandler = new server_1.DefaultRequestHandler(agentCard, new server_1.InMemoryTaskStore(), executor);
    app.use(`/${sdk_1.AGENT_CARD_PATH}`, (0, express_1.agentCardHandler)({ agentCardProvider: requestHandler }));
    app.use('/a2a/jsonrpc', (0, express_1.jsonRpcHandler)({ requestHandler, userBuilder: userBuilder_1.hathapUserBuilder }));
    app.use('/a2a/rest', (0, express_1.restHandler)({ requestHandler, userBuilder: userBuilder_1.hathapUserBuilder }));
    console.log(`A2A Agent Card: ${baseUrl}/${sdk_1.AGENT_CARD_PATH}`);
    console.log(`A2A JSON-RPC:   ${baseUrl}/a2a/jsonrpc`);
    console.log(`A2A REST:       ${baseUrl}/a2a/rest`);
}
