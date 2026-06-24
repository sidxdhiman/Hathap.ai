import { v4 as uuidv4 } from 'uuid';
import type { Message, Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';
import { debateEngine } from '../engine/debateEngine';
import { extractMessageText, parseDebateRequest } from './messageParser';
import { resolveCourtroomForDebate } from './courtroomService';
import { getUserId } from './types';

export class HathapDebateExecutor implements AgentExecutor {
  private cancelledTasks = new Set<string>();

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage, task, context } = requestContext;
    const userId = getUserId(context?.user);

    if (!userId) {
      this.publishError(
        eventBus,
        taskId,
        contextId,
        'Authentication required. Provide a Bearer JWT token or X-A2A-API-Key header.'
      );
      return;
    }

    if (this.cancelledTasks.has(taskId)) {
      this.publishCancelled(eventBus, taskId, contextId);
      this.cancelledTasks.delete(taskId);
      return;
    }

    if (!task) {
      const initialTask: Task = {
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
      const text = extractMessageText(userMessage);
      const debateRequest = parseDebateRequest(text);
      const { courtroomId, created } = await resolveCourtroomForDebate(userId, debateRequest);

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

      const result = await debateEngine.runDebate(courtroomId, userId);

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

      const summaryMessage: Message = {
        kind: 'message',
        messageId: uuidv4(),
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown debate error';
      this.publishError(eventBus, taskId, contextId, message);
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    this.cancelledTasks.add(taskId);
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId: taskId,
      status: { state: 'canceled', timestamp: new Date().toISOString() },
      final: true,
    } as TaskStatusUpdateEvent);
    eventBus.finished();
  }

  private publishStatus(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    state: TaskStatusUpdateEvent['status']['state'],
    final: boolean
  ): void {
    const update: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      status: { state, timestamp: new Date().toISOString() },
      final,
    };
    eventBus.publish(update);
  }

  private publishArtifact(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    name: string,
    payload: unknown
  ): void {
    const update: TaskArtifactUpdateEvent = {
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

  private publishError(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    message: string
  ): void {
    this.publishArtifact(eventBus, taskId, contextId, 'error', { message });
    this.publishStatus(eventBus, taskId, contextId, 'failed', true);
    eventBus.finished();
  }

  private publishCancelled(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string
  ): void {
    this.publishStatus(eventBus, taskId, contextId, 'canceled', true);
    eventBus.finished();
  }
}
