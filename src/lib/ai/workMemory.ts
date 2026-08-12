/**
 * Work memory — the self-learning model.
 *
 * Every completed task is an observation. Buckets (per person, per title
 * token, per task type, per team) accumulate those observations incrementally,
 * so current *and future* projects teach the same store. Facts shown to
 * people are counts and medians from that store — never a finish-date
 * prophecy, never pep.
 *
 * Silence contract (same family as slipRisk):
 *   - fewer than MIN_SAMPLES completions → say nothing
 *   - no measurable cycle times → say nothing
 *   - private / personal tasks never enter the store
 *
 * Pure functions, no I/O. Persistence lives in workMemoryStore.ts.
 */

export const MIN_SAMPLES = 3;
export const MAX_CYCLES = 40;
export const MAX_SEEN = 80;
export const MAX_TOKENS_PER_TASK = 8;

export type MemoryKind = 'assignee' | 'token' | 'type' | 'team' | 'meta';

export interface CycleSample {
  taskId: string;
  days: number;
}

export interface MemoryBucket {
  n: number;
  datedN: number;
  lateN: number;
  cycles: CycleSample[];
  lastAssigneeId?: string;
  lastCompletedAt?: string;
  seenTaskIds: string[];
}

export interface Observation {
  taskId: string;
  assigneeId?: string;
  tokens: string[];
  taskType?: string;
  cycleDays?: number;
  dated: boolean;
  late: boolean;
  completedAt: string;
}

export interface WorkFact {
  kind: 'you' | 'team' | 'similar';
  line: string;
  samples: number;
  medianDays: number;
  onTimeOf?: number;
  datedN?: number;
}

export interface WorkMemoryFacts {
  you?: WorkFact;
  team?: WorkFact;
  similar?: WorkFact;
  /** Ready-to-render lines, already silence-filtered. Empty = render nothing. */
  lines: string[];
}

export interface TaskLike {
  _id?: unknown;
  id?: unknown;
  title?: string;
  status?: string;
  assigneeId?: unknown;
  taskType?: string;
  createdAt?: Date | string | null;
  completedAt?: Date | string | null;
  dueDate?: Date | string | null;
  ccTcd?: Date | string | null;
  privateToUserId?: unknown;
}

const DAY = 86_400_000;

const STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'and',
  'or',
  'in',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'is',
  'are',
  'be',
  'this',
  'that',
  'task',
  'tasks',
  'new',
  'update',
  'updates',
  'review',
  'reviews',
  'fix',
  'add',
  'create',
  'check',
  'do',
  'make',
  'use',
  'per',
  'via',
  'into',
  'out',
  'up',
  'all',
  'any',
  'no',
  'not',
]);

export function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      (String(s)
        .toLowerCase()
        .match(/[a-z0-9]+/g) || []
      ).filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  );
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(+d) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((+b - +a) / DAY);
}

export function emptyBucket(): MemoryBucket {
  return { n: 0, datedN: 0, lateN: 0, cycles: [], seenTaskIds: [] };
}

/** One observation from a completed task, or null when there is nothing to learn. */
export function observationFromTask(task: TaskLike): Observation | null {
  if (task.privateToUserId) return null;
  const created = toDate(task.createdAt);
  const completed = toDate(task.completedAt);
  if (!created || !completed) return null;
  const cycle = daysBetween(created, completed);
  const due = toDate(task.ccTcd) || toDate(task.dueDate);
  const dated = !!due;
  const late = !!(dated && due && +completed > +due + DAY / 2);
  const taskId = String(task.id || task._id || '');
  if (!taskId) return null;
  return {
    taskId,
    assigneeId: task.assigneeId ? String(task.assigneeId) : undefined,
    tokens: tokenize(task.title || '').slice(0, MAX_TOKENS_PER_TASK),
    taskType: task.taskType || 'task',
    cycleDays: cycle >= 0 && cycle <= 180 ? cycle : undefined,
    dated,
    late,
    completedAt: completed.toISOString(),
  };
}

