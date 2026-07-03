/**
 * Project finish-date forecast — a probabilistic delivery model.
 *
 * The question every lead actually asks ("are we going to make it?") deserves
 * an honest answer with its uncertainty attached, not a single made-up date.
 * This module computes a *distribution* of likely project finish dates by
 * Monte-Carlo–simulating the remaining work thousands of times, then reports a
 * few percentiles (P50 / P80 / P90) and the single binding constraint — the
 * "long pole" a lead can actually act on.
 *
 * The machinery is deliberately heavy; the surfaced output is one quiet line.
 *
 * How it works — three layers:
 *
 *   1. Per-person duration models. From each assignee's completed work we learn
 *      a LOG-NORMAL cycle-time distribution (cycle times are right-skewed, so a
 *      normal would be wrong). Sparse histories are stabilised with
 *      empirical-Bayes shrinkage toward the workspace-wide distribution — the
 *      same "two data points can't define you" instinct slip-risk uses, made
 *      continuous: weight = n / (n + K).
 *
 *   2. A schedule simulator. Each trial samples a remaining duration for every
 *      open task (scaled by how far along its status implies it is), then
 *      schedules them under two real constraints: a person can only do one task
 *      at a time (resource contention), and a lifecycle phase can't start until
 *      the previous phase finishes (sequencing). Project finish = the last task
 *      to land. The task that lands last is recorded as that trial's binding
 *      constraint.
 *
 *   3. Aggregation. Over N trials we get an empirical finish-date distribution
 *      (→ percentiles) and a frequency table of binding constraints (→ the long
 *      pole). A fixed RNG seed makes every run reproducible and auditable — a
 *      hard requirement in a GxP context: the same inputs always yield the same
 *      forecast, traceable to the historical samples that fed it.
 *
 * Pure and deterministic: no I/O, no LLM, no external service. The caller loads
 * the rows; this does the maths. Free forever by construction.
 */

const DAY = 86_400_000;

/* ── Seeded RNG (mulberry32) + standard normal (Box–Muller) ─────────────────
   A fixed seed makes the whole forecast reproducible — re-running it on the
   same inputs returns byte-identical numbers, which is what makes it auditable
   rather than a slot machine. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ── Duration models ────────────────────────────────────────────────────── */
export interface DurationProfile {
  /** Number of completed-task samples behind this profile. */
  n: number;
  /** Mean of ln(cycle days). */
  muLog: number;
  /** Std-dev of ln(cycle days). */
  sigmaLog: number;
}

// Shrinkage strength: an assignee needs ~K samples before their own history
// outweighs the workspace prior. Small enough to personalise quickly, large
// enough that one fluke task can't.
const SHRINK_K = 5;
// Floor on log-variance so a one-sample assignee still carries real uncertainty
// (otherwise σ→0 collapses them to a fake-precise point estimate).
const SIGMA_FLOOR = 0.4;
// Weak default prior used only when the workspace itself has almost no history.
const DEFAULT_MU = Math.log(5); // ~5-day typical cycle
const DEFAULT_SIGMA = 0.6;

function logStats(samples: number[]): { mu: number; sigma: number } {
  if (samples.length === 0) return { mu: DEFAULT_MU, sigma: DEFAULT_SIGMA };
  const logs = samples.map((x) => Math.log(Math.max(0.5, x)));
  const mu = logs.reduce((a, b) => a + b, 0) / logs.length;
  const variance =
    logs.length > 1 ? logs.reduce((a, b) => a + (b - mu) ** 2, 0) / (logs.length - 1) : DEFAULT_SIGMA ** 2;
  return { mu, sigma: Math.sqrt(variance) };
}

/**
 * Learn one shrunk log-normal profile per assignee, plus a workspace-wide
 * profile used for shrinkage and for tasks whose assignee has no history.
 */
export function fitDurationModels(samplesByAssignee: Map<string, number[]>): {
  byAssignee: Map<string, DurationProfile>;
  global: DurationProfile;
} {
  const allSamples: number[] = [];
  for (const xs of samplesByAssignee.values()) allSamples.push(...xs);
  const g = logStats(allSamples);
  const global: DurationProfile = {
    n: allSamples.length,
    muLog: g.mu,
    sigmaLog: Math.max(SIGMA_FLOOR, g.sigma),
  };

  const byAssignee = new Map<string, DurationProfile>();
  for (const [id, xs] of samplesByAssignee) {
    if (xs.length === 0) continue;
    const s = logStats(xs);
    const w = xs.length / (xs.length + SHRINK_K); // empirical-Bayes weight
    byAssignee.set(id, {
      n: xs.length,
      muLog: w * s.mu + (1 - w) * global.muLog,
      sigmaLog: Math.max(SIGMA_FLOOR, w * s.sigma + (1 - w) * global.sigmaLog),
    });
  }
  return { byAssignee, global };
}

