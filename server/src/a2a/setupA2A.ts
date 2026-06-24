import { Express } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  restHandler,
} from '@a2a-js/sdk/server/express';
import { buildAgentCard, getA2ABaseUrl } from './agentCard';
import { HathapDebateExecutor } from './debateExecutor';
import { hathapUserBuilder } from './userBuilder';

export function setupA2A(app: Express): void {
  const baseUrl = getA2ABaseUrl();
  const agentCard = buildAgentCard(baseUrl);
  const executor = new HathapDebateExecutor();
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    executor
  );

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({ requestHandler, userBuilder: hathapUserBuilder })
  );
  app.use('/a2a/rest', restHandler({ requestHandler, userBuilder: hathapUserBuilder }));

  console.log(`A2A Agent Card: ${baseUrl}/${AGENT_CARD_PATH}`);
  console.log(`A2A JSON-RPC:   ${baseUrl}/a2a/jsonrpc`);
  console.log(`A2A REST:       ${baseUrl}/a2a/rest`);
}