export function keysForObservation(obs: Observation): { kind: MemoryKind; subject: string }[] {
  const keys: { kind: MemoryKind; subject: string }[] = [{ kind: 'team', subject: 'all' }];
  if (obs.assigneeId) keys.push({ kind: 'assignee', subject: obs.assigneeId });
  if (obs.taskType) keys.push({ kind: 'type', subject: obs.taskType });
  for (const tok of obs.tokens) keys.push({ kind: 'token', subject: tok });
  return keys;
}

/**
 * Incremental update. direction +1 learns a completion; -1 forgets it
 * (task moved off done). Duplicate taskIds are no-ops so a seed + a live
 * write cannot double-count the same row.
 */
export function applyObservation(
  bucket: MemoryBucket,
  obs: Observation,
  direction: 1 | -1,
): MemoryBucket {
  const seen = new Set(bucket.seenTaskIds);
  if (direction === 1 && seen.has(obs.taskId)) return bucket;
  if (direction === -1 && !seen.has(obs.taskId)) return bucket;

  const next: MemoryBucket = {
    n: Math.max(0, bucket.n + direction),
    datedN: bucket.datedN,
    lateN: bucket.lateN,
    cycles: bucket.cycles.slice(),
    lastAssigneeId: bucket.lastAssigneeId,
    lastCompletedAt: bucket.lastCompletedAt,
    seenTaskIds: bucket.seenTaskIds.slice(),
  };

  if (obs.dated) {
    next.datedN = Math.max(0, next.datedN + direction);
    if (obs.late) next.lateN = Math.max(0, next.lateN + direction);
  }

  if (obs.cycleDays != null && obs.cycleDays >= 0 && obs.cycleDays <= 180) {
    if (direction === 1) {
      next.cycles.push({ taskId: obs.taskId, days: obs.cycleDays });
      if (next.cycles.length > MAX_CYCLES) next.cycles = next.cycles.slice(-MAX_CYCLES);
    } else {
      next.cycles = next.cycles.filter((c) => c.taskId !== obs.taskId);
    }
  }

  if (direction === 1) {
    next.seenTaskIds.push(obs.taskId);
    if (next.seenTaskIds.length > MAX_SEEN) next.seenTaskIds = next.seenTaskIds.slice(-MAX_SEEN);
    if (obs.assigneeId) next.lastAssigneeId = obs.assigneeId;
    next.lastCompletedAt = obs.completedAt;
  } else {
    next.seenTaskIds = next.seenTaskIds.filter((id) => id !== obs.taskId);
  }

  return next;
}

export function medianDays(cycles: CycleSample[]): number | null {
  if (!cycles.length) return null;
  const s = [...cycles.map((c) => c.days)].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  return Math.max(1, v);
}

/** Merge buckets that represent the same person/team across scopes. */
export function mergeBuckets(buckets: MemoryBucket[]): MemoryBucket {
  const out = emptyBucket();
  const seen = new Set<string>();
  const cycleSeen = new Set<string>();
  let latest = '';
  for (const b of buckets) {
    for (const id of b.seenTaskIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.seenTaskIds.push(id);
    }
    for (const c of b.cycles) {
      if (cycleSeen.has(c.taskId)) continue;
      cycleSeen.add(c.taskId);
      out.cycles.push(c);
    }
    out.n += b.n;
    out.datedN += b.datedN;
    out.lateN += b.lateN;
    if (b.lastCompletedAt && b.lastCompletedAt > latest) {
      latest = b.lastCompletedAt;
      out.lastAssigneeId = b.lastAssigneeId;
      out.lastCompletedAt = b.lastCompletedAt;
    }
  }
  if (out.cycles.length > MAX_CYCLES) out.cycles = out.cycles.slice(-MAX_CYCLES);
  if (out.seenTaskIds.length > MAX_SEEN) out.seenTaskIds = out.seenTaskIds.slice(-MAX_SEEN);
  return out;
}

