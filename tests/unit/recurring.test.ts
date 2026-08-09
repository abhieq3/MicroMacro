/**
 * Unit tests for pure recurrence helpers (interval stepping + monthly weekday).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addInterval,
  advanceMonthlyWeekday,
  activityCadenceLabel,
  cadenceLabel,
  catchUpNextDue,
  firstMonthlyWeekdayOnOrAfter,
  monthlyWeekdayCadenceLabel,
  nthWeekdayOfMonth,
  parseScheduleDate,
  resolveFirstDue,
} from '../../src/lib/recurring';

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

describe('nthWeekdayOfMonth / monthly weekday', () => {
  // Local calendar days via local noon — format as YYYY-MM-DD in local TZ.
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  it('finds the last Sunday of August 2026', () => {
    // Aug 2026: last day is Mon 31 → last Sunday is 30.
    const d = nthWeekdayOfMonth(2026, 7, 0, -1); // monthIndex 7 = August
    assert.equal(ymd(d), '2026-08-30');
    assert.equal(d.getDay(), 0);
  });

  it('finds the first Monday of September 2026', () => {
    // Sep 1 2026 is Tuesday → first Monday is Sep 7.
    const d = nthWeekdayOfMonth(2026, 8, 1, 1);
    assert.equal(ymd(d), '2026-09-07');
    assert.equal(d.getDay(), 1);
  });

  it('snaps on or after a mid-month date to the next last Sunday', () => {
    // On 9 Aug 2026, next last Sunday is still Aug 30.
    const d = firstMonthlyWeekdayOnOrAfter(new Date(2026, 7, 9, 12, 0, 0), 0, -1);
    assert.equal(ymd(d), '2026-08-30');
  });

  it('snaps past the last Sunday of August to September’s', () => {
    // After Aug 30, next last Sunday is Sep 27 2026.
    const d = firstMonthlyWeekdayOnOrAfter(new Date(2026, 7, 31, 12, 0, 0), 0, -1);
    assert.equal(ymd(d), '2026-09-27');
  });

  it('advances from one last-Sunday to the next month’s', () => {
    const next = advanceMonthlyWeekday(new Date(2026, 7, 30, 12, 0, 0), 0, -1, 1);
    assert.equal(ymd(next), '2026-09-27');
  });

  it('advances every 2 months', () => {
    const next = advanceMonthlyWeekday(new Date(2026, 7, 30, 12, 0, 0), 0, -1, 2);
    // Aug → Oct: last Sunday of Oct 2026 is Oct 25.
    assert.equal(ymd(next), '2026-10-25');
  });

  it('labels monthly weekday cadences', () => {
    assert.equal(monthlyWeekdayCadenceLabel(0, -1, 1), 'last Sunday of each month');
    assert.equal(monthlyWeekdayCadenceLabel(1, 1, 1), '1st Monday of each month');
    assert.equal(monthlyWeekdayCadenceLabel(5, 2, 3), '2nd Friday every 3 months');
  });

  it('activityCadenceLabel picks the right format', () => {
    assert.equal(
      activityCadenceLabel({
        scheduleKind: 'monthly_weekday',
        weekday: 0,
        weekdayOrdinal: -1,
        intervalCount: 1,
      }),
      'last Sunday of each month',
    );
    assert.equal(
      activityCadenceLabel({ scheduleKind: 'interval', intervalUnit: 'month', intervalCount: 1 }),
      'Monthly',
    );
  });
});

describe('catchUpNextDue / resolveFirstDue', () => {
  const ymd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  it('parses date-only strings as local noon', () => {
    const d = parseScheduleDate('2026-08-30');
    assert.equal(ymd(d), '2026-08-30');
    assert.equal(d.getHours(), 12);
  });

  it('catches a stale last-Sunday cursor from June up to August', () => {
    // Stale nextDue = last Sunday of June 2026; today = 9 Aug 2026 → Aug 30.
    const next = catchUpNextDue(
      {
        scheduleKind: 'monthly_weekday',
        weekday: 0,
        weekdayOrdinal: -1,
        intervalCount: 1,
        nextDueDate: new Date(2026, 5, 28, 12, 0, 0),
      },
      new Date(2026, 7, 9, 12, 0, 0),
    );
    assert.equal(ymd(next), '2026-08-30');
  });

  it('leaves a future nextDue alone', () => {
    const next = catchUpNextDue(
      {
        scheduleKind: 'monthly_weekday',
        weekday: 0,
        weekdayOrdinal: -1,
        intervalCount: 1,
        nextDueDate: new Date(2026, 7, 30, 12, 0, 0),
      },
      new Date(2026, 7, 9, 12, 0, 0),
    );
    assert.equal(ymd(next), '2026-08-30');
  });

  it('catches up an interval series every 3 months', () => {
    // next 6 Jan 2026, today 9 Aug 2026 → 6 Oct 2026 (Jan→Apr→Jul→Oct).
    const next = catchUpNextDue(
      {
        scheduleKind: 'interval',
        intervalUnit: 'month',
        intervalCount: 3,
        nextDueDate: new Date(2026, 0, 6, 12, 0, 0),
      },
      new Date(2026, 7, 9, 12, 0, 0),
    );
    assert.equal(ymd(next), '2026-10-06');
  });

  it('resolveFirstDue never returns a past last-Sunday', () => {
    const first = resolveFirstDue(
      {
        scheduleKind: 'monthly_weekday',
        weekday: 0,
        weekdayOrdinal: -1,
        intervalCount: 1,
      },
      '2026-06-01',
      new Date(2026, 7, 9, 12, 0, 0),
    );
    assert.equal(ymd(first), '2026-08-30');
  });
});
