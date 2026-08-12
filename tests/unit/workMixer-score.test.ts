/**
 * Unit tests for the Work Mixer's deterministic scoring + mixing.
 *
 * The scorer is intentionally boring and explainable; these tests pin its
 * contract: which signals raise a score, that finished work never ranks, that
 * malformed dates never throw, and that the same input always yields the same
 * output (no hidden clock, no randomness).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scoreWorkCandidate, classifyWorkCandidate, SCORE_WEIGHTS } from '../../src/lib/workMixer/score';
import { buildWorkMixer } from '../../src/lib/workMixer/mix';
import type { WorkCandidate } from '../../src/lib/workMixer/types';

const DAY = 86_400_000;
const NOW = new Date('2026-06-14T12:00:00Z');
const daysAgo = (n: number) => new Date(+NOW - n * DAY).toISOString();
const daysAhead = (n: number) => new Date(+NOW + n * DAY).toISOString();

function task(partial: Partial<WorkCandidate>): WorkCandidate {
  return { id: 't', kind: 'task', title: 'A task', status: 'todo', ...partial };
}

describe('scoreWorkCandidate', () => {
  it('scores an overdue open task high', () => {
    const { score, reasons } = scoreWorkCandidate(task({ dueDate: daysAgo(2) }), NOW);
    assert.ok(score >= SCORE_WEIGHTS.overdue, `expected >= ${SCORE_WEIGHTS.overdue}, got ${score}`);
    assert.ok(reasons.includes('Overdue'));
  });

  it('scores a blocked task high (status=blocked)', () => {
    const { score, reasons } = scoreWorkCandidate(task({ status: 'blocked' }), NOW);
    assert.ok(score >= SCORE_WEIGHTS.blockedOrWaiting);
    assert.ok(reasons.includes('Blocked'));
  });

  it('scores a waiting task high (status=review)', () => {
    const { score, reasons } = scoreWorkCandidate(task({ status: 'review' }), NOW);
    assert.ok(score >= SCORE_WEIGHTS.blockedOrWaiting);
    assert.ok(reasons.includes('Waiting'));
  });

  it('gives due-within-3-days a medium/high score', () => {
    const { score, reasons } = scoreWorkCandidate(task({ dueDate: daysAhead(2) }), NOW);
    assert.equal(score, SCORE_WEIGHTS.dueWithin3);
    assert.ok(reasons.includes('Due within 3 days'));
  });

  it('scores due-within-7 lower than due-within-3', () => {
    const within3 = scoreWorkCandidate(task({ dueDate: daysAhead(2) }), NOW).score;
    const within7 = scoreWorkCandidate(task({ dueDate: daysAhead(6) }), NOW).score;
    assert.ok(within7 < within3, `expected ${within7} < ${within3}`);
    assert.equal(within7, SCORE_WEIGHTS.dueWithin7);
  });

  it('does not score a done task high even when overdue', () => {
    const { score, reasons } = scoreWorkCandidate(
      task({ status: 'done', dueDate: daysAgo(10), priority: 'critical' }),
      NOW,
    );
    assert.equal(score, 0);
    assert.deepEqual(reasons, ['Completed']);
  });

  it('treats a completedAt timestamp as done regardless of status', () => {
    const { score } = scoreWorkCandidate(
      task({ status: 'in_progress', completedAt: daysAgo(1), dueDate: daysAgo(5) }),
      NOW,
    );
    assert.equal(score, 0);
  });

  it('flags a 7+ day stale task with a stale reason', () => {
    const { reasons } = scoreWorkCandidate(task({ lastMeaningfulActivityAt: daysAgo(8) }), NOW);
    assert.ok(reasons.includes('No meaningful activity in 7d'));
  });

  it('scores a 14+ day stale task higher than a 7+ day stale task', () => {
    const stale7 = scoreWorkCandidate(task({ lastMeaningfulActivityAt: daysAgo(8) }), NOW).score;
    const stale14 = scoreWorkCandidate(task({ lastMeaningfulActivityAt: daysAgo(20) }), NOW).score;
    assert.ok(stale14 > stale7, `expected ${stale14} > ${stale7}`);
    assert.equal(stale7, SCORE_WEIGHTS.stale7);
    assert.equal(stale14, SCORE_WEIGHTS.stale14);
  });

  it('stacks critical + gxp + QA sign-off', () => {
    const base = scoreWorkCandidate(task({ priority: 'medium' }), NOW).score;
    const stacked = scoreWorkCandidate(
      task({ priority: 'critical', gxpCritical: true, requiresQaSignoff: true }),
      NOW,
    );
    assert.equal(
      stacked.score,
      base + SCORE_WEIGHTS.critical + SCORE_WEIGHTS.gxpCritical + SCORE_WEIGHTS.requiresQaSignoff,
    );
    assert.ok(stacked.reasons.includes('Critical priority'));
    assert.ok(stacked.reasons.includes('Business-critical'));
    assert.ok(stacked.reasons.includes('Needs QA sign-off'));
  });

  it('does not throw on missing or invalid dates', () => {
    assert.doesNotThrow(() => scoreWorkCandidate(task({ dueDate: null }), NOW));
    assert.doesNotThrow(() => scoreWorkCandidate(task({ dueDate: 'not-a-date' }), NOW));
    assert.doesNotThrow(() =>
      scoreWorkCandidate(task({ dueDate: undefined, lastMeaningfulActivityAt: 'nope' }), NOW),
    );
    // A garbage due date simply contributes no time-pressure points.
    assert.equal(scoreWorkCandidate(task({ dueDate: 'not-a-date' }), NOW).score, 0);
  });

  it('is deterministic for the same input', () => {
    const c = task({
      dueDate: daysAgo(1),
      priority: 'critical',
      gxpCritical: true,
      lastMeaningfulActivityAt: daysAgo(15),
    });
    const a = scoreWorkCandidate(c, NOW);
    const b = scoreWorkCandidate(c, NOW);
    assert.deepEqual(a, b);
  });

  it('never returns a negative score', () => {
    const { score } = scoreWorkCandidate(task({ priority: 'low', status: 'todo' }), NOW);
    assert.ok(score >= 0);
  });
});

describe('classifyWorkCandidate', () => {
  it('marks an on_hold project as blocked', () => {
    const st = classifyWorkCandidate({ id: 'p', kind: 'project', title: 'P', status: 'on_hold' }, NOW);
    assert.equal(st.blocked, true);
    assert.equal(st.done, false);
  });

  it('marks a completed project as done', () => {
    const st = classifyWorkCandidate({ id: 'p', kind: 'project', title: 'P', status: 'completed' }, NOW);
    assert.equal(st.done, true);
  });
});

describe('buildWorkMixer', () => {
  it('routes candidates into deterministic, non-overlapping sections', () => {
    const candidates: WorkCandidate[] = [
      task({ id: 'o', title: 'Overdue one', dueDate: daysAgo(3) }),
      task({ id: 'b', title: 'Blocked one', status: 'blocked' }),
      task({ id: 's', title: 'Soon one', dueDate: daysAhead(2) }),
      task({ id: 'c', title: 'Critical calm', priority: 'critical', dueDate: daysAhead(60) }),
      task({ id: 'n', title: 'Normal one', priority: 'low' }),
      task({ id: 'd', title: 'Done one', status: 'done', dueDate: daysAgo(2) }),
    ];
    const result = buildWorkMixer(candidates, { now: NOW });
    const keys = result.sections.map((s) => s.key);

    assert.ok(keys.includes('overdue'));
    assert.ok(keys.includes('waiting_or_blocked'));
    assert.ok(keys.includes('due_soon'));
    assert.ok(keys.includes('needs_attention'));
    assert.ok(keys.includes('normal'));

    // Done work never appears anywhere.
    const allIds = result.sections.flatMap((s) => s.candidates.map((c) => c.id));
    assert.ok(!allIds.includes('d'));

    // Each candidate lands in exactly one section.
    assert.equal(new Set(allIds).size, allIds.length);
    assert.equal(allIds.length, 5);

    // generatedAt is the ISO of `now` — no hidden clock.
    assert.equal(result.generatedAt, NOW.toISOString());
  });

  it('caps each section at the requested limit', () => {
    const many: WorkCandidate[] = Array.from({ length: 25 }, (_, i) =>
      task({ id: `o${i}`, title: `Overdue ${i}`, dueDate: daysAgo(1) }),
    );
    const result = buildWorkMixer(many, { now: NOW, limitPerSection: 10 });
    const overdue = result.sections.find((s) => s.key === 'overdue');
    assert.ok(overdue);
    assert.equal(overdue!.candidates.length, 10);
  });
});

describe('morning-spotlight "pressing" gate — near-term cause, not static score', () => {
  // The dashboard's morning spotlight spawns only when this composition is true.
  // Kept identical to leadDashboard: overdue || dueSoon || blocked || waiting || stalled.
  const pressing = (c: WorkCandidate) => {
    const s = classifyWorkCandidate(c, NOW);
    return s.overdue || s.dueSoon || s.blocked || s.waiting || s.stalled;
  };

  it('does NOT flag a high-scoring task whose date is weeks out (the reported bug)', () => {
    // Critical + business-critical + needs-QA-sign-off, due in 20 days, active.
    const c = task({
      dueDate: daysAhead(20),
      priority: 'critical',
      gxpCritical: true,
      requiresQaSignoff: true,
      lastMeaningfulActivityAt: daysAgo(1),
    });
    // It still SCORES high on attributes...
    assert.ok(scoreWorkCandidate(c, NOW).score >= SCORE_WEIGHTS.critical);
    // ...but there is no near-term cause, so the spotlight must not spawn.
    assert.equal(pressing(c), false);
  });

  it('flags genuine near-term causes', () => {
    assert.equal(pressing(task({ dueDate: daysAgo(1) })), true); // overdue
    assert.equal(pressing(task({ dueDate: daysAhead(2) })), true); // due within 3
    assert.equal(pressing(task({ dueDate: daysAhead(6) })), true); // due this week
    assert.equal(pressing(task({ status: 'blocked' })), true); // blocked
    assert.equal(pressing(task({ status: 'review' })), true); // waiting on review
    assert.equal(pressing(task({ lastMeaningfulActivityAt: daysAgo(10) })), true); // stalled
  });

  it('a calm active task with no date pressure is not pressing', () => {
    assert.equal(pressing(task({ dueDate: daysAhead(30), priority: 'high' })), false);
    assert.equal(pressing(task({ priority: 'high', lastMeaningfulActivityAt: daysAgo(1) })), false);
  });
})
