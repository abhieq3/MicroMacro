/**
 * Delivery Foresight — a personal, predictive early-warning engine.
 *
 * The real question this answers for every member, every day: "given how I
 * actually deliver, am I going to hit my dates — and what's the one move that
 * keeps me on track?" Trackers show you what's already late; by then the
 * conversation is an apology. Foresight speaks in the window *before* that,
 * while a date can still be saved.
 *
 * Design philosophy (matches slip-risk and the project forecast): the
 * machinery is deliberately heavy; the surfaced output is one quiet line and a
 * single status. Everything here is DETERMINISTIC and traceable to the
 * historical rows that fed it (a fixed RNG seed makes every Monte-Carlo run
 * byte-reproducible) — a hard requirement in a GxP context, and the reason
 * there is no LLM anywhere on this path (see the README invariant).
 *
 * The engine is six models stacked into one verdict:
 *
 *   1. Duration model    — a LOG-NORMAL fit of the person's creation→completion
 *                          cycle times, stabilised with empirical-Bayes
 *                          shrinkage toward a workspace prior ("two data points
 *                          can't define you"). Gives a typical turnaround.
 *   2. Throughput model  — the person's inter-completion gap distribution
 *                          (days between finishing one thing and the next),
 *                          also log-normal + shrunk. This — not summed cycle
 *                          times — is the honest basis for "when does my plate
 *                          clear", because a gap already embeds real life:
 *                          parallel work, meetings, waiting.
 *   3. Velocity model    — Holt's linear exponential smoothing over weekly
 *                          throughput → a *forecast* of next week's output and
 *                          a rising/steady/cooling trend (not a flat average).
 *   4. Cadence model     — day-of-week / time-of-day completion propensity →
 *                          "ships strongest Tuesday afternoons", which also
 *                          tells the digest the best day to front-load.
 *   5. Schedule sim      — a seeded Monte-Carlo that bootstraps the gap model
 *                          to project the finish day of each open task in
 *                          priority order → a plate-clear date distribution
 *                          (P50/P80) and a per-task slip probability.
 *   6. Anomaly detector  — a robust MAD control chart over weekly output plus a
 *                          stall test (idle longer than the personal norm) →
 *                          catches a velocity collapse before the heatmap does.
 *
 * Pure functions carry no I/O; `buildForesight` (bottom) is the single DB
 * orchestration entry point, mirroring lib/digest.ts. Unit-tested in
 * tests/unit/delivery-foresight.test.ts.
 */

const DAY = 86_400_000;

/* ════════════════════════════════════════════════════════════════════════
   Small, dependency-free numerics
   ════════════════════════════════════════════════════════════════════════ */

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(+d) ? null : d;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation — a robust (outlier-resistant) spread measure.
 *  Scaled by 1.4826 so it estimates the same quantity as σ for normal data. */
function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const med = median(xs);
  const dev = xs.map((x) => Math.abs(x - med));
  return 1.4826 * median(dev);
}

/** Linear-interpolated percentile of a pre-sorted array. */
function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function addDays(d: Date, days: number): Date {
  return new Date(+d + days * DAY);
}

/* Seeded RNG (mulberry32) + standard normal (Box–Muller). A fixed seed makes
   the whole forecast reproducible — the same inputs always return the same
   numbers, which is what makes it auditable rather than a slot machine. */
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

/* ════════════════════════════════════════════════════════════════════════
   1 + 2. Log-normal models (cycle time and inter-completion gap)
   ════════════════════════════════════════════════════════════════════════ */

export interface LogNormalModel {
  /** Number of samples behind the fit. */
  n: number;
  /** Mean of ln(value). */
  muLog: number;
  /** Std-dev of ln(value). */
  sigmaLog: number;
  /** exp(muLog) — the geometric mean / typical value in natural units. */
  median: number;
}

export interface LogNormalPrior {
  muLog: number;
  sigmaLog: number;
}

// An assignee needs ~K samples before their own history outweighs the
// workspace prior. Small enough to personalise quickly, large enough that one
// fluke can't. Mirrors the shrinkage instinct in lib/ai/projectForecast.ts.
const SHRINK_K = 5;
// Floor on log-σ so a sparse history still carries real uncertainty (σ→0 would
// fake a precise point estimate).
const SIGMA_FLOOR = 0.35;

/** Fit a log-normal to positive samples, shrunk toward a prior by the
 *  empirical-Bayes weight n/(n+K). Right-skewed quantities (durations, gaps)
 *  are log-normal, not normal — fitting in log space is the correct move. */
export function fitLogNormal(samples: number[], prior: LogNormalPrior): LogNormalModel {
  const clean = samples.filter((x) => Number.isFinite(x) && x > 0);
  if (clean.length === 0) {
    return {
      n: 0,
      muLog: prior.muLog,
      sigmaLog: Math.max(SIGMA_FLOOR, prior.sigmaLog),
      median: Math.exp(prior.muLog),
    };
  }
  const logs = clean.map((x) => Math.log(Math.max(0.25, x)));
  const mu = mean(logs);
  const variance =
    logs.length > 1 ? logs.reduce((a, b) => a + (b - mu) ** 2, 0) / (logs.length - 1) : prior.sigmaLog ** 2;
  const sigma = Math.sqrt(variance);
  const w = clean.length / (clean.length + SHRINK_K);
  const muLog = w * mu + (1 - w) * prior.muLog;
  const sigmaLog = Math.max(SIGMA_FLOOR, w * sigma + (1 - w) * prior.sigmaLog);
  return { n: clean.length, muLog, sigmaLog, median: Math.exp(muLog) };
}

