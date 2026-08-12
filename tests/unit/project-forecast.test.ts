/**
 * Unit tests for the project finish-date forecast engine — the pure,
 * deterministic core. A fixed RNG seed must yield identical, reproducible
 * forecasts (the property that makes the feature auditable), and the schedule
 * model must honour its two real constraints: resource contention (one task at
 * a time per person) and phase sequencing (a phase waits for the previous one).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fitDurationModels,
  simulateProjectFinish,
  speedOfLightDays,
  cycleSamplesByAssignee,
  type ForecastTaskInput,
} from '../../src/lib/ai/projectForecast';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function profilesFrom(samplesByAssignee: Record<string, number[]>) {
  const m = new Map<string, number[]>(Object.entries(samplesByAssignee));
  return fitDurationModels(m);
}

describe('fitDurationModels', () => {
  it('shrinks a sparse assignee toward the global pool', () => {
    // Alice has one fluke 40-day task; the world averages ~4 days. Her shrunk
    // profile must sit well below 40 (one sample can't define her).
    const { byAssignee, global } = profilesFrom({
      alice: [40],
      crowd: [3, 4, 5, 4, 3, 5, 4, 6, 3, 4],
    });
    const alice = byAssignee.get('alice')!;
    assert.ok(alice, 'alice profile exists');
    assert.ok(Math.exp(alice.muLog) < 20, 'shrunk median pulled well under the 40-day fluke');
    assert.ok(global.n >= 11, 'global pool aggregates everyone');
  });
});

describe('simulateProjectFinish — determinism', () => {
  it('is byte-identical for the same seed and varies by seed', () => {
    const { byAssignee, global } = profilesFrom({ a: [3, 4, 5, 4, 3, 4, 5, 4] });
    const tasks: ForecastTaskInput[] = [
      { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0, priority: 'high' },
      { id: 't2', assigneeId: 'a', status: 'todo', phaseIndex: 0, priority: 'medium' },
    ];
    const run = (seed: number) =>
      simulateProjectFinish({ tasks, byAssignee, global, now: NOW, trials: 500, seed });

    const a1 = run(123);
    const a2 = run(123);
    assert.equal(a1.p50, a2.p50, 'same seed → identical P50');
    assert.equal(a1.p80, a2.p80, 'same seed → identical P80');

    const b = run(999);
    // Different seed should (almost surely) shift at least one percentile.
    assert.ok(a1.p50 !== b.p50 || a1.p90 !== b.p90, 'different seed perturbs the distribution');
  });

  it('orders percentiles P50 ≤ P80 ≤ P90', () => {
    const { byAssignee, global } = profilesFrom({ a: [2, 6, 3, 9, 4, 7, 5, 8] });
    const tasks: ForecastTaskInput[] = [
      { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
      { id: 't2', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
    ];
    const r = simulateProjectFinish({ tasks, byAssignee, global, now: NOW, trials: 2000, seed: 7 });
    assert.ok(r.p50Days <= r.p80Days + 1e-9);
    assert.ok(r.p80Days <= r.p90Days + 1e-9);
  });
});

describe('simulateProjectFinish — scheduling constraints', () => {
  it('serialises one person but parallelises two (resource contention)', () => {
    const { byAssignee, global } = profilesFrom({
      a: [5, 5, 5, 5, 5, 5],
      b: [5, 5, 5, 5, 5, 5],
    });
    // Two tasks on ONE person take ~2× as long as the same two split across two.
    const solo = simulateProjectFinish({
      tasks: [
        { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
        { id: 't2', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
      ],
      byAssignee,
      global,
      now: NOW,
      trials: 3000,
      seed: 11,
    });
    const split = simulateProjectFinish({
      tasks: [
        { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
        { id: 't2', assigneeId: 'b', status: 'todo', phaseIndex: 0 },
      ],
      byAssignee,
      global,
      now: NOW,
      trials: 3000,
      seed: 11,
    });
    assert.ok(solo.p50Days > split.p50Days, 'one overloaded person finishes later than two in parallel');
  });

  it('adds phases sequentially (a later phase waits for the earlier one)', () => {
    const { byAssignee, global } = profilesFrom({ a: [5, 5, 5, 5, 5, 5], b: [5, 5, 5, 5, 5, 5] });
    // Same two people, but the work is split across two sequential phases:
    // even though a+b could run in parallel, phase 2 can't start until phase 1
    // is done, so it lands later than the fully-parallel single-phase case.
    const twoPhase = simulateProjectFinish({
      tasks: [
        { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
        { id: 't2', assigneeId: 'b', status: 'todo', phaseIndex: 1 },
      ],
      byAssignee,
      global,
      now: NOW,
      trials: 3000,
      seed: 11,
    });
    const onePhase = simulateProjectFinish({
      tasks: [
        { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
        { id: 't2', assigneeId: 'b', status: 'todo', phaseIndex: 0 },
      ],
      byAssignee,
      global,
      now: NOW,
      trials: 3000,
      seed: 11,
    });
    assert.ok(twoPhase.p50Days > onePhase.p50Days, 'sequential phases finish later than parallel work');
  });

  it('reports no open work as a zero-length forecast', () => {
    const { byAssignee, global } = profilesFrom({ a: [3, 4, 5] });
    const r = simulateProjectFinish({
      tasks: [{ id: 't1', assigneeId: 'a', status: 'done', phaseIndex: 0 }],
      byAssignee,
      global,
      now: NOW,
      trials: 100,
      seed: 1,
    });
    assert.equal(r.openTasks, 0);
    assert.equal(r.p50Days, 0);
  });
});

describe('cycleSamplesByAssignee', () => {
  it('extracts calendar-day cycle times and drops impossible rows', () => {
    const m = cycleSamplesByAssignee([
      { assigneeId: 'a', createdAt: '2026-01-01', completedAt: '2026-01-06' }, // 5 days
      { assigneeId: 'a', createdAt: '2026-01-01', completedAt: '2025-12-01' }, // negative → dropped
      { assigneeId: 'b', createdAt: '2026-01-01', completedAt: '2030-01-01' }, // >180 → dropped
      { assigneeId: null as any, createdAt: '2026-01-01', completedAt: '2026-01-02' }, // no assignee
    ]);
    assert.deepEqual(m.get('a'), [5]);
    assert.equal(m.has('b'), false);
  });
});

describe('speedOfLightDays — the theoretical fastest finish', () => {
  // Hand-built profiles so the expected fast durations are exact:
  // fast = exp(muLog − 1.2816·sigmaLog), floored at 0.5 days.
  const profile = (medianDays: number, sigma = 0.5) => ({
    n: 10,
    muLog: Math.log(medianDays),
    sigmaLog: sigma,
  });
  const fast = (medianDays: number, sigma = 0.5) =>
    Math.max(0.5, Math.exp(Math.log(medianDays) - 1.2816 * sigma));

  it('runs a phase fully parallel — the slowest task sets the phase, not the sum', () => {
    const byAssignee = new Map([
      ['a', profile(8)],
      ['b', profile(2)],
    ]);
    const tasks: ForecastTaskInput[] = [
      { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
      { id: 't2', assigneeId: 'b', status: 'todo', phaseIndex: 0 },
      { id: 't3', assigneeId: 'b', status: 'todo', phaseIndex: 0 },
    ];
    const days = speedOfLightDays({ tasks, byAssignee, global: profile(5) });
    // Zero queueing: three tasks, one phase → exactly the slowest fast-task.
    assert.ok(Math.abs(days - fast(8)) < 1e-9);
  });

  it('keeps phase sequencing — phases add, because that part is physics', () => {
    const byAssignee = new Map([['a', profile(4)]]);
    const tasks: ForecastTaskInput[] = [
      { id: 't1', assigneeId: 'a', status: 'todo', phaseIndex: 0 },
      { id: 't2', assigneeId: 'a', status: 'todo', phaseIndex: 1 },
    ];
    const days = speedOfLightDays({ tasks, byAssignee, global: profile(5) });
    assert.ok(Math.abs(days - 2 * fast(4)) < 1e-9);
  });

  it('scales by status remaining and ignores done work', () => {
    const byAssignee = new Map([['a', profile(6)]]);
    const tasks: ForecastTaskInput[] = [
      { id: 't1', assigneeId: 'a', status: 'review', phaseIndex: 0 }, // 25% left
      { id: 't2', assigneeId: 'a', status: 'done', phaseIndex: 0 }, // gone
    ];
    const days = speedOfLightDays({ tasks, byAssignee, global: profile(5) });
    assert.ok(Math.abs(days - Math.max(0.5, fast(6) * 0.25)) < 1e-9);
    assert.equal(speedOfLightDays({ tasks: [], byAssignee, global: profile(5) }), 0);
  });

  it('sits at or below the Monte-Carlo P50 when queueing exists', () => {
    // Four todo tasks on ONE person, one phase: the simulator must serialise
    // them; the speed-of-light run doesn't. SOL is the benchmark the forecast
    // can never beat — the gap is the queueing a lead can act on.
    const { byAssignee, global } = fitDurationModels(
      new Map([['a', [3, 4, 5, 4, 3, 4, 5, 4, 6, 4]]]),
    );
    const tasks: ForecastTaskInput[] = [1, 2, 3, 4].map((i) => ({
      id: `t${i}`,
      assigneeId: 'a',
      status: 'todo' as const,
      phaseIndex: 0,
    }));
    const sol = speedOfLightDays({ tasks, byAssignee, global });
    const sim = simulateProjectFinish({ tasks, byAssignee, global, now: NOW, trials: 1000, seed: 42 });
    assert.ok(sol < sim.p50Days, `SOL (${sol.toFixed(1)}d) must undercut P50 (${sim.p50Days.toFixed(1)}d)`);
  });
});
