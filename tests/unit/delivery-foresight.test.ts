/**
 * Unit tests for the Delivery Foresight engine — the PURE layer only (model
 * fits, the seeded Monte-Carlo schedule simulation, anomaly detection,
 * reliability scoring and the composed verdict). No database is touched,
 * mirroring the other tests/unit specs. Every Monte-Carlo assertion relies on
 * the fixed RNG seed making the simulation reproducible.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fitLogNormal,
  cycleSamples,
  gapSamples,
  weeklyThroughput,
  fitVelocity,
  fitCadence,
  simulatePersonalSchedule,
  detectAnomaly,
  reliabilityIndex,
  computeForesight,
  summarizeTeamForesight,
  type LogNormalPrior,
  type TeamMemberForesight,
} from '../../src/lib/ai/deliveryForesight';

const PRIOR: LogNormalPrior = { muLog: Math.log(4), sigmaLog: 0.7 };
const GAP_PRIOR: LogNormalPrior = { muLog: Math.log(3), sigmaLog: 0.7 };

// ── fitLogNormal ──────────────────────────────────────────────────────────────

describe('fitLogNormal', () => {
  it('recovers the central value from many tight samples', () => {
    const m = fitLogNormal([5, 5, 5, 5, 5, 5, 5, 5, 5, 5], PRIOR);
    assert.ok(Math.abs(m.median - 5) < 0.6, `median ${m.median} near 5`);
    assert.equal(m.n, 10);
  });
  it('shrinks a single sample toward the prior (two points cannot define you)', () => {
    const m = fitLogNormal([40], PRIOR);
    // n/(n+5) = 1/6 weight on the lone 40-day outlier → pulled well below it.
    assert.ok(m.median < 20, `shrunk median ${m.median} < 20`);
    assert.ok(m.median > Math.exp(PRIOR.muLog), 'but above the bare prior');
  });
  it('falls back to the prior on empty input', () => {
    const m = fitLogNormal([], PRIOR);
    assert.ok(Math.abs(m.muLog - PRIOR.muLog) < 1e-9);
  });
});

// ── sample extraction ─────────────────────────────────────────────────────────

describe('cycleSamples / gapSamples', () => {
  it('computes calendar-day cycle times and drops mis-dated rows', () => {
    const s = cycleSamples([
      { createdAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-04T00:00:00Z' }, // 3d
      { createdAt: '2026-01-01T00:00:00Z', completedAt: '2025-01-01T00:00:00Z' }, // negative → drop
      { createdAt: null, completedAt: '2026-01-04T00:00:00Z' }, // no start → drop
    ]);
    assert.deepEqual(s, [3]);
  });
  it('computes inter-completion gaps from unsorted timestamps', () => {
    const g = gapSamples(['2026-01-10T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-04T00:00:00Z']);
    assert.deepEqual(g, [3, 6]); // sorted → 1,4,10 → gaps 3 and 6
  });
});

// ── velocity (Holt's linear) ──────────────────────────────────────────────────

describe('fitVelocity', () => {
  it('reads a steadily rising series as rising', () => {
    const v = fitVelocity([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    assert.equal(v.direction, 'rising');
    assert.ok(v.forecastNext > v.perWeekMean, 'forecast leads the flat mean');
  });
  it('reads a declining series as cooling', () => {
    const v = fitVelocity([6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
    assert.equal(v.direction, 'cooling');
  });
  it('reads a flat series as steady', () => {
    const v = fitVelocity([3, 3, 3, 3, 3, 3]);
    assert.equal(v.direction, 'steady');
    assert.ok(Math.abs(v.forecastNext - 3) < 0.5);
  });
});

// ── weekly bucketing ──────────────────────────────────────────────────────────

describe('weeklyThroughput', () => {
  it('buckets completions into trailing weeks with the current week last', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const weeks = weeklyThroughput(
      [
        '2026-06-14T00:00:00Z', // this week
        '2026-06-13T00:00:00Z', // this week
        '2026-06-05T00:00:00Z', // ~1.4 weeks ago
      ],
      4,
      now,
    );
    assert.equal(weeks.length, 4);
    assert.equal(weeks[3], 2, 'two in the current week');
    assert.equal(weeks[2], 1, 'one the week before');
  });
});

// ── cadence ───────────────────────────────────────────────────────────────────

describe('fitCadence', () => {
  it('identifies the peak shipping day', () => {
    // 2026-06-09 is a Tuesday.
    const c = fitCadence([
      '2026-06-09T15:00:00',
      '2026-06-16T15:00:00',
      '2026-06-23T15:00:00',
      '2026-06-10T09:00:00',
    ]);
    assert.equal(c.peakDow, 2, 'Tuesday (getDay()===2)');
    assert.equal(c.peakPeriod, 'afternoon');
  });
});

// ── Monte-Carlo schedule simulation ───────────────────────────────────────────

describe('simulatePersonalSchedule', () => {
  const gapModel = fitLogNormal([5, 5, 5, 5, 5, 5], GAP_PRIOR); // ~5-day cadence
  const now = new Date('2026-06-15T00:00:00Z');

  it('is deterministic for a fixed seed', () => {
    const open = [
      { id: 'a', status: 'todo', priority: 'high', dueDate: '2026-06-30T00:00:00Z' },
      { id: 'b', status: 'todo', priority: 'medium', dueDate: '2026-07-10T00:00:00Z' },
    ];
    const r1 = simulatePersonalSchedule({ open, gapModel, now, trials: 1500, seed: 42 });
    const r2 = simulatePersonalSchedule({ open, gapModel, now, trials: 1500, seed: 42 });
    assert.equal(r1.clearP80Days, r2.clearP80Days);
    assert.equal(r1.perTask[0].slipProb, r2.perTask[0].slipProb);
  });

  it('flags a task due tomorrow as very likely to slip', () => {
    const r = simulatePersonalSchedule({
      open: [{ id: 'tight', status: 'todo', priority: 'high', dueDate: '2026-06-16T00:00:00Z' }],
      gapModel,
      now,
      trials: 2000,
      seed: 7,
    });
    assert.ok(r.perTask[0].slipProb > 0.7, `slipProb ${r.perTask[0].slipProb} > 0.7`);
    assert.equal(r.tasksAtRisk, 1);
  });

  it('clears a single task sooner than a queue of five', () => {
    const one = simulatePersonalSchedule({
      open: [{ id: 'x', status: 'todo' }],
      gapModel,
      now,
      trials: 1500,
      seed: 7,
    });
    const five = simulatePersonalSchedule({
      open: Array.from({ length: 5 }, (_, i) => ({ id: `x${i}`, status: 'todo' })),
      gapModel,
      now,
      trials: 1500,
      seed: 7,
    });
    assert.ok(five.clearP80Days > one.clearP80Days, 'a longer queue clears later');
  });
});

// ── anomaly detection ─────────────────────────────────────────────────────────

describe('detectAnomaly', () => {
  it('flags cooling when the current week falls below the control band', () => {
    const a = detectAnomaly({ weeks: [4, 6, 5, 7, 5, 0], gapMedianDays: 3, daysSinceLastCompletion: 2 });
    assert.equal(a.state, 'cooling');
  });
  it('flags a stall when idle far longer than the personal norm', () => {
    const a = detectAnomaly({ weeks: [4, 6, 5, 7, 5, 4], gapMedianDays: 3, daysSinceLastCompletion: 20 });
    assert.equal(a.state, 'stalled');
  });
  it('flags a surge above the band', () => {
    const a = detectAnomaly({ weeks: [4, 6, 5, 7, 5, 30], gapMedianDays: 3, daysSinceLastCompletion: 1 });
    assert.equal(a.state, 'surge');
  });
  it('says insufficient with too little baseline', () => {
    const a = detectAnomaly({ weeks: [5, 5, 0], gapMedianDays: 3, daysSinceLastCompletion: 1 });
    assert.equal(a.state, 'insufficient');
  });
});

// ── reliability index ─────────────────────────────────────────────────────────

describe('reliabilityIndex', () => {
  it('rewards a consistent, on-time, well-sampled record', () => {
    const r = reliabilityIndex({ onTimeRate: 0.95, cycleCv: 0.2, samples: 30 });
    assert.ok(r >= 80, `reliability ${r} >= 80`);
  });
  it('stays near neutral when the sample is thin', () => {
    const r = reliabilityIndex({ onTimeRate: 1, cycleCv: 0, samples: 1 });
    assert.ok(r >= 50 && r <= 65, `thin-sample reliability ${r} near 50`);
  });
});

// ── computeForesight (end to end, pure) ───────────────────────────────────────

describe('computeForesight', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  // A solid, on-time history: ~12 tasks, ~3-day cycle, ~5-day cadence.
  function goodHistory() {
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const finished = new Date(+now - (i * 5 + 2) * 86_400_000);
      const created = new Date(+finished - 3 * 86_400_000);
      const due = new Date(+finished + 1 * 86_400_000); // finished on time
      rows.push({
        createdAt: created.toISOString(),
        completedAt: finished.toISOString(),
        dueDate: due.toISOString(),
        ccTcd: null,
      });
    }
    return rows;
  }

  it('withholds a forecast until there is enough history', () => {
    const f = computeForesight({
      completed: [
        { createdAt: '2026-06-01', completedAt: '2026-06-03', dueDate: null, ccTcd: null },
        { createdAt: '2026-06-04', completedAt: '2026-06-06', dueDate: null, ccTcd: null },
      ],
      open: [],
      prior: PRIOR,
      gapPrior: GAP_PRIOR,
      now,
    });
    assert.equal(f.hasSignal, false);
    assert.equal(f.status, 'building');
    assert.equal(f.digestLine, null);
  });

  it('builds a signal from quick same-session completions (no cycle time)', () => {
    // Tasks created and finished within minutes produce no usable cycle sample
    // (cycleSamples drops gaps < ~2.4h), yet a person who has closed 6 of them
    // clearly has a delivery rhythm — the signal must come up, not sit at
    // "building" forever. This is the regression for Team Foresight never
    // leaving "Calibrating" on teams that close work fast.
    const rows = [];
    for (let i = 0; i < 6; i++) {
      const finished = new Date(+now - (i * 4 + 1) * 86_400_000);
      const created = new Date(+finished - 10 * 60_000); // 10 minutes earlier
      rows.push({
        createdAt: created.toISOString(),
        completedAt: finished.toISOString(),
        dueDate: null,
        ccTcd: null,
      });
    }
    assert.equal(cycleSamples(rows).length, 0, 'no cycle samples from sub-hour completions');
    const f = computeForesight({ completed: rows, open: [], prior: PRIOR, gapPrior: GAP_PRIOR, now });
    assert.equal(f.hasSignal, true);
    assert.notEqual(f.status, 'building');
  });

  it('reports an empty plate as clear', () => {
    const f = computeForesight({
      completed: goodHistory(),
      open: [],
      prior: PRIOR,
      gapPrior: GAP_PRIOR,
      now,
    });
    assert.equal(f.hasSignal, true);
    assert.equal(f.status, 'clear');
    assert.equal(f.openTasks, 0);
  });

  it('flags at_risk with a tight due date and emits a digest line', () => {
    const f = computeForesight({
      completed: goodHistory(),
      open: [
        { id: 'a', title: 'SOP review', status: 'todo', priority: 'high', dueDate: '2026-06-16T00:00:00Z' },
      ],
      prior: PRIOR,
      gapPrior: GAP_PRIOR,
      now,
      seed: 99,
    });
    assert.equal(f.status, 'at_risk');
    assert.ok(f.tasksAtRisk >= 1);
    assert.ok(f.topRisk && f.topRisk.title === 'SOP review');
    assert.ok(typeof f.digestLine === 'string' && f.digestLine!.includes('SOP review'));
  });

  it('is reproducible for a fixed seed', () => {
    const open = [
      { id: 'a', title: 'T', status: 'todo', priority: 'medium', dueDate: '2026-07-01T00:00:00Z' },
    ];
    const a = computeForesight({
      completed: goodHistory(),
      open,
      prior: PRIOR,
      gapPrior: GAP_PRIOR,
      now,
      seed: 5,
    });
    const b = computeForesight({
      completed: goodHistory(),
      open,
      prior: PRIOR,
      gapPrior: GAP_PRIOR,
      now,
      seed: 5,
    });
    assert.equal(a.clearDateP80, b.clearDateP80);
    assert.equal(a.headline, b.headline);
  });
});

// ── summarizeTeamForesight (pure roll-up) ─────────────────────────────────────

describe('summarizeTeamForesight', () => {
  function member(p: Partial<TeamMemberForesight>): TeamMemberForesight {
    return {
      id: p.id || 'x',
      name: p.name || 'X',
      role: p.role,
      hasSignal: p.hasSignal ?? true,
      status: p.status || 'on_track',
      reliability: p.reliability ?? 70,
      reliabilityLabel: p.reliabilityLabel || 'Dependable',
      trend: p.trend || 'steady',
      throughputPerWeek: p.throughputPerWeek ?? 3,
      openTasks: p.openTasks ?? 2,
      tasksAtRisk: p.tasksAtRisk ?? 0,
      clearDateP80: p.clearDateP80 ?? null,
      clearDays: p.clearDays ?? null,
    };
  }

  it('counts statuses and sums team throughput', () => {
    const s = summarizeTeamForesight([
      member({ id: 'a', status: 'on_track', throughputPerWeek: 2 }),
      member({ id: 'b', status: 'clear', throughputPerWeek: 1.5 }),
      member({ id: 'c', status: 'cooling', throughputPerWeek: 1 }),
    ]);
    assert.equal(s.counts.onTrack, 1);
    assert.equal(s.counts.clear, 1);
    assert.equal(s.counts.cooling, 1);
    assert.equal(s.teamThroughputPerWeek, 4.5);
    assert.equal(s.watch.length, 0);
  });

  it('floats the worst (overloaded, then most at-risk) onto the watch list', () => {
    const s = summarizeTeamForesight([
      member({ id: 'ok', name: 'OK', status: 'on_track' }),
      member({ id: 'risk', name: 'Risk', status: 'at_risk', tasksAtRisk: 2 }),
      member({ id: 'over', name: 'Over', status: 'overloaded', tasksAtRisk: 1, clearDays: 25 }),
    ]);
    assert.equal(s.watch[0].name, 'Over', 'overloaded ranks first');
    assert.equal(s.watch[1].name, 'Risk');
    assert.equal(s.totalAtRisk, 3);
    assert.ok(/slip|rebalanc/i.test(s.headline));
  });

  it('reads an all-clear team as on track', () => {
    const s = summarizeTeamForesight([member({ status: 'on_track' }), member({ status: 'clear' })]);
    assert.equal(s.watch.length, 0);
    assert.ok(/on track/i.test(s.headline));
  });

  it('says so when no one has enough history', () => {
    const s = summarizeTeamForesight([member({ status: 'building', hasSignal: false })]);
    assert.ok(/history/i.test(s.headline));
  });
});
