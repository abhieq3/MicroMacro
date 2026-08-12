/**
 * Unit tests for the Daily Brief's pure layer — the rule-based headline
 * composer. Selection/ranking is rule-based by architectural invariant, so the
 * sentence a user wakes up to must be deterministic and predictable.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeHeadline } from '../../src/lib/brief';

describe('composeHeadline — contributor', () => {
  it('all clear when nothing is due', () => {
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 0, today: 0, soon: 0 }),
      'All clear — nothing due today.',
    );
  });

  it('points at the overdue first when both exist', () => {
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 1, today: 2, soon: 0 }),
      '2 due today and 1 overdue — clear the overdue first.',
    );
  });

  it('singular/plural agreement on overdue-only', () => {
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 1, today: 0, soon: 0 }),
      "1 overdue task — today's the day to close it out.",
    );
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 3, today: 0, soon: 0 }),
      "3 overdue tasks — today's the day to close them out.",
    );
  });

  it('mentions the look-ahead only alongside due-today', () => {
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 0, today: 1, soon: 2 }),
      "1 task due today, 2 more coming up — you've got this.",
    );
    assert.equal(
      composeHeadline({ role: 'contributor', overdue: 0, today: 0, soon: 2 }),
      'Nothing due today — 2 coming up in the next 2 days.',
    );
  });
});

describe('composeHeadline — lead', () => {
  it('blocked team work outranks personal due-dates', () => {
    assert.equal(
      composeHeadline({ role: 'lead', overdue: 2, today: 1, soon: 0, blocked: 2 }),
      '2 tasks blocked on your team — unblock them before they slip.',
    );
  });

  it('falls back to the personal lens when the team is clean', () => {
    assert.equal(
      composeHeadline({ role: 'lead', overdue: 0, today: 2, soon: 0, blocked: 0, signoffs: 0 }),
      "2 tasks due today — you've got this.",
    );
  });

  it('surfaces pending sign-offs when there is nothing else', () => {
    assert.equal(
      composeHeadline({ role: 'lead', overdue: 0, today: 0, soon: 0, blocked: 0, signoffs: 3 }),
      '3 QA sign-offs pending on your team.',
    );
  });
});

describe('composeHeadline — admin', () => {
  it('summarises workspace movement', () => {
    assert.equal(
      composeHeadline({
        role: 'admin',
        overdue: 0,
        today: 0,
        soon: 0,
        doneYesterday: 4,
        overdueTotal: 7,
      }),
      'Workspace: 4 tasks closed yesterday, 7 overdue across shared projects.',
    );
  });

  it('says so when the workspace is quiet', () => {
    assert.equal(
      composeHeadline({
        role: 'admin',
        overdue: 0,
        today: 0,
        soon: 0,
        doneYesterday: 0,
        overdueTotal: 0,
      }),
      'Workspace is quiet — nothing closed yesterday, nothing overdue.',
    );
  });

  it('master_admin gets the admin lens', () => {
    assert.match(
      composeHeadline({
        role: 'master_admin',
        overdue: 0,
        today: 0,
        soon: 0,
        doneYesterday: 1,
        overdueTotal: 0,
      }),
      /^Workspace: 1 task closed yesterday/,
    );
  });
});
