/**
 * Offline queue pure logic + coalesce merge.
 * isQueueable needs no DOM; mergePatchBodies is pure.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isQueueableMutation,
  mergePatchBodies,
} from '../../src/lib/client/offlineQueue';

describe('isQueueableMutation', () => {
  it('allows task PATCH only', () => {
    assert.equal(isQueueableMutation('/tasks/507f1f77bcf86cd799439011', 'PATCH'), true);
    assert.equal(isQueueableMutation('/tasks/507f1f77bcf86cd799439011', 'patch'), true);
  });

  it('rejects nested routes, GET, and bad ids', () => {
    assert.equal(isQueueableMutation('/tasks/507f1f77bcf86cd799439011/comments', 'PATCH'), false);
    assert.equal(isQueueableMutation('/tasks/507f1f77bcf86cd799439011', 'POST'), false);
    assert.equal(isQueueableMutation('/tasks/not-an-id', 'PATCH'), false);
    assert.equal(isQueueableMutation('/projects/507f1f77bcf86cd799439011', 'PATCH'), false);
  });
});

describe('mergePatchBodies', () => {
  it('unions fields so status then pendingWith both survive', () => {
    const merged = mergePatchBodies(
      { status: 'blocked', pendingWith: 'vendor' },
      { dueDate: '2026-08-11' },
    ) as Record<string, unknown>;
    assert.equal(merged.status, 'blocked');
    assert.equal(merged.pendingWith, 'vendor');
    assert.equal(merged.dueDate, '2026-08-11');
  });

  it('later keys win on conflict', () => {
    const merged = mergePatchBodies(
      { status: 'todo', pendingWith: 'A' },
      { status: 'done' },
    ) as Record<string, unknown>;
    assert.equal(merged.status, 'done');
    assert.equal(merged.pendingWith, 'A');
  });

  it('replaces non-objects with later value', () => {
    const a = mergePatchBodies('old', { status: 'done' }) as { status: string };
    assert.equal(a.status, 'done');
    const b = mergePatchBodies({ status: 'todo' }, undefined) as { status: string };
    assert.equal(b.status, 'todo');
  });
});