/* ── Tasks + status → remaining-fraction ────────────────────────────────── */
export interface ForecastTaskInput {
  id: string;
  /** Assignee id, or null/undefined when unassigned. */
  assigneeId?: string | null;
  /** todo | in_progress | review | blocked | done (done is ignored). */
  status: string;
  /** 0-based sequencing index of the task's phase (0 if the project has none). */
  phaseIndex: number;
  priority?: string;
}

// A learned cycle time covers the whole task (creation → done). A task already
// under way has less left; scale the sampled full duration by how far its
// status implies it's progressed. Blocked work is treated as slightly worse
// than fresh — it has to be unblocked first.
const STATUS_REMAINING: Record<string, number> = {
  todo: 1.0,
  in_progress: 0.55,
  review: 0.25,
  blocked: 1.15,
};
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const UNASSIGNED = '__unassigned__';

export interface ForecastCore {
  /** Calendar-day offsets from `now` at each percentile. */
  p50Days: number;
  p80Days: number;
  p90Days: number;
  p50: string;
  p80: string;
  p90: string;
  /** The assignee most often last-to-finish across trials (the constraint). */
  longPoleAssignee: { assigneeId: string; share: number } | null;
  /** The phase most often containing the binding task. */
  longPolePhase: { phaseIndex: number; share: number } | null;
  openTasks: number;
  /** Open tasks whose assignee had a real (non-global) profile. */
  modelledTasks: number;
  trials: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Simulate the remaining work `trials` times and summarise the finish-date
 * distribution. Deterministic for a given `seed`.
 */
export function simulateProjectFinish(opts: {
  tasks: ForecastTaskInput[];
  byAssignee: Map<string, DurationProfile>;
  global: DurationProfile;
  now?: Date;
  trials?: number;
  seed?: number;
}): ForecastCore {
  const now = opts.now ?? new Date();
  const trials = opts.trials ?? 4000;
  const rng = mulberry32(opts.seed ?? 0x9e3779b9);

  // Pre-resolve each open task's profile, status factor, scheduling key and
  // ordering, once — the inner trial loop stays tight.
  const open = opts.tasks
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const key = t.assigneeId ? String(t.assigneeId) : UNASSIGNED;
      const profile = (t.assigneeId && opts.byAssignee.get(String(t.assigneeId))) || opts.global;
      const modelled = !!(t.assigneeId && opts.byAssignee.has(String(t.assigneeId)));
      const factor = STATUS_REMAINING[t.status] ?? 1.0;
      return {
        key,
        phaseIndex: t.phaseIndex || 0,
        muLog: profile.muLog,
        sigmaLog: profile.sigmaLog,
        factor,
        prank: PRIORITY_RANK[t.priority || 'medium'] ?? 2,
        modelled,
      };
    })
    // Schedule earlier phases first; within a phase, higher priority first.
    .sort((a, b) => a.phaseIndex - b.phaseIndex || a.prank - b.prank);

  const modelledTasks = open.filter((t) => t.modelled).length;

  if (open.length === 0) {
    const iso = now.toISOString();
    return {
      p50Days: 0,
      p80Days: 0,
      p90Days: 0,
      p50: iso,
      p80: iso,
      p90: iso,
      longPoleAssignee: null,
      longPolePhase: null,
      openTasks: 0,
      modelledTasks: 0,
      trials: 0,
    };
  }

  const finishes = new Float64Array(trials);
  const bindByAssignee = new Map<string, number>();
  const bindByPhase = new Map<number, number>();
  const assigneeFree = new Map<string, number>();

  for (let trial = 0; trial < trials; trial++) {
    assigneeFree.clear();
    let runningMax = 0; // max finish seen so far → gates the next phase
    let phaseGate = 0; // earliest a task in the current phase may start
    let curPhase = open[0].phaseIndex;
    let projFinish = 0;
    let bindKey = UNASSIGNED;
    let bindPhase = curPhase;

    for (let i = 0; i < open.length; i++) {
      const t = open[i];
      // Entering a later phase: it can't begin until everything before it is done.
      if (t.phaseIndex !== curPhase) {
        curPhase = t.phaseIndex;
        phaseGate = runningMax;
      }
      const dur = Math.max(0.5, Math.exp(t.muLog + t.sigmaLog * gaussian(rng)) * t.factor);
      const free = assigneeFree.get(t.key) ?? 0;
      const start = free > phaseGate ? free : phaseGate;
      const finish = start + dur;
      assigneeFree.set(t.key, finish);
      if (finish > runningMax) runningMax = finish;
      if (finish > projFinish) {
        projFinish = finish;
        bindKey = t.key;
        bindPhase = t.phaseIndex;
      }
    }

    finishes[trial] = projFinish;
    bindByAssignee.set(bindKey, (bindByAssignee.get(bindKey) ?? 0) + 1);
    bindByPhase.set(bindPhase, (bindByPhase.get(bindPhase) ?? 0) + 1);
  }

  const sorted = Array.from(finishes).sort((a, b) => a - b);
  const p50Days = percentile(sorted, 50);
  const p80Days = percentile(sorted, 80);
  const p90Days = percentile(sorted, 90);

  const topAssignee = pickTop(bindByAssignee);
  const longPoleAssignee =
    topAssignee && topAssignee.key !== UNASSIGNED
      ? { assigneeId: topAssignee.key, share: topAssignee.count / trials }
      : null;
  const topPhase = pickTopNum(bindByPhase);
  const longPolePhase = topPhase ? { phaseIndex: topPhase.key, share: topPhase.count / trials } : null;

  return {
    p50Days,
    p80Days,
    p90Days,
    p50: addDays(now, p50Days).toISOString(),
    p80: addDays(now, p80Days).toISOString(),
    p90: addDays(now, p90Days).toISOString(),
    longPoleAssignee,
    longPolePhase,
    openTasks: open.length,
    modelledTasks,
    trials,
  };
}

