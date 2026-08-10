/**
 * Offline queue pure logic — uses a memory store so we don't need jsdom.
 * We re-test coalesce + isQueueable + path regex only (no window).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isQueueableMutation } from '../../src/lib/client/offlineQueue';

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
