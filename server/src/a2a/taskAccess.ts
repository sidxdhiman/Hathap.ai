import type { NextFunction, Request, Response } from 'express';
import { getA2AUserId } from './a2aAuth';
import type { OwnedTaskStore } from './taskStore';

/**
 * Pre-dispatch authorization gate for the A2A task surface.
 *
 * `OwnedTaskStore` is the security boundary — it refuses every cross-user read
 * regardless of what this gate does. This middleware exists for the second half
 * of the contract: what the caller is *told*.
 *
 * The reason a gate is needed at all is an SDK packaging defect. `@a2a-js/sdk`
 * ships a CommonJS bundle in which `dist/server/index.cjs` and
 * `dist/server/express/index.cjs` each declare their own `var A2AError = class
 * ...`. This server compiles to CommonJS (`"module": "CommonJS"`), so it loads
 * those `.cjs` files, and every `error instanceof A2AError` performed by the
 * transport therefore resolves to `false`. The transport's `catch` falls back to
 * `A2AError.internalError`, and every application error the handler raises —
 * `taskNotFound` (`-32001`), `taskNotCancelable` (`-32002`),
 * `invalidRequest` (`-32600`) — surfaces as HTTP 500 / JSON-RPC `-32603`
 * instead of the `404` / `409` / `400` that `mapErrorToStatus` would have
 * produced. (The class is not re-exported by
 * `@a2a-js/sdk/server/express`, so it cannot be re-attached from outside
 * either.)
 *
 * Answering the refusal *before* dispatch means the caller gets the protocol's
 * real status and a byte-identical answer for "not yours" and "does not exist",
 * while a bug in this file can only ever make an error message less precise —
 * the store still refuses the underlying access.
 *
 * Responses deliberately mirror the SDK's shapes exactly:
 *  - JSON-RPC: HTTP 200 carrying `{jsonrpc, id, error:{code, message}}`, which
 *    is how `JsonRpcTransportHandler` reports application errors in band.
 *  - REST: `mapErrorToStatus(code)` with the `toHTTPError` body
 *    (`{code, message}`).
 */

const INVALID_REQUEST = -32600;
const TASK_NOT_FOUND = -32001;
const TASK_NOT_CANCELABLE = -32002;

/** The same terminal set `DefaultRequestHandler` uses before allowing a mutation. */
const TERMINAL_STATES = ['completed', 'failed', 'canceled', 'rejected'];

/**
 * `RESTTransportHandler` serves `GET /v1/tasks/:taskId`,
 * `POST /v1/tasks/:taskId:cancel`, `POST /v1/tasks/:taskId:subscribe` and
 * `POST /v1/tasks/:taskId/pushNotificationConfigs`. One expression covers all
 * of them; a segment that contains `:` or `/` can never be a task id this
 * server issues (they are `uuidv4()`), so a non-match simply falls through to
 * the transport rather than guessing.
 */
const REST_TASK_PATH = /^\/v1\/tasks\/([^/:]+)(?::|\/|$)/;

type TaskOperation = 'read' | 'cancel' | 'resume';

interface TaskReference {
  taskId: string;
  operation: TaskOperation;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Task id carried by a JSON-RPC request.
 *
 * Only the two method families that name a task are inspected, and only the
 * fields the A2A protocol defines for them, so an unrelated parameter can never
 * be mistaken for an identifier.
 */
function taskReferenceFromJsonRpc(body: unknown): TaskReference | undefined {
  const rpc = asObject(body);
  const method = nonEmptyString(rpc?.method);
  if (!method) {
    return undefined;
  }

  const isTaskMethod = method.startsWith('tasks/');
  const isMessageMethod = method === 'message/send' || method === 'message/stream';
  if (!isTaskMethod && !isMessageMethod) {
    return undefined;
  }

  const params = asObject(rpc?.params);
  if (isMessageMethod) {
    const taskId = nonEmptyString(asObject(params?.message)?.taskId);
    return taskId ? { taskId, operation: 'resume' } : undefined;
  }

  const taskId = nonEmptyString(params?.id) ?? nonEmptyString(params?.taskId);
  if (!taskId) {
    return undefined;
  }
  if (method === 'tasks/cancel') {
    return { taskId, operation: 'cancel' };
  }
  return { taskId, operation: 'read' };
}

/**
 * Task id carried by a REST request.
 *
 * Read, cancel and subscribe identify the task in the path, so those are
 * decided without looking at the body at all. Only `POST /v1/message:send` and
 * `POST /v1/message:stream` carry it in the payload.
 */
function taskReferenceFromRest(req: Request): TaskReference | undefined {
  const pathMatch = REST_TASK_PATH.exec(req.path);
  if (pathMatch) {
    return {
      taskId: pathMatch[1],
      operation: req.path.includes(':cancel') ? 'cancel' : 'read',
    };
  }

  if (req.path === '/v1/message:send' || req.path === '/v1/message:stream') {
    const body = asObject(req.body);
    const taskId = nonEmptyString(asObject(asObject(body?.request)?.message)?.taskId);
    return taskId ? { taskId, operation: 'resume' } : undefined;
  }

  return undefined;
}

export function createTaskAccessGate(store: OwnedTaskStore, transport: 'jsonrpc' | 'rest') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // `requireA2AAuthentication` has already made this check; repeating it
      // keeps the gate correct if the mount order ever changes.
      const userId = getA2AUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const reference =
        transport === 'jsonrpc'
          ? taskReferenceFromJsonRpc(req.body)
          : taskReferenceFromRest(req);
      if (!reference) {
        next();
        return;
      }

      // Unknown and foreign both resolve to `undefined`, so a caller can
      // never tell the two apart from the response.
      const task = await store.loadFor(reference.taskId, userId);
      if (!task) {
        reply(req, res, transport, TASK_NOT_FOUND, `Task not found: ${reference.taskId}`);
        return;
      }

      // Past this point the task belongs to the caller, so the state check
      // discloses nothing. It mirrors the SDK's own preconditions, which the
      // broken `instanceof` would otherwise report as a 500.
      if (reference.operation !== 'read' && TERMINAL_STATES.includes(task.status.state)) {
        if (reference.operation === 'cancel') {
          reply(
            req,
            res,
            transport,
            TASK_NOT_CANCELABLE,
            `Task not cancelable: ${reference.taskId}`
          );
          return;
        }
        reply(
          req,
          res,
          transport,
          INVALID_REQUEST,
          `Task ${task.id} is in a terminal state (${task.status.state}) and cannot be modified.`
        );
        return;
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}

function reply(
  req: Request,
  res: Response,
  transport: 'jsonrpc' | 'rest',
  code: number,
  message: string
): void {
  if (transport === 'jsonrpc') {
    const body = asObject(req.body);
    res.status(200).json({
      jsonrpc: '2.0',
      id: body && 'id' in body ? body.id : null,
      error: { code, message },
    });
    return;
  }

  const statusByCode: Record<number, number> = {
    [INVALID_REQUEST]: 400,
    [TASK_NOT_FOUND]: 404,
    [TASK_NOT_CANCELABLE]: 409,
  };
  res.status(statusByCode[code] ?? 500).json({ code, message });
}