/* ── Speed of light ──────────────────────────────────────────────────────────
   Jensen Huang's planning benchmark, applied to a schedule: measure the plan
   against the physics, not against the last plan. The speed-of-light finish is
   the theoretical fastest completion, where:

     - Phase sequencing IS physics — a validation phase genuinely cannot start
       before the build phase ends, so phases still run in order.
     - Queueing is NOT physics — "one person, one task at a time" is an org
       constraint, so within a phase everything runs in parallel.
     - Every task runs at its assignee's demonstrated-FAST pace: the P10 of
       their learned log-normal (exp(μ − 1.2816σ)), scaled by how much of the
       task actually remains. Fast, but grounded in what that person has
       really done — not fantasy.

   With fixed durations no Monte Carlo is needed: the finish is simply the sum
   over phases of the slowest task in each phase. Deterministic, auditable.

   The point is the GAP: SOL vs the P50 forecast is queueing + contention +
   variance — exactly the part of the schedule a lead can act on (rebalance,
   unblock, split a phase). SOL itself is not a promise; it's the benchmark
   that makes the slack visible. */
const SOL_Z = -1.2816; // 10th percentile of the standard normal

export function speedOfLightDays(opts: {
  tasks: ForecastTaskInput[];
  byAssignee: Map<string, DurationProfile>;
  global: DurationProfile;
}): number {
  const open = opts.tasks.filter((t) => t.status !== 'done');
  if (open.length === 0) return 0;

  // Slowest fast-task per phase, phases summed in order.
  const phaseMax = new Map<number, number>();
  for (const t of open) {
    const profile = (t.assigneeId && opts.byAssignee.get(String(t.assigneeId))) || opts.global;
    const factor = STATUS_REMAINING[t.status] ?? 1.0;
    const fast = Math.max(0.5, Math.exp(profile.muLog + SOL_Z * profile.sigmaLog) * factor);
    const idx = t.phaseIndex || 0;
    if (fast > (phaseMax.get(idx) ?? 0)) phaseMax.set(idx, fast);
  }
  let total = 0;
  for (const v of phaseMax.values()) total += v;
  return total;
}

function pickTop(m: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of m) if (!best || count > best.count) best = { key, count };
  return best;
}
function pickTopNum(m: Map<number, number>): { key: number; count: number } | null {
  let best: { key: number; count: number } | null = null;
  for (const [key, count] of m) if (!best || count > best.count) best = { key, count };
  return best;
}
function addDays(d: Date, days: number): Date {
  return new Date(+d + days * DAY);
}

/* ── Cycle-time extraction helper ───────────────────────────────────────────
   Turn raw completed-task rows into per-assignee day samples. Mirrors
   slip-risk's definition (creation → completion, calendar days), clamped to a
   sane window so a mis-dated record can't poison a profile. */
export function cycleSamplesByAssignee(
  rows: { assigneeId?: unknown; createdAt?: Date | string | null; completedAt?: Date | string | null }[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.assigneeId) continue;
    const c = r.createdAt ? new Date(r.createdAt) : null;
    const f = r.completedAt ? new Date(r.completedAt) : null;
    if (!c || !f || isNaN(+c) || isNaN(+f)) continue;
    const d = (+f - +c) / DAY;
    if (d < 0.2 || d > 180) continue;
    const id = String(r.assigneeId);
    const arr = out.get(id) || [];
    arr.push(d);
    out.set(id, arr);
  }
  return out;
}
