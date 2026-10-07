import { Express } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { DefaultRequestHandler } from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
} from '@a2a-js/sdk/server/express';
import { buildAgentCard, getA2ABaseUrl } from './agentCard';
import { HathapDebateExecutor } from './debateExecutor';
import { a2aUserBuilder, requireA2AAuthentication } from './a2aAuth';
import { OwnedTaskStore } from './taskStore';
import { createTaskAccessGate } from './taskAccess';

export function setupA2A(app: Express): void {
  const baseUrl = getA2ABaseUrl();
  const agentCard = buildAgentCard(baseUrl);
  const executor = new HathapDebateExecutor();
  // The SDK's default store is a bare `Map` and ignores the call context, so
  // any caller who knew a task id could read, cancel, resume or subscribe to
  // it. Ownership is enforced where every read passes through: the store.
  const taskStore = new OwnedTaskStore();
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

  // Protocol discovery stays public: the agent card carries no user data.
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));

  // Everything else on the A2A surface needs a principal first. The SDK does
  // not check `context.user` on any task-scoped operation, so this runs before
  // either transport parses the request.
  app.use(
    '/a2a/jsonrpc',
    requireA2AAuthentication,
    createTaskAccessGate(taskStore, 'jsonrpc'),
    jsonRpcHandler({ requestHandler, userBuilder: a2aUserBuilder })
  );
  app.use(
    '/a2a/rest',
    requireA2AAuthentication,
    createTaskAccessGate(taskStore, 'rest'),
    restHandler({ requestHandler, userBuilder: a2aUserBuilder })
  );

  console.log(`A2A Agent Card: ${baseUrl}/${AGENT_CARD_PATH}`);
  console.log(`A2A JSON-RPC:   ${baseUrl}/a2a/jsonrpc`);
  console.log(`A2A REST:       ${baseUrl}/a2a/rest`);
}
