/**
 * Unit tests for the pure recurrence helpers (date stepping + cadence label).
 * The DB-touching parts (generateOccurrence, ensureRecurringProject) are
 * covered by integration behaviour, not here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addInterval, cadenceLabel } from '../../src/lib/recurring';

describe('addInterval', () => {
  it('steps by days and weeks', () => {
    assert.equal(addInterval('2026-01-01', 'day', 1).toISOString().slice(0, 10), '2026-01-02');
    assert.equal(addInterval('2026-01-01', 'week', 2).toISOString().slice(0, 10), '2026-01-15');
  });

  it('steps by months and years', () => {
    assert.equal(addInterval('2026-01-15', 'month', 1).toISOString().slice(0, 10), '2026-02-15');
    assert.equal(addInterval('2026-01-15', 'month', 6).toISOString().slice(0, 10), '2026-07-15');
    assert.equal(addInterval('2026-01-15', 'year', 1).toISOString().slice(0, 10), '2027-01-15');
  });

  it('treats a missing/zero count as one step', () => {
    assert.equal(addInterval('2026-01-01', 'day', 0).toISOString().slice(0, 10), '2026-01-02');
  });

  it('does not mutate its input', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    addInterval(d, 'month', 3);
    assert.equal(d.toISOString().slice(0, 10), '2026-01-01');
  });
});

describe('cadenceLabel', () => {
  it('names the common single-step cadences', () => {
    assert.equal(cadenceLabel('day', 1), 'Daily');
    assert.equal(cadenceLabel('week', 1), 'Weekly');
    assert.equal(cadenceLabel('month', 1), 'Monthly');
    assert.equal(cadenceLabel('year', 1), 'Yearly');
  });

  it('describes multi-step cadences', () => {
    assert.equal(cadenceLabel('month', 6), 'Every 6 months');
    assert.equal(cadenceLabel('week', 2), 'Every 2 weeks');
  });
});
