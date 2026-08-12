/**
 * Persistence for work memory.
 *
 * Learns on every completion (and unlearns if a task leaves done). First
 * read against an empty scope backfills from existing completed tasks so
 * current projects teach the model before the next one starts.
 *
 * Failures here must never block marking a task done.
 */

import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { WorkMemory } from '@/models/WorkMemory';
import {
  applyObservation,
  assembleFacts,
  emptyBucket,
  factsFromCompletedTasks,
  keysForObservation,
  mergeBuckets,
  observationFromTask,
  similarFromTokenBuckets,
  type MemoryBucket,
  type MemoryKind,
  type Observation,
  type TaskLike,
  type WorkMemoryFacts,
} from '@/lib/ai/workMemory';

function docToBucket(doc: any): MemoryBucket {
  return {
    n: doc.n || 0,
    datedN: doc.datedN || 0,
    lateN: doc.lateN || 0,
    cycles: Array.isArray(doc.cycles)
      ? doc.cycles.map((c: any) => ({ taskId: String(c.taskId), days: Number(c.days) }))
      : [],
    lastAssigneeId: doc.lastAssigneeId || undefined,
    lastCompletedAt: doc.lastCompletedAt ? new Date(doc.lastCompletedAt).toISOString() : undefined,
    seenTaskIds: Array.isArray(doc.seenTaskIds) ? doc.seenTaskIds.map(String) : [],
  };
}

export async function scopeForProject(projectId: unknown): Promise<string> {
  if (!projectId) return 'workspace';
  const p = await Project.findById(projectId).select('teamId isPersonal code').lean();
  if (!p) return 'workspace';
  if ((p as any).isPersonal || String((p as any).code || '').startsWith('PRSN-')) return '';
  if ((p as any).teamId) return String((p as any).teamId);
  return 'workspace';
}

