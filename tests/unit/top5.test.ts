/**
 * Unit tests for the Top 5 Things helpers — the ISO week key (the document
 * cadence: wrong math here silently splits or merges people's weeks) and the
 * submitted-items normalizer.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isoWeekKey, normalizeTop5Items } from '@/lib/top5';

describe('isoWeekKey', () => {
  it('computes a known mid-year week', () => {
    // 2026-07-03 is a Friday in ISO week 27.
    assert.equal(isoWeekKey(new Date(2026, 6, 3)), '2026-W27');
  });

  it('keeps Monday..Sunday of one week on the same key', () => {
    // Week 27 of 2026 runs Mon Jun 29 → Sun Jul 5.
    assert.equal(isoWeekKey(new Date(2026, 5, 29)), '2026-W27'); // Monday
    assert.equal(isoWeekKey(new Date(2026, 6, 5)), '2026-W27'); // Sunday
    assert.equal(isoWeekKey(new Date(2026, 6, 6)), '2026-W28'); // next Monday
  });

  it('assigns early January to the previous ISO year when the week belongs there', () => {
    // Jan 1-3, 2027 fall in 2026-W53 (Friday/Saturday/Sunday of the old year's last week).
    assert.equal(isoWeekKey(new Date(2027, 0, 1)), '2026-W53');
    assert.equal(isoWeekKey(new Date(2027, 0, 3)), '2026-W53');
    assert.equal(isoWeekKey(new Date(2027, 0, 4)), '2027-W01'); // Monday starts W01
  });

  it('assigns late December to the next ISO year when the week belongs there', () => {
    // Dec 29-31, 2025 are Mon-Wed of 2026-W01 (the week containing Jan 1's Thursday).
    assert.equal(isoWeekKey(new Date(2025, 11, 29)), '2026-W01');
    assert.equal(isoWeekKey(new Date(2025, 11, 31)), '2026-W01');
  });

  it('zero-pads single-digit weeks', () => {
    assert.equal(isoWeekKey(new Date(2026, 1, 4)), '2026-W06');
  });
});

describe('normalizeTop5Items', () => {
  it('trims, drops empties, and caps at five', () => {
    assert.deepEqual(
      normalizeTop5Items(['  a ', '', 'b', '   ', 'c', 'd', 'e', 'f']),
      ['a', 'b', 'c', 'd', 'e'],
    );
  });

  it('rejects non-arrays and non-strings gracefully', () => {
    assert.deepEqual(normalizeTop5Items('not a list'), []);
    assert.deepEqual(normalizeTop5Items([1, null, { x: 1 }, 'ok']), ['ok']);
  });
});
