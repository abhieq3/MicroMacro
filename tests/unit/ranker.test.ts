import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assignVariant,
  dueFromCycle,
  medianCycleDays,
  rerankAssignees,
} from '../../src/lib/ai/ranker';

describe('assignVariant', () => {
  it('is sticky per user+project and splits ~50/50', () => {
    const a = assignVariant('u1', 'p1');
    assert.equal(assignVariant('u1', 'p1'), a);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(assignVariant(`u${i}`, 'p1'));
    assert.ok(seen.has('heuristic') && seen.has('ranker'));
  });
});

describe('rerankAssignees', () => {
  it('boosts the last-finisher and prior accepts over raw tf-idf', () => {
    const ranked = rerankAssignees(
      [
        { id: 'loud', tfidf: 10, count: 8 },
        { id: 'priya', tfidf: 6, count: 4 },
      ],
      {
        tokenLastAssigneeId: 'priya',
        acceptByAssignee: new Map([
          ['priya', { shown: 10, accepts: 8 }],
          ['loud', { shown: 10, accepts: 1 }],
        ]),
      },
    );
    assert.equal(ranked[0].id, 'priya');
  });
});

describe('medianCycleDays', () => {
  it('stays silent under 3 samples', () => {
    assert.equal(medianCycleDays([4, 6]), null);
  });
  it('returns the median of real cycles', () => {
    assert.equal(medianCycleDays([4, 6, 8]), 6);
  });
});

describe('dueFromCycle', () => {
  it('projects a calendar date from the median', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    const d = dueFromCycle(5, now);
    assert.equal(d.days, 5);
    assert.equal(d.date, '2026-08-18');
  });
});