async function applyToStore(scopeKey: string, obs: Observation, direction: 1 | -1): Promise<void> {
  if (!scopeKey) return;
  const keys = keysForObservation(obs);
  const existing = await WorkMemory.find({
    scopeKey,
    $or: keys.map((k) => ({ kind: k.kind, subject: k.subject })),
  }).lean();
  const map = new Map(existing.map((d) => [`${d.kind}:${d.subject}`, d]));
  const ops = keys.map((k) => {
    const prev = map.get(`${k.kind}:${k.subject}`);
    const next = applyObservation(prev ? docToBucket(prev) : emptyBucket(), obs, direction);
    return {
      updateOne: {
        filter: { scopeKey, kind: k.kind, subject: k.subject },
        update: {
          $set: {
            n: next.n,
            datedN: next.datedN,
            lateN: next.lateN,
            cycles: next.cycles,
            lastAssigneeId: next.lastAssigneeId || '',
            lastCompletedAt: next.lastCompletedAt ? new Date(next.lastCompletedAt) : null,
            seenTaskIds: next.seenTaskIds,
            lastLearnedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });
  if (ops.length) await WorkMemory.bulkWrite(ops as any, { ordered: false });
}

/** Learn from a task that just became done. */
export async function rememberTask(task: TaskLike & { projectId?: unknown }): Promise<void> {
  const obs = observationFromTask({ ...task, status: 'done' });
  if (!obs) return;
  const scope = await scopeForProject((task as any).projectId);
  if (!scope) return;
  await applyToStore(scope, obs, 1);
}

/** Forget a task that left done (reopened). */
export async function forgetTask(task: TaskLike & { projectId?: unknown }): Promise<void> {
  const obs = observationFromTask({ ...task, status: 'done' });
  if (!obs) return;
  const scope = await scopeForProject((task as any).projectId);
  if (!scope) return;
  await applyToStore(scope, obs, -1);
}

async function rebuildScope(scopeKey: string, projectIds: unknown[]): Promise<void> {
  if (!scopeKey || !projectIds.length) {
    await WorkMemory.updateOne(
      { scopeKey: scopeKey || 'workspace', kind: 'meta', subject: 'seed' },
      { $set: { seeded: true, n: 0, datedN: 0, lateN: 0, cycles: [], seenTaskIds: [] } },
      { upsert: true },
    );
    return;
  }

  const tasks = await Task.find({
    projectId: { $in: projectIds },
    status: 'done',
    completedAt: { $ne: null },
    $or: [{ privateToUserId: null }, { privateToUserId: { $exists: false } }],
  })
    .select('title assigneeId createdAt completedAt dueDate ccTcd taskType projectId')
    .sort({ completedAt: -1 })
    .limit(800)
    .lean();

  const buckets = new Map<string, MemoryBucket>();
  for (const t of tasks) {
    const obs = observationFromTask(t as any);
    if (!obs) continue;
    for (const k of keysForObservation(obs)) {
      const key = `${k.kind}:${k.subject}`;
      buckets.set(key, applyObservation(buckets.get(key) || emptyBucket(), obs, 1));
    }
  }

  const ops = [...buckets.entries()].map(([key, b]) => {
    const colon = key.indexOf(':');
    const kind = key.slice(0, colon) as MemoryKind;
    const subject = key.slice(colon + 1);
    return {
      updateOne: {
        filter: { scopeKey, kind, subject },
        update: {
          $set: {
            n: b.n,
            datedN: b.datedN,
            lateN: b.lateN,
            cycles: b.cycles,
            lastAssigneeId: b.lastAssigneeId || '',
            lastCompletedAt: b.lastCompletedAt ? new Date(b.lastCompletedAt) : null,
            seenTaskIds: b.seenTaskIds,
            lastLearnedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });
  if (ops.length) await WorkMemory.bulkWrite(ops as any, { ordered: false });
  await WorkMemory.updateOne(
    { scopeKey, kind: 'meta', subject: 'seed' },
    { $set: { seeded: true, n: buckets.size, datedN: 0, lateN: 0, cycles: [], seenTaskIds: [] } },
    { upsert: true },
  );
}

export async function ensureSeeded(scopeKey: string, projectIds: unknown[]): Promise<void> {
  if (!scopeKey) return;
  const meta = await WorkMemory.findOne({ scopeKey, kind: 'meta', subject: 'seed' })
    .select('seeded')
    .lean();
  if ((meta as any)?.seeded) return;
  await rebuildScope(scopeKey, projectIds);
}

async function loadBuckets(
  scopeKeys: string[],
  kinds: MemoryKind[],
): Promise<(MemoryBucket & { scopeKey: string; kind: MemoryKind; subject: string })[]> {
  if (!scopeKeys.length) return [];
  const rows = await WorkMemory.find({
    scopeKey: { $in: scopeKeys },
    kind: { $in: kinds },
  }).lean();
  return rows.map((d) => ({
    ...docToBucket(d),
    scopeKey: d.scopeKey,
    kind: d.kind as MemoryKind,
    subject: d.subject,
  }));
}

function pickScopes(teamIds: string[]): string[] {
  return teamIds.length ? teamIds : ['workspace'];
}

export async function factsForViewer(opts: {
  userId: string;
  teamIds: string[];
  projects: { _id: unknown; teamId?: unknown }[];
  nameById?: Map<string, string>;
  fallbackTasks?: TaskLike[];
}): Promise<WorkMemoryFacts> {
  const scopes = pickScopes(opts.teamIds);
  try {
    await Promise.all(
      scopes.map((s) => {
        const pids =
          s === 'workspace'
            ? opts.projects.filter((p) => !p.teamId).map((p) => p._id)
            : opts.projects.filter((p) => String(p.teamId) === s).map((p) => p._id);
        return ensureSeeded(s, pids);
      }),
    );
  } catch (e) {
    console.error('[work-memory] seed', e);
  }

  const rows = await loadBuckets(scopes, ['assignee', 'team']);
  const you = mergeIfAny(rows.filter((r) => r.kind === 'assignee' && r.subject === opts.userId));
  const team = mergeIfAny(rows.filter((r) => r.kind === 'team' && r.subject === 'all'));
  const fromStore = assembleFacts({ you, team });
  if (fromStore.lines.length) return trimViewer(fromStore);
  if (opts.fallbackTasks?.length) {
    return trimViewer(factsFromCompletedTasks(opts.fallbackTasks, { userId: opts.userId }));
  }
  return { lines: [] };
}

function trimViewer(facts: WorkMemoryFacts): WorkMemoryFacts {
  // Today: you + one more (similar is task-scoped; here we keep team).
  const lines = [facts.you?.line, facts.team?.line].filter(Boolean) as string[];
  return { ...facts, similar: undefined, lines };
}

export async function factsForTask(opts: {
  title: string;
  assigneeId?: string | null;
  teamId?: string | null;
  projectId?: unknown;
  nameById?: Map<string, string>;
}): Promise<WorkMemoryFacts> {
  const scope = opts.teamId ? String(opts.teamId) : await scopeForProject(opts.projectId);
  if (!scope) return { lines: [] };

  let projectIds: unknown[] = opts.projectId ? [opts.projectId] : [];
  if (opts.teamId) {
    const teamProjects = await Project.find({ teamId: opts.teamId }).select('_id').lean();
    if (teamProjects.length) projectIds = teamProjects.map((p) => p._id);
  }
  try {
    await ensureSeeded(scope, projectIds);
  } catch (e) {
    console.error('[work-memory] seed', e);
  }

  const rows = await loadBuckets([scope], ['assignee', 'team', 'token']);
  const you = opts.assigneeId
    ? mergeIfAny(rows.filter((r) => r.kind === 'assignee' && r.subject === String(opts.assigneeId)))
    : null;
  const team = mergeIfAny(rows.filter((r) => r.kind === 'team' && r.subject === 'all'));
  const tokenMap = new Map<string, MemoryBucket>();
  for (const r of rows) {
    if (r.kind === 'token') tokenMap.set(r.subject, r);
  }
  const similar = similarFromTokenBuckets(opts.title, tokenMap);

  let similarWho: string | undefined;
  const whoId = similar?.lastAssigneeId;
  if (whoId) {
    similarWho = opts.nameById?.get(whoId);
    if (!similarWho) {
      const u = await User.findById(whoId).select('name').lean();
      similarWho = (u as any)?.name || undefined;
    }
  }

  const facts = assembleFacts({ you: null, team, similar, similarWho });
  // Task page: similar first, then the assignee's own pace if it's this person
  // (shown as team/you only when they add signal). Prefer similar + you.
  const youFact = you ? assembleFacts({ you }).you : undefined;
  const lines = [facts.similar?.line, youFact?.line].filter(Boolean) as string[];
  return { you: youFact, team: facts.team, similar: facts.similar, lines };
}

function mergeIfAny(rows: MemoryBucket[]): MemoryBucket | null {
  if (!rows.length) return null;
  return mergeBuckets(rows);
}
