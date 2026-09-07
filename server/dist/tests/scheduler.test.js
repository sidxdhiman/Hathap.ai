"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const scheduler_1 = require("../decision/scheduler");
function mockTask(id, over = { status: 'pending' }) {
    const { deps, status, priority, nextRetryAt, createdAt } = over;
    return {
        _id: { toString: () => id },
        status,
        dependencies: deps || [],
        priority: priority ?? 0,
        nextRetryAt,
        createdAt: createdAt || new Date(2020, 0, 1),
    };
}
(0, node_test_1.describe)('TaskScheduler - readiness', () => {
    (0, node_test_1.test)('schedules a pending task when execution is running', () => {
        const tasks = [mockTask('a', { status: 'pending' })];
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('running', tasks);
        strict_1.default.equal(executableTasks.length, 1);
        strict_1.default.equal(blockedTasks.length, 0);
    });
    (0, node_test_1.test)('does not schedule when execution is not active', () => {
        const tasks = [mockTask('a', { status: 'pending' })];
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('paused', tasks);
        strict_1.default.equal(executableTasks.length, 0);
        strict_1.default.equal(blockedTasks.length, 1);
        strict_1.default.match(blockedTasks[0].reason, /not active/);
    });
    (0, node_test_1.test)('does not schedule running, completed, cancelled or skipped tasks', () => {
        for (const status of ['running', 'completed', 'cancelled', 'skipped']) {
            const { executableTasks } = (0, scheduler_1.schedule)('running', [mockTask('a', { status })]);
            strict_1.default.equal(executableTasks.length, 0, `${status} must not be schedulable`);
        }
    });
    (0, node_test_1.test)('does not schedule a paused task', () => {
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('running', [
            mockTask('a', { status: 'paused' }),
        ]);
        strict_1.default.equal(executableTasks.length, 0);
        strict_1.default.equal(blockedTasks[0].reason, 'paused');
    });
});
(0, node_test_1.describe)('TaskScheduler - dependencies', () => {
    (0, node_test_1.test)('a single dependency blocks the dependent task', () => {
        const dep = mockTask('a', { status: 'pending' });
        const task = mockTask('b', { status: 'pending', deps: ['a'] });
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('running', [dep, task]);
        // dep itself is runnable; task b is blocked until a completes.
        strict_1.default.equal(executableTasks.length, 1);
        strict_1.default.equal(executableTasks[0].task._id.toString(), 'a');
        strict_1.default.equal(blockedTasks.length, 1);
        strict_1.default.equal(blockedTasks[0].task._id.toString(), 'b');
        strict_1.default.match(blockedTasks[0].reason, /dependencies incomplete/);
    });
    (0, node_test_1.test)('a completed dependency unlocks the dependent task', () => {
        const dep = mockTask('a', { status: 'completed' });
        const task = mockTask('b', { status: 'pending', deps: ['a'] });
        const { executableTasks } = (0, scheduler_1.schedule)('running', [dep, task]);
        strict_1.default.equal(executableTasks.length, 1);
        strict_1.default.equal(executableTasks[0].task._id.toString(), 'b');
    });
    (0, node_test_1.test)('multiple dependencies all must be completed', () => {
        const a = mockTask('a', { status: 'completed' });
        const b = mockTask('b', { status: 'completed' });
        const c = mockTask('c', { status: 'pending', deps: ['a', 'b'] });
        const { executableTasks } = (0, scheduler_1.schedule)('running', [a, b, c]);
        strict_1.default.equal(executableTasks.length, 1);
        strict_1.default.equal(executableTasks[0].task._id.toString(), 'c');
    });
    (0, node_test_1.test)('multiple dependencies remain blocked until all complete (A and B -> C)', () => {
        const a = mockTask('a', { status: 'completed' });
        const b = mockTask('b', { status: 'pending' }); // not done yet
        const c = mockTask('c', { status: 'pending', deps: ['a', 'b'] });
        const { executableTasks } = (0, scheduler_1.schedule)('running', [a, b, c]);
        // Only 'b' is runnable; C is blocked because B is not complete.
        strict_1.default.equal(executableTasks.length, 1);
        strict_1.default.equal(executableTasks[0].task._id.toString(), 'b');
    });
});
(0, node_test_1.describe)('TaskScheduler - retries & priority', () => {
    (0, node_test_1.test)('a retrying task with elapsed backoff is schedulable', () => {
        const task = mockTask('a', {
            status: 'retrying',
            nextRetryAt: new Date(Date.now() - 1000),
        });
        const { executableTasks } = (0, scheduler_1.schedule)('running', [task]);
        strict_1.default.equal(executableTasks.length, 1);
    });
    (0, node_test_1.test)('a retrying task with future backoff is blocked', () => {
        const task = mockTask('a', {
            status: 'retrying',
            nextRetryAt: new Date(Date.now() + 60000),
        });
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('running', [task]);
        strict_1.default.equal(executableTasks.length, 0);
        strict_1.default.match(blockedTasks[0].reason, /backoff/);
    });
    (0, node_test_1.test)('a failed task is not schedulable', () => {
        const { executableTasks, blockedTasks } = (0, scheduler_1.schedule)('running', [
            mockTask('a', { status: 'failed' }),
        ]);
        strict_1.default.equal(executableTasks.length, 0);
        strict_1.default.match(blockedTasks[0].reason, /failed/);
    });
    (0, node_test_1.test)('higher priority tasks are ordered first', () => {
        const low = mockTask('a', { status: 'pending', priority: 1 });
        const high = mockTask('b', { status: 'pending', priority: 5 });
        const { executableTasks } = (0, scheduler_1.schedule)('running', [low, high]);
        strict_1.default.equal(executableTasks[0].task._id.toString(), 'b');
        strict_1.default.equal(executableTasks[1].task._id.toString(), 'a');
    });
});