function daysPhrase(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}

export function factFromBucket(
  kind: WorkFact['kind'],
  bucket: MemoryBucket,
  opts?: { who?: string },
): WorkFact | null {
  if (bucket.n < MIN_SAMPLES) return null;
  const median = medianDays(bucket.cycles);
  if (median == null) return null;

  const onTimeOf = bucket.datedN >= MIN_SAMPLES ? Math.max(0, bucket.datedN - bucket.lateN) : undefined;
  const onTimeBit =
    onTimeOf != null ? ` · ${onTimeOf} of ${bucket.datedN} dated tasks on time` : '';

  let line: string;
  if (kind === 'you') {
    line = `You usually finish in ~${daysPhrase(median)}${onTimeBit}`;
  } else if (kind === 'team') {
    line = `Completed work here usually takes ~${daysPhrase(median)}${onTimeBit}`;
  } else {
    const who = opts?.who ? ` · last finished by ${opts.who}` : '';
    line = `Work like this usually takes ~${daysPhrase(median)}${who}`;
  }

  return {
    kind,
    line,
    samples: bucket.n,
    medianDays: median,
    onTimeOf,
    datedN: bucket.datedN,
  };
}

/** Token buckets that overlap the title, merged — "this looks like that". */
export function similarFromTokenBuckets(
  title: string,
  tokenBuckets: Map<string, MemoryBucket>,
): MemoryBucket | null {
  const toks = tokenize(title);
  if (!toks.length) return null;
  const hit: MemoryBucket[] = [];
  for (const tok of toks) {
    const b = tokenBuckets.get(tok);
    if (b && b.n > 0) hit.push(b);
  }
  if (!hit.length) return null;
  return mergeBuckets(hit);
}

export function assembleFacts(parts: {
  you?: MemoryBucket | null;
  team?: MemoryBucket | null;
  similar?: MemoryBucket | null;
  similarWho?: string;
}): WorkMemoryFacts {
  const you = parts.you ? factFromBucket('you', parts.you) : undefined;
  const team = parts.team ? factFromBucket('team', parts.team) : undefined;
  const similar = parts.similar
    ? factFromBucket('similar', parts.similar, { who: parts.similarWho })
    : undefined;
  const lines = [you?.line, similar?.line, team?.line].filter(Boolean) as string[];
  // Today shows at most two lines — you + the more specific of similar/team.
  return {
    you: you || undefined,
    team: team || undefined,
    similar: similar || undefined,
    lines,
  };
}

/** Offline / first-paint fallback: learn from a task list already in memory. */
export function factsFromCompletedTasks(
  tasks: TaskLike[],
  opts: { userId?: string; title?: string; nameById?: Map<string, string> } = {},
): WorkMemoryFacts {
  const youParts: MemoryBucket[] = [];
  const teamParts: MemoryBucket[] = [];
  const tokenMap = new Map<string, MemoryBucket>();

  for (const t of tasks) {
    if (t.status && t.status !== 'done') continue;
    const obs = observationFromTask(t);
    if (!obs) continue;
    teamParts.push(applyObservation(emptyBucket(), obs, 1));
    if (opts.userId && obs.assigneeId === opts.userId) {
      youParts.push(applyObservation(emptyBucket(), obs, 1));
    }
    if (opts.title) {
      for (const tok of obs.tokens) {
        tokenMap.set(tok, applyObservation(tokenMap.get(tok) || emptyBucket(), obs, 1));
      }
    }
  }

  const you = youParts.length ? mergeBuckets(youParts) : null;
  const team = teamParts.length ? mergeBuckets(teamParts) : null;
  const similar = opts.title ? similarFromTokenBuckets(opts.title, tokenMap) : null;
  const similarWho =
    similar?.lastAssigneeId && opts.nameById
      ? opts.nameById.get(similar.lastAssigneeId)
      : undefined;

  return assembleFacts({ you, team, similar, similarWho });
}
