import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderCriticalPathOpen } from '../../src/lib/criticalPath';

describe('orderCriticalPathOpen', () => {
  it('orders by predecessor edges', () => {
    const tasks = [
      { id: 'c', title: 'C', onCriticalPath: true, status: 'todo', blockedByTaskId: 'b' },
      { id: 'a', title: 'A', onCriticalPath: true, status: 'todo', blockedByTaskId: null },
      { id: 'b', title: 'B', onCriticalPath: true, status: 'in_progress', blockedByTaskId: 'a' },
      { id: 'x', title: 'noise', onCriticalPath: false, status: 'todo' },
      { id: 'd', title: 'done', onCriticalPath: true, status: 'done', blockedByTaskId: 'a' },
    ];
    const ordered = orderCriticalPathOpen(tasks).map((t) => t.id);
    assert.deepEqual(ordered, ['a', 'b', 'c']);
  });

  it('ignores edges off the open path', () => {
    const tasks = [
      { id: 'b', title: 'B', onCriticalPath: true, status: 'todo', blockedByTaskId: 'missing' },
      { id: 'a', title: 'A', onCriticalPath: true, status: 'todo', blockedByTaskId: null, dueDate: '2026-01-02' },
    ];
    const ordered = orderCriticalPathOpen(tasks).map((t) => t.id);
    assert.ok(ordered.includes('a') && ordered.includes('b'));
    assert.equal(ordered.length, 2);
  });
});