/** Creation→completion cycle times (calendar days) from completed rows.
 *  Clamped to a sane window so a mis-dated record can't poison the fit. */
export function cycleSamples(
  rows: { createdAt?: Date | string | null; completedAt?: Date | string | null }[],
): number[] {
  const out: number[] = [];
  for (const r of rows) {
    const c = toDate(r.createdAt);
    const f = toDate(r.completedAt);
    if (!c || !f) continue;
    const d = (+f - +c) / DAY;
    if (d >= 0.1 && d <= 180) out.push(d);
  }
  return out;
}

/** Inter-completion gaps (calendar days between consecutive completions),
 *  chronological. Drops zero/negative gaps and absurd idle stretches so a long
 *  holiday doesn't masquerade as the person's working rhythm. */
export function gapSamples(completedAts: (Date | string | null | undefined)[]): number[] {
  const times = completedAts
    .map(toDate)
    .filter((d): d is Date => !!d)
    .map((d) => +d)
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = (times[i] - times[i - 1]) / DAY;
    if (g > 0.02 && g <= 45) out.push(g);
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
   3. Velocity — Holt's linear exponential smoothing over weekly throughput
   ════════════════════════════════════════════════════════════════════════ */

export interface VelocityModel {
  /** Weekly completion counts, oldest→newest (most recent ~12 weeks). */
  weeks: number[];
  /** Smoothed current output level (tasks/week). */
  level: number;
  /** Smoothed slope (Δ tasks/week per week). */
  trend: number;
  /** One-step-ahead forecast of next week's output, clamped ≥ 0. */
  forecastNext: number;
  direction: 'rising' | 'steady' | 'cooling';
  /** Plain mean weekly output over the window (the naive baseline). */
  perWeekMean: number;
}

// Holt smoothing constants. α weights recent level, β recent trend; both kept
// modest so a single quiet week doesn't whipsaw the forecast.
const HOLT_ALPHA = 0.5;
const HOLT_BETA = 0.3;

/** Bucket completion timestamps into trailing weekly counts ending at `now`.
 *  `weeks` is oldest→newest; index `weeks-1` is the current (partial) week. */
export function weeklyThroughput(
  completedAts: (Date | string | null | undefined)[],
  weeks: number,
  now: Date,
): number[] {
  const counts = new Array(weeks).fill(0);
  const end = +now;
  for (const v of completedAts) {
    const d = toDate(v);
    if (!d) continue;
    const ageWeeks = Math.floor((end - +d) / (7 * DAY));
    if (ageWeeks < 0 || ageWeeks >= weeks) continue;
    counts[weeks - 1 - ageWeeks] += 1;
  }
  return counts;
}

/** Fit Holt's linear method to a weekly-count series. Falls back to the mean
 *  (zero trend) when there isn't enough history to estimate a slope. */
export function fitVelocity(weeks: number[]): VelocityModel {
  const perWeekMean = mean(weeks);
  if (weeks.length < 3) {
    return {
      weeks,
      level: perWeekMean,
      trend: 0,
      forecastNext: Math.max(0, perWeekMean),
      direction: 'steady',
      perWeekMean,
    };
  }
  let level = weeks[0];
  let trend = weeks[1] - weeks[0];
  for (let t = 1; t < weeks.length; t++) {
    const prevLevel = level;
    level = HOLT_ALPHA * weeks[t] + (1 - HOLT_ALPHA) * (level + trend);
    trend = HOLT_BETA * (level - prevLevel) + (1 - HOLT_BETA) * trend;
  }
  const forecastNext = Math.max(0, level + trend);
  // Call a trend only when the smoothed slope clears a small floor plus a mild
  // fraction of the level, so ordinary week-to-week noise around a steady
  // output doesn't read as a direction, while a real ramp (e.g. 1→6 over the
  // window, slope ≈ 0.5/wk) still registers.
  const threshold = Math.max(0.35, 0.06 * Math.max(level, 1));
  const direction = trend > threshold ? 'rising' : trend < -threshold ? 'cooling' : 'steady';
  return { weeks, level: Math.max(0, level), trend, forecastNext, direction, perWeekMean };
}

/* ════════════════════════════════════════════════════════════════════════
   4. Cadence — when (day / time) this person actually ships
   ════════════════════════════════════════════════════════════════════════ */

export interface CadenceModel {
  /** Completion counts by local day-of-week, index 0 = Sunday … 6 = Saturday. */
  byDow: number[];
  byPeriod: { morning: number; afternoon: number; evening: number };
  peakDow: number | null;
  peakDowShare: number;
  peakPeriod: 'morning' | 'afternoon' | 'evening' | null;
  samples: number;
}

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function fitCadence(completedAts: (Date | string | null | undefined)[]): CadenceModel {
  const byDow = new Array(7).fill(0);
  const byPeriod = { morning: 0, afternoon: 0, evening: 0 };
  let samples = 0;
  for (const v of completedAts) {
    const d = toDate(v);
    if (!d) continue;
    samples += 1;
    byDow[d.getDay()] += 1;
    const h = d.getHours();
    if (h < 12) byPeriod.morning += 1;
    else if (h < 17) byPeriod.afternoon += 1;
    else byPeriod.evening += 1;
  }
  let peakDow: number | null = null;
  let peakCount = 0;
  for (let i = 0; i < 7; i++) {
    if (byDow[i] > peakCount) {
      peakCount = byDow[i];
      peakDow = i;
    }
  }
  const peakPeriod =
    samples === 0
      ? null
      : (Object.entries(byPeriod).sort((a, b) => b[1] - a[1])[0][0] as 'morning' | 'afternoon' | 'evening');
  return {
    byDow,
    byPeriod,
    peakDow,
    peakDowShare: samples ? peakCount / samples : 0,
    peakPeriod,
    samples,
  };
}

export function dowName(i: number | null): string | null {
  return i === null || i < 0 || i > 6 ? null : DOW_NAMES[i];
}

/* ════════════════════════════════════════════════════════════════════════
   5. Monte-Carlo personal schedule simulation
   ════════════════════════════════════════════════════════════════════════ */

export interface OpenTaskInput {
  id: string;
  title?: string;
  status: string; // todo | in_progress | review | blocked
  priority?: string | null;
  dueDate?: Date | string | null;
  ccTcd?: Date | string | null;
}

export interface TaskRisk {
  id: string;
  title: string;
  /** P(finish after the effective due date) across trials, 0..1. */
  slipProb: number;
  /** Calendar days from now to this task's P80 finish. */
  finishP80Days: number;
  /** Whole days until due (negative = already overdue). */
  daysToDue: number | null;
}

export interface ScheduleForecast {
  openTasks: number;
  /** Calendar days from `now` until the whole plate is cleared. */
  clearP50Days: number;
  clearP80Days: number;
  clearP50: string;
  clearP80: string;
  perTask: TaskRisk[];
  /** Open, dated, not-yet-overdue tasks more likely than not to slip. */
  tasksAtRisk: number;
  trials: number;
}

// A task already under way has less of its cycle left; the gap model paces the
// *queue*, this scales an individual task's contribution to its own finish.
const STATUS_REMAINING: Record<string, number> = {
  todo: 1.0,
  in_progress: 0.55,
  review: 0.25,
  blocked: 1.2,
};
const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function effectiveDue(t: OpenTaskInput): Date | null {
  return toDate(t.ccTcd) || toDate(t.dueDate);
}

/**
 * Simulate the person clearing their open plate, one task at a time, in
 * priority order. Each trial advances a day-cursor by a bootstrapped
 * inter-completion gap per task (scaled by how far along the task already is),
 * recording each task's finish day and the final plate-clear day. Over many
 * trials this yields a finish-day distribution per task (→ slip probability)
 * and for the plate as a whole (→ P50/P80 clear date). Deterministic for a
 * fixed seed.
 */
export function simulatePersonalSchedule(opts: {
  open: OpenTaskInput[];
  gapModel: LogNormalModel;
  now?: Date;
  trials?: number;
  seed?: number;
}): ScheduleForecast {
  const now = opts.now ?? new Date();
  const trials = opts.trials ?? 2000;
  const rng = mulberry32(opts.seed ?? 0x5eed1234);

  // Schedule higher priority first; within a priority, the nearest due date.
  const queue = opts.open
    .filter((t) => t.status !== 'done')
    .map((t) => {
      const due = effectiveDue(t);
      return {
        id: t.id,
        title: t.title || 'Task',
        factor: STATUS_REMAINING[t.status] ?? 1.0,
        prank: PRIORITY_RANK[t.priority || 'medium'] ?? 2,
        due,
        daysToDue: due ? Math.ceil((+due - +now) / DAY) : null,
      };
    })
    .sort((a, b) => a.prank - b.prank || (a.due ? +a.due : Infinity) - (b.due ? +b.due : Infinity));

  if (queue.length === 0) {
    const iso = now.toISOString();
    return {
      openTasks: 0,
      clearP50Days: 0,
      clearP80Days: 0,
      clearP50: iso,
      clearP80: iso,
      perTask: [],
      tasksAtRisk: 0,
      trials: 0,
    };
  }

  const finishesByTask: number[][] = queue.map(() => []);
  const clearDays: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    let cursor = 0; // days from now
    for (let i = 0; i < queue.length; i++) {
      // Draw this task's pacing from the fitted inter-completion gap model,
      // scaled by how far along the task already is (its remaining fraction).
      const draw = Math.exp(opts.gapModel.muLog + opts.gapModel.sigmaLog * gaussian(rng));
      cursor += Math.max(0.1, draw * queue[i].factor);
      finishesByTask[i].push(cursor);
    }
    clearDays.push(cursor);
  }

  const sortedClear = [...clearDays].sort((a, b) => a - b);
  const clearP50Days = percentileSorted(sortedClear, 50);
  const clearP80Days = percentileSorted(sortedClear, 80);

  let tasksAtRisk = 0;
  const perTask: TaskRisk[] = queue.map((q, i) => {
    const fin = finishesByTask[i];
    const sorted = [...fin].sort((a, b) => a - b);
    const finishP80Days = percentileSorted(sorted, 80);
    let slipProb = 0;
    if (q.daysToDue !== null) {
      let slips = 0;
      for (const f of fin) if (f > q.daysToDue) slips++;
      slipProb = slips / fin.length;
      // Only count forecastable slips: dated, still in the future, more likely
      // than not to miss. An already-overdue task is a fact, not a forecast.
      if (q.daysToDue >= 0 && slipProb >= 0.5) tasksAtRisk++;
    }
    return {
      id: q.id,
      title: q.title,
      slipProb: Math.round(slipProb * 100) / 100,
      finishP80Days: Math.round(finishP80Days * 10) / 10,
      daysToDue: q.daysToDue,
    };
  });

  return {
    openTasks: queue.length,
    clearP50Days,
    clearP80Days,
    clearP50: addDays(now, clearP50Days).toISOString(),
    clearP80: addDays(now, clearP80Days).toISOString(),
    perTask,
    tasksAtRisk,
    trials,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   6. Anomaly detection — robust control chart + stall test
   ════════════════════════════════════════════════════════════════════════ */

export type AnomalyState = 'normal' | 'cooling' | 'surge' | 'stalled' | 'insufficient';

export interface AnomalySignal {
  state: AnomalyState;
  weeklyMedian: number;
  weeklyMad: number;
  currentWeek: number;
  daysSinceLastCompletion: number | null;
  typicalGapDays: number;
}

// Control-chart half-width in MADs. ~2σ-equivalent: a week beyond this is a
// genuine departure from the personal baseline, not ordinary variation.
const CONTROL_K = 2;
// A stall is being idle for materially longer than the personal norm.
const STALL_MULTIPLE = 3;
const STALL_FLOOR_DAYS = 4;

export function detectAnomaly(opts: {
  weeks: number[];
  gapMedianDays: number;
  daysSinceLastCompletion: number | null;
}): AnomalySignal {
  const { weeks, gapMedianDays, daysSinceLastCompletion } = opts;
  // Baseline excludes the current (partial) week so it isn't compared to itself.
  const baseline = weeks.slice(0, -1);
  const current = weeks[weeks.length - 1] ?? 0;
  const med = median(baseline);
  const spread = mad(baseline);

  let state: AnomalyState = 'normal';
  if (baseline.length < 4) {
    state = 'insufficient';
  } else if (
    daysSinceLastCompletion !== null &&
    gapMedianDays > 0 &&
    daysSinceLastCompletion > Math.max(STALL_FLOOR_DAYS, STALL_MULTIPLE * gapMedianDays)
  ) {
    state = 'stalled';
  } else if (spread > 0 && current < med - CONTROL_K * spread) {
    state = 'cooling';
  } else if (spread > 0 && current > med + CONTROL_K * spread) {
    state = 'surge';
  }

  return {
    state,
    weeklyMedian: med,
    weeklyMad: spread,
    currentWeek: current,
    daysSinceLastCompletion,
    typicalGapDays: gapMedianDays,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   Reliability index — a calibrated 0..100 trust read
   ════════════════════════════════════════════════════════════════════════ */

/**
 * A single, explainable reliability number. Driven mostly by the on-time rate,
 * with a consistency bonus (a low coefficient of variation in cycle time means
 * "predictable", which is itself a form of reliability), and shrunk toward a
 * neutral 50 when the sample is thin so a two-task history can't read as a
 * perfect (or terrible) record.
 */
export function reliabilityIndex(opts: { onTimeRate: number; cycleCv: number; samples: number }): number {
  const onTime = clamp(opts.onTimeRate, 0, 1);
  const consistency = 1 - clamp(opts.cycleCv, 0, 1); // 1 = perfectly consistent
  const raw = 100 * (0.78 * onTime + 0.22 * consistency);
  const confidence = opts.samples / (opts.samples + 8); // 0..1, →1 with history
  return Math.round(50 + (raw - 50) * confidence);
}

export function reliabilityLabel(score: number): string {
  if (score >= 85) return 'Rock-solid';
  if (score >= 70) return 'Dependable';
  if (score >= 55) return 'Steady';
  if (score >= 40) return 'Variable';
  return 'Finding rhythm';
}

/** Rhythm-only headline for a COLLEAGUE'S profile — says nothing about the
 *  person's current (possibly private) workload, only their public delivery
 *  character, so it leaks no more than the contribution heatmap already does. */
export function composePublicHeadline(
  f: Pick<
    Foresight,
    'hasSignal' | 'trend' | 'onTimeRate' | 'typicalTurnaroundDays' | 'reliabilityLabel' | 'peakDay'
  >,
): string {
  if (!f.hasSignal) return 'Delivery rhythm is still forming — not enough finished work yet to read.';
  const turn = f.typicalTurnaroundDays
    ? `turns work around in about ${f.typicalTurnaroundDays} day${f.typicalTurnaroundDays === 1 ? '' : 's'}`
    : 'delivers steadily';
  const trend =
    f.trend === 'rising' ? ', and accelerating' : f.trend === 'cooling' ? ', easing off lately' : '';
  const peak = f.peakDay ? ` Strongest on ${f.peakDay}s.` : '';
  return `${f.reliabilityLabel} — ${turn}${trend}.${peak}`;
}

/* ════════════════════════════════════════════════════════════════════════
   The verdict — compose the minimal surface from the heavy internals
   ════════════════════════════════════════════════════════════════════════ */

export type ForesightStatus =
  | 'building' // not enough history to forecast
  | 'on_track'
  | 'at_risk'
  | 'overloaded'
  | 'cooling'
  | 'clear'; // open plate is empty

export interface Foresight {
  /** True once there's enough delivered history to say anything credible. */
  hasSignal: boolean;
  confidence: 'low' | 'medium' | 'high';
  status: ForesightStatus;
  /** One deterministic sentence — the whole point, readable at a glance. */
  headline: string;
  reliability: number; // 0..100
  reliabilityLabel: string;
  onTimeRate: number; // 0..100
  typicalTurnaroundDays: number | null;
  throughputPerWeek: number;
  trend: 'rising' | 'steady' | 'cooling';
  peakDay: string | null;
  peakPeriod: string | null;
  openTasks: number;
  tasksAtRisk: number;
  clearDateP50: string | null;
  clearDateP80: string | null;
  clearDays: number | null; // P80 calendar days
  topRisk: { id: string; title: string; slipProb: number; daysToDue: number | null } | null;
  /** Weekly throughput history for a tiny sparkline (oldest→newest). */
  spark: number[];
  anomaly: AnomalyState;
  /** Pre-rendered one-liner for the email digest (or null when no signal). */
  digestLine: string | null;
  samples: number;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface ForesightInputs {
  completed: {
    createdAt?: Date | string | null;
    completedAt?: Date | string | null;
    dueDate?: Date | string | null;
    ccTcd?: Date | string | null;
  }[];
  open: OpenTaskInput[];
  prior: LogNormalPrior;
  gapPrior: LogNormalPrior;
  now?: Date;
  /** Lower for the digest batch (speed), higher for a single profile view. */
  trials?: number;
  /** Stable per-user seed so a profile and its digest agree. */
  seed?: number;
}

// Below this many completed samples we don't pretend to forecast — we say so.
const MIN_SIGNAL_SAMPLES = 4;

/** The pure brain: take a person's history + open plate and produce the single
 *  Foresight verdict. No I/O — `buildForesight` feeds it the rows. */
export function computeForesight(input: ForesightInputs): Foresight {
  const now = input.now ?? new Date();
  const completedAts = input.completed.map((t) => t.completedAt);

  const cyc = cycleSamples(input.completed);
  const gaps = gapSamples(completedAts);
  const durationModel = fitLogNormal(cyc, input.prior);
  const gapModel = fitLogNormal(gaps, input.gapPrior);

  // On-time rate + cycle CV from dated completions.
  let dated = 0;
  let onTime = 0;
  for (const t of input.completed) {
    const due = toDate(t.ccTcd) || toDate(t.dueDate);
    const fin = toDate(t.completedAt);
    if (!due || !fin) continue;
    dated += 1;
    if (+fin <= +due + DAY / 2) onTime += 1;
  }
  const onTimeRate = dated ? onTime / dated : 0;
  const cycleCv = cyc.length >= 2 && mean(cyc) > 0 ? Math.sqrt(variancePop(cyc)) / mean(cyc) : 0.5;
  const reliability = reliabilityIndex({ onTimeRate, cycleCv, samples: cyc.length });

  // Velocity (12 trailing weeks) + cadence.
  const weeks = weeklyThroughput(completedAts, 12, now);
  const velocity = fitVelocity(weeks);
  const cadence = fitCadence(completedAts);

  // Stall input: days since the most recent completion.
  let lastCompletion: number | null = null;
  for (const v of completedAts) {
    const d = toDate(v);
    if (d && (lastCompletion === null || +d > lastCompletion)) lastCompletion = +d;
  }
  const daysSinceLast = lastCompletion === null ? null : Math.floor((+now - lastCompletion) / DAY);
  const anomaly = detectAnomaly({
    weeks,
    gapMedianDays: gaps.length ? median(gaps) : 0,
    daysSinceLastCompletion: daysSinceLast,
  });

  // Schedule simulation over the open plate.
  const schedule = simulatePersonalSchedule({
    open: input.open,
    gapModel,
    now,
    trials: input.trials ?? 2000,
    seed: input.seed ?? 0x5eed1234,
  });

  // The single biggest slip risk among dated, still-future tasks.
  const topRisk =
    schedule.perTask
      .filter((t) => t.daysToDue !== null && t.daysToDue >= 0 && t.slipProb > 0)
      .sort((a, b) => b.slipProb - a.slipProb)[0] || null;

  // Signal is gated on *how many tasks the person has finished*, not on how many
  // produced a usable cycle time. cycleSamples deliberately drops same-session /
  // bulk / seeded completions (created→done gap < ~2.4h), so a team that closes
  // work quickly would otherwise sit at "Calibrating" forever even with a long
  // delivery record. Throughput, cadence and gap models only need the
  // completion timestamps, which these completions do carry — so the forecast is
  // well-founded the moment there are enough finishes. Cycle samples still drive
  // the turnaround figure and confidence below.
  const completionCount = completedAts.reduce((n, v) => (toDate(v) ? n + 1 : n), 0);
  const samples = cyc.length;
  const hasSignal = completionCount >= MIN_SIGNAL_SAMPLES;
  const confidence: Foresight['confidence'] =
    completionCount >= 20 ? 'high' : completionCount >= 8 ? 'medium' : 'low';

  // ── Status precedence: the most actionable truth wins ──────────────────
  let status: ForesightStatus;
  if (!hasSignal) status = 'building';
  else if (schedule.openTasks === 0) status = 'clear';
  else if (schedule.tasksAtRisk > 0) status = 'at_risk';
  else if (anomaly.state === 'stalled' || anomaly.state === 'cooling') status = 'cooling';
  // "Overloaded": plate won't clear inside two working weeks at the current pace.
  else if (schedule.clearP80Days > 18) status = 'overloaded';
  else status = 'on_track';

  const headline = composeHeadline({ status, schedule, velocity, cadence, anomaly, topRisk, reliability });
  const digestLine = hasSignal
    ? composeDigestLine({ status, schedule, velocity, cadence, topRisk, now })
    : null;

  return {
    hasSignal,
    confidence,
    status,
    headline,
    reliability,
    reliabilityLabel: reliabilityLabel(reliability),
    onTimeRate: Math.round(onTimeRate * 100),
    typicalTurnaroundDays: cyc.length ? Math.round(durationModel.median * 10) / 10 : null,
    throughputPerWeek: Math.round(velocity.forecastNext * 10) / 10,
    trend: velocity.direction,
    peakDay: cadence.peakDowShare >= 0.22 ? dowName(cadence.peakDow) : null,
    peakPeriod: cadence.samples >= MIN_SIGNAL_SAMPLES ? cadence.peakPeriod : null,
    openTasks: schedule.openTasks,
    tasksAtRisk: schedule.tasksAtRisk,
    clearDateP50: schedule.openTasks ? schedule.clearP50 : null,
    clearDateP80: schedule.openTasks ? schedule.clearP80 : null,
    clearDays: schedule.openTasks ? Math.round(schedule.clearP80Days) : null,
    topRisk: topRisk
      ? { id: topRisk.id, title: topRisk.title, slipProb: topRisk.slipProb, daysToDue: topRisk.daysToDue }
      : null,
    spark: weeks,
    anomaly: anomaly.state,
    digestLine,
    samples,
  };
}

function variancePop(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
}

function composeHeadline(c: {
  status: ForesightStatus;
  schedule: ScheduleForecast;
  velocity: VelocityModel;
  cadence: CadenceModel;
  anomaly: AnomalySignal;
  topRisk: TaskRisk | null;
  reliability: number;
}): string {
  const clearLabel = fmtDate(addDays(new Date(), c.schedule.clearP80Days).toISOString());
  switch (c.status) {
    case 'building':
      return 'Still learning your delivery rhythm — a few more finished tasks and the forecast turns on.';
    case 'clear':
      return 'Plate clear — nothing open. A clean line to choose your next move from.';
    case 'at_risk': {
      const n = c.schedule.tasksAtRisk;
      return `${n} task${n === 1 ? '' : 's'} likely to slip at your current pace — clear the riskiest first and the date holds.`;
    }
    case 'cooling':
      return c.anomaly.state === 'stalled'
        ? 'Output has paused — longer since your last close than your norm. Worth a restart.'
        : 'Your pace has cooled below its usual band — ease one thing back into motion.';
    case 'overloaded':
      return `Your open plate runs past ${clearLabel} at your current pace — this is more than a fortnight of work queued.`;
    case 'on_track':
    default:
      return `On track — at your pace the plate clears around ${clearLabel}.`;
  }
}

function composeDigestLine(c: {
  status: ForesightStatus;
  schedule: ScheduleForecast;
  velocity: VelocityModel;
  cadence: CadenceModel;
  topRisk: TaskRisk | null;
  now: Date;
}): string {
  const clearLabel = fmtDate(addDays(c.now, c.schedule.clearP80Days).toISOString());
  const peak = c.cadence.peakDowShare >= 0.24 ? dowName(c.cadence.peakDow) : null;
  if (c.status === 'at_risk' && c.topRisk) {
    return `Foresight: “${c.topRisk.title}” is trending to miss its date (${Math.round(c.topRisk.slipProb * 100)}% at your pace). Start it today and the slip reverses.`;
  }
  if (c.status === 'overloaded') {
    return `Foresight: your open plate runs to ~${clearLabel} at your current pace${peak ? ` — front-load ${peak}, your strongest day` : ''}.`;
  }
  if (c.status === 'cooling') {
    return 'Foresight: your pace has dipped below its usual band this week — one finished thing early resets it.';
  }
  if (c.status === 'clear') {
    return 'Foresight: nothing queued — a clean day to pull your highest-leverage work forward.';
  }
  return `Foresight: on pace to clear your plate by ~${clearLabel}${peak ? `; ${peak} is your strongest ship-day` : ''}.`;
}

/* ════════════════════════════════════════════════════════════════════════
   DB orchestration — the single impure entry points
   ════════════════════════════════════════════════════════════════════════ */

// A weak, sensible default prior used until the workspace prior is computed
// (or when the workspace itself has almost no history). ~4-day cycle, ~3-day
// gap — typical for active task work.
const DEFAULT_CYCLE_PRIOR: LogNormalPrior = { muLog: Math.log(4), sigmaLog: 0.7 };
const DEFAULT_GAP_PRIOR: LogNormalPrior = { muLog: Math.log(3), sigmaLog: 0.7 };

const HISTORY_DAYS = 180;
const PRIOR_TTL_SECONDS = 600;

interface WorkspacePrior {
  cycle: LogNormalPrior;
  gap: LogNormalPrior;
}

/**
 * The workspace-wide cycle/gap prior used for empirical-Bayes shrinkage.
 * Computed from a capped sample of recent completed tasks, grouped by assignee
 * (gaps are per-person), and cached for ten minutes so it costs one query
 * shared across every profile view and the whole digest batch.
 */
export async function getWorkspacePrior(now: Date = new Date()): Promise<WorkspacePrior> {
  const { cached } = await import('@/lib/cache');
  return cached<WorkspacePrior>('foresight:prior:v1', PRIOR_TTL_SECONDS, async () => {
    const { connectDB } = await import('@/lib/db');
    const { Task } = await import('@/models/Task');
    await connectDB();
    const since = new Date(+now - 90 * DAY);
    const rows = await Task.find({ status: 'done', completedAt: { $gte: since } })
      .select('assigneeId createdAt completedAt')
      .limit(8000)
      .lean();

    const cyc = cycleSamples(rows as any[]);
    const byAssignee = new Map<string, (Date | string)[]>();
    for (const r of rows as any[]) {
      if (!r.assigneeId || !r.completedAt) continue;
      const k = String(r.assigneeId);
      (byAssignee.get(k) || byAssignee.set(k, []).get(k)!).push(r.completedAt);
    }
    const allGaps: number[] = [];
    for (const list of byAssignee.values()) allGaps.push(...gapSamples(list));

    const cycleFit = cyc.length >= 8 ? fitLogNormal(cyc, DEFAULT_CYCLE_PRIOR) : null;
    const gapFit = allGaps.length >= 8 ? fitLogNormal(allGaps, DEFAULT_GAP_PRIOR) : null;
    return {
      cycle: cycleFit ? { muLog: cycleFit.muLog, sigmaLog: cycleFit.sigmaLog } : DEFAULT_CYCLE_PRIOR,
      gap: gapFit ? { muLog: gapFit.muLog, sigmaLog: gapFit.sigmaLog } : DEFAULT_GAP_PRIOR,
    };
  });
}

/** Stable 31-bit seed from a user id, so a user's profile and digest forecasts
 *  are byte-identical (auditability) rather than drifting per request. */
export function seedFromId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Build one person's Foresight from the database. Two small queries (their
 * completed history + their open plate) plus the shared cached prior.
 *
 * `includePlate` gates the forward-looking schedule simulation. It is true for
 * a member viewing their OWN foresight (full forecast) and false for a
 * colleague's view, where the open plate — which can contain private overlays
 * and personal-project task titles — must never be read or returned. A
 * colleague sees only the rhythm/reliability character, exactly the scope the
 * public contribution heatmap already exposes.
 */
export async function buildForesight(
  userId: string,
  opts: { now?: Date; trials?: number; includePlate?: boolean } = {},
): Promise<Foresight> {
  const { connectDB } = await import('@/lib/db');
  const { Task } = await import('@/models/Task');
  const mongoose = (await import('mongoose')).default;
  await connectDB();

  const now = opts.now ?? new Date();
  const includePlate = opts.includePlate !== false;
  const since = new Date(+now - HISTORY_DAYS * DAY);
  const uid = new mongoose.Types.ObjectId(userId);

  const [completed, open, prior] = await Promise.all([
    Task.find({ assigneeId: uid, status: 'done', completedAt: { $gte: since } })
      .select('createdAt completedAt dueDate ccTcd')
      .limit(4000)
      .lean(),
    includePlate
      ? Task.find({ assigneeId: uid, status: { $ne: 'done' } })
          .select('_id title status priority dueDate ccTcd')
          .limit(400)
          .lean()
      : Promise.resolve([]),
    getWorkspacePrior(now),
  ]);

  return computeForesight({
    completed: completed as any[],
    open: (open as any[]).map((t) => ({
      id: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      ccTcd: t.ccTcd,
    })),
    prior: prior.cycle,
    gapPrior: prior.gap,
    now,
    trials: opts.trials ?? 2000,
    seed: seedFromId(userId),
  });
}

/* ════════════════════════════════════════════════════════════════════════
   Team roll-up — many members' foresight in one batched pass
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Foresight for a set of members in two batched queries (their combined
 * completed history + open plates) plus the shared prior — used by the team
 * detail page's capacity panel.
 *
 * `excludePersonal` (true for any shared/lead context) keeps each member's
 * private overlays and personal-project tasks out of the roll-up, so a lead
 * sees a member's SHARED-work outlook only — never their private to-do list.
 */
export async function buildForesightBatch(
  userIds: string[],
  opts: { now?: Date; trials?: number; excludePersonal?: boolean } = {},
): Promise<Map<string, Foresight>> {
  const out = new Map<string, Foresight>();
  if (userIds.length === 0) return out;

  const { connectDB } = await import('@/lib/db');
  const { Task } = await import('@/models/Task');
  const mongoose = (await import('mongoose')).default;
  await connectDB();

  const now = opts.now ?? new Date();
  const since = new Date(+now - HISTORY_DAYS * DAY);
  const ids = userIds.map((id) => new mongoose.Types.ObjectId(id));

  // Personal projects owned by these members — excluded from the shared roll-up.
  let personalProjectIds: Set<string> | null = null;
  if (opts.excludePersonal) {
    const { Project } = await import('@/models/Project');
    const personal = await Project.find({
      ownerId: { $in: ids },
      $or: [{ isPersonal: true }, { personal: true }, { code: /^PRSN-/ }],
    })
      .select('_id')
      .limit(5000)
      .lean();
    personalProjectIds = new Set((personal as any[]).map((p) => String(p._id)));
  }

  const openFilter: Record<string, unknown> = { assigneeId: { $in: ids }, status: { $ne: 'done' } };
  if (opts.excludePersonal) openFilter.privateToUserId = null;

  const [history, open, prior] = await Promise.all([
    Task.find({ assigneeId: { $in: ids }, status: 'done', completedAt: { $gte: since } })
      .select('assigneeId createdAt completedAt dueDate ccTcd')
      .limit(20000)
      .lean(),
    Task.find(openFilter)
      .select('assigneeId _id title status priority dueDate ccTcd projectId')
      .limit(12000)
      .lean(),
    getWorkspacePrior(now),
  ]);

  const histByUser = new Map<string, any[]>();
  for (const t of history as any[]) {
    const k = String(t.assigneeId);
    (histByUser.get(k) || histByUser.set(k, []).get(k)!).push(t);
  }
  const openByUser = new Map<string, any[]>();
  for (const t of open as any[]) {
    if (personalProjectIds && t.projectId && personalProjectIds.has(String(t.projectId))) continue;
    const k = String(t.assigneeId);
    (openByUser.get(k) || openByUser.set(k, []).get(k)!).push(t);
  }

  for (const uid of userIds) {
    out.set(
      uid,
      computeForesight({
        completed: histByUser.get(uid) || [],
        open: (openByUser.get(uid) || []).map((t) => ({
          id: String(t._id),
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          ccTcd: t.ccTcd,
        })),
        prior: prior.cycle,
        gapPrior: prior.gap,
        now,
        trials: opts.trials ?? 1500,
        seed: seedFromId(uid),
      }),
    );
  }
  return out;
}

/** One member's row in the team capacity roll-up. Deliberately carries NO task
 *  titles — only aggregate status — so a shared view never leaks work detail. */
export interface TeamMemberForesight {
  id: string;
  name: string;
  role?: string;
  hasSignal: boolean;
  status: ForesightStatus;
  reliability: number;
  reliabilityLabel: string;
  trend: 'rising' | 'steady' | 'cooling';
  throughputPerWeek: number;
  openTasks: number;
  tasksAtRisk: number;
  clearDateP80: string | null;
  clearDays: number | null;
}

export interface TeamForesightSummary {
  members: TeamMemberForesight[];
  headline: string;
  counts: {
    onTrack: number;
    atRisk: number;
    overloaded: number;
    cooling: number;
    clear: number;
    building: number;
  };
  totalAtRisk: number;
  /** Members carrying slip risk or overload, worst first — the lead's short list. */
  watch: TeamMemberForesight[];
  teamThroughputPerWeek: number;
}

export function toTeamMemberForesight(
  id: string,
  name: string,
  role: string | undefined,
  f: Foresight,
): TeamMemberForesight {
  return {
    id,
    name,
    role,
    hasSignal: f.hasSignal,
    status: f.status,
    reliability: f.reliability,
    reliabilityLabel: f.reliabilityLabel,
    trend: f.trend,
    throughputPerWeek: f.throughputPerWeek,
    openTasks: f.openTasks,
    tasksAtRisk: f.tasksAtRisk,
    clearDateP80: f.clearDateP80,
    clearDays: f.clearDays,
  };
}

/** Roll a team's per-member foresight into one capacity verdict. Pure. */
export function summarizeTeamForesight(members: TeamMemberForesight[]): TeamForesightSummary {
  const counts = { onTrack: 0, atRisk: 0, overloaded: 0, cooling: 0, clear: 0, building: 0 };
  let totalAtRisk = 0;
  let teamThroughputPerWeek = 0;
  for (const m of members) {
    teamThroughputPerWeek += m.throughputPerWeek;
    totalAtRisk += m.tasksAtRisk;
    switch (m.status) {
      case 'on_track':
        counts.onTrack++;
        break;
      case 'at_risk':
        counts.atRisk++;
        break;
      case 'overloaded':
        counts.overloaded++;
        break;
      case 'cooling':
        counts.cooling++;
        break;
      case 'clear':
        counts.clear++;
        break;
      default:
        counts.building++;
    }
  }

  // The watch-list: anyone at risk or overloaded, worst (most at-risk, then
  // longest plate) first — the handful a lead should actually look at.
  const rank: Record<string, number> = { overloaded: 0, at_risk: 1, cooling: 2 };
  const watch = members
    .filter((m) => m.status === 'at_risk' || m.status === 'overloaded')
    .sort(
      (a, b) =>
        (rank[a.status] ?? 9) - (rank[b.status] ?? 9) ||
        b.tasksAtRisk - a.tasksAtRisk ||
        (b.clearDays ?? 0) - (a.clearDays ?? 0),
    );

  let headline: string;
  const signal = members.filter((m) => m.hasSignal).length;
  if (signal === 0) {
    headline = 'Not enough delivery history yet to read the team’s capacity.';
  } else if (watch.length === 0) {
    headline =
      counts.cooling > 0
        ? 'Team is broadly on track — a couple of people easing off their usual pace.'
        : 'Team is on track — current workload looks comfortably inside everyone’s pace.';
  } else {
    const lead = watch[0];
    const who = watch.length === 1 ? lead.name : `${lead.name} +${watch.length - 1}`;
    headline =
      totalAtRisk > 0
        ? `${totalAtRisk} task${totalAtRisk === 1 ? '' : 's'} trending to slip across the team — ${who} ${watch.length === 1 ? 'carries' : 'carry'} the tightest plate${lead.clearDays ? ` (clears ~${Math.round(lead.clearDays)}d out)` : ''}.`
        : `${who} ${watch.length === 1 ? 'is' : 'are'} running hot — worth rebalancing before dates start to move.`;
  }

  return {
    members,
    headline,
    counts,
    totalAtRisk,
    watch,
    teamThroughputPerWeek: Math.round(teamThroughputPerWeek * 10) / 10,
  };
}
