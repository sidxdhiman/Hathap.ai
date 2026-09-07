import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { schedule } from '../decision/scheduler';
import { ITask } from '../models/Task';

function mockTask(
  id: string,
  over: Partial<ITask> & { status: any; deps?: string[] } = { status: 'pending' }
): ITask {
  const { deps, status, priority, nextRetryAt, createdAt } = over;
  return {
    _id: { toString: () => id } as any,
    status,
    dependencies: deps || [],
    priority: priority ?? 0,
    nextRetryAt,
    createdAt: createdAt || new Date(2020, 0, 1),
  } as unknown as ITask;
}

describe('TaskScheduler - readiness', () => {
  test('schedules a pending task when execution is running', () => {
    const tasks = [mockTask('a', { status: 'pending' })];
    const { executableTasks, blockedTasks } = schedule('running', tasks);
    assert.equal(executableTasks.length, 1);
    assert.equal(blockedTasks.length, 0);
  });

  test('does not schedule when execution is not active', () => {
    const tasks = [mockTask('a', { status: 'pending' })];
    const { executableTasks, blockedTasks } = schedule('paused', tasks);
    assert.equal(executableTasks.length, 0);
    assert.equal(blockedTasks.length, 1);
    assert.match(blockedTasks[0].reason, /not active/);
  });

  test('does not schedule running, completed, cancelled or skipped tasks', () => {
    for (const status of ['running', 'completed', 'cancelled', 'skipped'] as any[]) {
      const { executableTasks } = schedule('running', [mockTask('a', { status })]);
      assert.equal(executableTasks.length, 0, `${status} must not be schedulable`);
    }
  });

  test('does not schedule a paused task', () => {
    const { executableTasks, blockedTasks } = schedule('running', [
      mockTask('a', { status: 'paused' }),
    ]);
    assert.equal(executableTasks.length, 0);
    assert.equal(blockedTasks[0].reason, 'paused');
  });
});

describe('TaskScheduler - dependencies', () => {
  test('a single dependency blocks the dependent task', () => {
    const dep = mockTask('a', { status: 'pending' });
    const task = mockTask('b', { status: 'pending', deps: ['a'] });
    const { executableTasks, blockedTasks } = schedule('running', [dep, task]);
    // dep itself is runnable; task b is blocked until a completes.
    assert.equal(executableTasks.length, 1);
    assert.equal(executableTasks[0].task._id.toString(), 'a');
    assert.equal(blockedTasks.length, 1);
    assert.equal(blockedTasks[0].task._id.toString(), 'b');
    assert.match(blockedTasks[0].reason, /dependencies incomplete/);
  });

  test('a completed dependency unlocks the dependent task', () => {
    const dep = mockTask('a', { status: 'completed' });
    const task = mockTask('b', { status: 'pending', deps: ['a'] });
    const { executableTasks } = schedule('running', [dep, task]);
    assert.equal(executableTasks.length, 1);
    assert.equal(executableTasks[0].task._id.toString(), 'b');
  });

  test('multiple dependencies all must be completed', () => {
    const a = mockTask('a', { status: 'completed' });
    const b = mockTask('b', { status: 'completed' });
    const c = mockTask('c', { status: 'pending', deps: ['a', 'b'] });
    const { executableTasks } = schedule('running', [a, b, c]);
    assert.equal(executableTasks.length, 1);
    assert.equal(executableTasks[0].task._id.toString(), 'c');
  });

  test('multiple dependencies remain blocked until all complete (A and B -> C)', () => {
    const a = mockTask('a', { status: 'completed' });
    const b = mockTask('b', { status: 'pending' }); // not done yet
    const c = mockTask('c', { status: 'pending', deps: ['a', 'b'] });
    const { executableTasks } = schedule('running', [a, b, c]);
    // Only 'b' is runnable; C is blocked because B is not complete.
    assert.equal(executableTasks.length, 1);
    assert.equal(executableTasks[0].task._id.toString(), 'b');
  });
});

describe('TaskScheduler - retries & priority', () => {
  test('a retrying task with elapsed backoff is schedulable', () => {
    const task = mockTask('a', {
      status: 'retrying',
      nextRetryAt: new Date(Date.now() - 1000),
    });
    const { executableTasks } = schedule('running', [task]);
    assert.equal(executableTasks.length, 1);
  });

  test('a retrying task with future backoff is blocked', () => {
    const task = mockTask('a', {
      status: 'retrying',
      nextRetryAt: new Date(Date.now() + 60_000),
    });
    const { executableTasks, blockedTasks } = schedule('running', [task]);
    assert.equal(executableTasks.length, 0);
    assert.match(blockedTasks[0].reason, /backoff/);
  });

  test('a failed task is not schedulable', () => {
    const { executableTasks, blockedTasks } = schedule('running', [
      mockTask('a', { status: 'failed' }),
    ]);
    assert.equal(executableTasks.length, 0);
    assert.match(blockedTasks[0].reason, /failed/);
  });

  test('higher priority tasks are ordered first', () => {
    const low = mockTask('a', { status: 'pending', priority: 1 });
    const high = mockTask('b', { status: 'pending', priority: 5 });
    const { executableTasks } = schedule('running', [low, high]);
    assert.equal(executableTasks[0].task._id.toString(), 'b');
    assert.equal(executableTasks[1].task._id.toString(), 'a');
  });
});
