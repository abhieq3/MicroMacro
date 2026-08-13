/**
 * Access-request contract — the public conversion path.
 *
 * Pins the form schema, the honeypot, the stranger-facing copy, and the
 * admin serialization (no IP). The route handler stays a thin wrapper.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AccessRequestCreateSchema,
  AccessRequestReviewSchema,
  adminNotifyCopy,
  isHoneypot,
  publicSubmitResult,
  serializeAccessRequest,
  suggestedUsername,
} from '../../src/lib/accessRequest';

describe('AccessRequestCreateSchema', () => {
  it('accepts a full request and lowercases the email', () => {
    const parsed = AccessRequestCreateSchema.parse({
      name: '  Priya Sharma  ',
      email: 'Priya@Alembic.co.in',
      organisation: 'Alembic',
      title: 'Team lead',
      note: 'We want the board for CSV.',
    });
    assert.equal(parsed.name, 'Priya Sharma');
    assert.equal(parsed.email, 'priya@alembic.co.in');
    assert.equal(parsed.organisation, 'Alembic');
  });

  it('fills optional fields with empty strings', () => {
    const parsed = AccessRequestCreateSchema.parse({ name: 'Sam', email: 'sam@co.com' });
    assert.equal(parsed.organisation, '');
    assert.equal(parsed.note, '');
    assert.equal(parsed.website, '');
  });

  it('rejects a missing name and a bad email', () => {
    assert.throws(() => AccessRequestCreateSchema.parse({ name: '  ', email: 'sam@co.com' }));
    assert.throws(() => AccessRequestCreateSchema.parse({ name: 'Sam', email: 'not-an-email' }));
  });

  it('rejects a note over 1,000 characters', () => {
    assert.throws(() =>
      AccessRequestCreateSchema.parse({ name: 'Sam', email: 'sam@co.com', note: 'x'.repeat(1001) }),
    );
  });
});

describe('isHoneypot', () => {
  it('treats a filled website field as a bot', () => {
    assert.equal(isHoneypot('https://spam.example'), true);
    assert.equal(isHoneypot('  '), false);
    assert.equal(isHoneypot(''), false);
    assert.equal(isHoneypot(undefined), false);
  });
});

describe('publicSubmitResult', () => {
  it('always returns ok:true so the form stays calm', () => {
    for (const kind of ['created', 'already_pending', 'already_member', 'spam'] as const) {
      const r = publicSubmitResult(kind);
      assert.equal(r.ok, true);
      assert.ok(r.message.length > 10);
    }
  });

  it('does not advertise the honeypot — spam looks like created', () => {
    const r = publicSubmitResult('spam');
    assert.equal(r.kind, 'created');
    assert.match(r.message, /request received/i);
  });

  it('tells an existing member to sign in', () => {
    assert.match(publicSubmitResult('already_member').message, /sign in/i);
  });
});

describe('serializeAccessRequest', () => {
  it('never includes the stored IP', () => {
    const row = serializeAccessRequest({
      _id: 'abc',
      name: 'Priya',
      email: 'priya@co.com',
      organisation: 'Alembic',
      title: 'Lead',
      note: 'Need the board',
      status: 'pending',
      createdAt: new Date('2026-08-13T00:00:00Z'),
      reviewedAt: null,
      reviewedByName: '',
    });
    assert.equal(row.id, 'abc');
    assert.equal(row.status, 'pending');
    assert.equal(row.provisionedUserId, null);
    assert.equal(row.provisionedUsername, '');
    assert.equal('ip' in row, false);
  });

  it('surfaces the login handle after approve provisions the account', () => {
    const row = serializeAccessRequest({
      _id: 'abc',
      name: 'Priya',
      email: 'priya@co.com',
      status: 'approved',
      provisionedUserId: 'user-1',
      provisionedUsername: 'priya.sharma',
    });
    assert.equal(row.provisionedUserId, 'user-1');
    assert.equal(row.provisionedUsername, 'priya.sharma');
  });
});

describe('suggestedUsername', () => {
  it('takes the local part of a work email', () => {
    assert.equal(suggestedUsername('Priya.Sharma@Alembic.co.in'), 'priya.sharma');
    assert.equal(suggestedUsername('sam@co.com'), 'sam');
  });

  it('always returns a valid username even for awkward local parts', () => {
    assert.match(suggestedUsername('ab@co.com'), /^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/);
    assert.match(suggestedUsername('12lead@co.com'), /^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/);
    assert.match(suggestedUsername('.dotty@co.com'), /^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/);
  });
});

describe('AccessRequestReviewSchema', () => {
  it('requires username and employee ID to approve', () => {
    const parsed = AccessRequestReviewSchema.parse({
      status: 'approved',
      username: 'priya.sharma',
      employeeId: '100245',
    });
    assert.equal(parsed.status, 'approved');
    if (parsed.status === 'approved') {
      assert.equal(parsed.username, 'priya.sharma');
      assert.equal(parsed.employeeId, '100245');
    }
    assert.throws(() => AccessRequestReviewSchema.parse({ status: 'approved' }));
  });

  it('lets dismiss close the row with no extra fields', () => {
    assert.equal(AccessRequestReviewSchema.parse({ status: 'dismissed' }).status, 'dismissed');
    assert.throws(() => AccessRequestReviewSchema.parse({ status: 'pending' }));
  });
});

describe('adminNotifyCopy', () => {
  it('names the person and their org when present', () => {
    const withOrg = adminNotifyCopy({ name: 'Priya', email: 'p@co.com', organisation: 'Alembic' });
    assert.equal(withOrg.title, 'Access request');
    assert.match(withOrg.body, /Priya/);
    assert.match(withOrg.body, /Alembic/);
    const bare = adminNotifyCopy({ name: 'Sam', email: 's@co.com' });
    assert.match(bare.body, /s@co.com/);
    assert.doesNotMatch(bare.body, / at /);
  });
});
