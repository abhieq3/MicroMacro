/**
 * Critical path ordering — pure, no DB.
 *
 * Tasks flagged onCriticalPath are ordered by blockedBy edges (predecessor
 * first). Cycles and missing edges fall back to due date / position.
 */

export type PathTask = {
  id: string;
  onCriticalPath?: boolean;
  blockedByTaskId?: string | null;
  status?: string;
  dueDate?: string | null;
  position?: number;
  title?: string;
};

function dueMs(t: PathTask): number {
  if (!t.dueDate) return Number.MAX_SAFE_INTEGER;
  const n = new Date(t.dueDate).getTime();
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Open critical-path tasks in predecessor → successor order. */
export function orderCriticalPathOpen<T extends PathTask>(tasks: T[]): T[] {
  const open = tasks.filter((t) => t.onCriticalPath && t.status !== 'done');
  if (open.length <= 1) return open;

  const byId = new Map(open.map((t) => [t.id, t]));
  // Kahn-ish: only edges where both ends are open on the path.
  const indeg = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const t of open) {
    indeg.set(t.id, 0);
    succ.set(t.id, []);
  }
  for (const t of open) {
    const pred = t.blockedByTaskId ? byId.get(t.blockedByTaskId) : null;
    if (pred) {
      indeg.set(t.id, (indeg.get(t.id) || 0) + 1);
      succ.get(pred.id)!.push(t.id);
    }
  }

  const ready = open
    .filter((t) => (indeg.get(t.id) || 0) === 0)
    .sort((a, b) => dueMs(a) - dueMs(b) || (a.position ?? 0) - (b.position ?? 0));
  const out: T[] = [];
  const seen = new Set<string>();

  while (ready.length) {
    const n = ready.shift()!;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
    for (const s of succ.get(n.id) || []) {
      indeg.set(s, (indeg.get(s) || 0) - 1);
      if ((indeg.get(s) || 0) === 0) {
        const st = byId.get(s);
        if (st) {
          ready.push(st);
          ready.sort((a, b) => dueMs(a) - dueMs(b) || (a.position ?? 0) - (b.position ?? 0));
        }
      }
    }
  }

  // Cycle remainder — append by due date so nothing vanishes.
  for (const t of open) {
    if (!seen.has(t.id)) out.push(t);
  }
  return out;
}
