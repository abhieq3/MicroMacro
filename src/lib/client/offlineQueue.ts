/**
 * Offline mutation queue — when the network is gone, queue safe PATCHes
 * (task status / waiting-on / critical path) and flush when online.
 *
 * Deliberately tiny. Not a full offline app — just "finish the task on the
 * factory floor and sync when signal returns."
 *
 * Flush uses raw fetch (not api()) so a still-dead network cannot re-enqueue
 * the same mutations in a loop.
 *
 * Coalesce merges PATCH bodies for the same task (field union, last write
 * wins per key) so status+pendingWith+dueDate offline edits never drop.
 */

export type QueuedMutation = {
  id: string;
  path: string;
  method: string;
  body?: unknown;
  createdAt: number;
};

const KEY = 'pragati-offline-queue-v1';
const MAX = 40;

function read(): QueuedMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(items: QueuedMutation[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
  } catch {
    /* quota */
  }
}

/** Remove a single queued item by id without touching later concurrent enqueues. */
function removeById(id: string) {
  write(read().filter((q) => q.id !== id));
}

/** Merge two PATCH bodies — later keys win. Non-objects: later replaces. */
export function mergePatchBodies(prev: unknown, next: unknown): unknown {
  if (
    prev &&
    next &&
    typeof prev === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(prev) &&
    !Array.isArray(next)
  ) {
    return { ...(prev as Record<string, unknown>), ...(next as Record<string, unknown>) };
  }
  return next !== undefined ? next : prev;
}

/** Only queue task field updates that are safe to replay. */
export function isQueueableMutation(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'PATCH') return false;
  // /tasks/:id only — not nested subroutes. Mongo ObjectId = 24 hex.
  return /^\/tasks\/[a-f\d]{24}$/i.test(path);
}

export function enqueueMutation(path: string, method: string, body?: unknown): QueuedMutation {
  const methodU = method.toUpperCase();
  const existing = read();
  const idx = existing.findIndex((q) => q.path === path && q.method.toUpperCase() === methodU);

  // Coalesce same path+method: merge bodies so partial PATCHes stack
  // (status then pendingWith then dueDate → one request, all fields).
  let mergedBody = body;
  let rest = existing;
  if (idx >= 0) {
    mergedBody = mergePatchBodies(existing[idx].body, body);
    rest = existing.filter((_, i) => i !== idx);
  }

  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method: methodU,
    body: mergedBody,
    createdAt: Date.now(),
  };
  const next = [...rest, item];
  write(next);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pragati:offline-queued', { detail: { count: next.length } }));
  }
  return item;
}

export function queueLength(): number {
  return read().length;
}

export function peekQueue(): QueuedMutation[] {
  return read();
}

/** Direct fetch — never goes through api()'s offline re-queue path. */
async function rawSend(path: string, method: string, body?: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    // Normalize browser network errors so flush's classifier is reliable.
    throw new Error(String(e?.message || e || 'Network error'));
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    // Preserve status code prefix so flush can classify 401/5xx.
    if (!/^HTTP \d{3}/.test(msg)) {
      msg = `HTTP ${res.status}: ${msg}`;
    }
    throw new Error(msg);
  }
}

function isNetworkOrTransient(msg: string): boolean {
  return (
    /network|offline|failed to fetch|load failed|NetworkError|HTTP 502|HTTP 503|HTTP 504|HTTP 429/i.test(
      msg,
    ) ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  );
}

function isAuthFailure(msg: string): boolean {
  return /HTTP 401/i.test(msg);
}

/**
 * Flush queued mutations one-by-one (dequeue on success).
 * - Network / 5xx: stop, keep remaining (including current).
 * - 401: stop, keep remaining, signal re-auth (do NOT drop floor work).
 * - Other 4xx: drop this item, continue (don't block the line forever).
 */
export async function flushOfflineQueue(): Promise<{
  flushed: number;
  remaining: number;
  dropped: number;
  error?: string;
  needsAuth?: boolean;
}> {
  let flushed = 0;
  let dropped = 0;
  let error: string | undefined;
  let needsAuth = false;

  // Process head-of-queue repeatedly so concurrent enqueues (during await)
  // are never wiped by a bulk write(kept).
  while (true) {
    const items = read();
    if (!items.length) break;
    const item = items[0];

    try {
      await rawSend(item.path, item.method, item.body);
      removeById(item.id);
      flushed += 1;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      error = msg;

      if (isAuthFailure(msg)) {
        // Session gone — keep every pending change. Operator must re-login.
        needsAuth = true;
        break;
      }
      if (isNetworkOrTransient(msg)) {
        break;
      }
      // Permanent (400/403/404) — drop this item only.
      removeById(item.id);
      dropped += 1;
    }
  }

  const remaining = queueLength();
  if (typeof window !== 'undefined' && (flushed > 0 || dropped > 0 || needsAuth)) {
    window.dispatchEvent(
      new CustomEvent('pragati:offline-flushed', {
        detail: { flushed, remaining, dropped, needsAuth, error },
      }),
    );
    if (flushed > 0) window.dispatchEvent(new Event('pragati:data-changed'));
  }
  return { flushed, remaining, dropped, error, needsAuth };
}

export function installOnlineFlush(): () => void {
  if (typeof window === 'undefined') return () => {};
  let flushing = false;
  const run = () => {
    if (!navigator.onLine || flushing) return;
    if (queueLength() === 0) return;
    flushing = true;
    void flushOfflineQueue()
      .then((r) => {
        if (r.needsAuth && typeof window !== 'undefined') {
          // Bounce to login so the operator can re-auth; queue stays intact
          // and will flush after the next successful session.
          window.location.replace('/login');
        }
      })
      .finally(() => {
        flushing = false;
      });
  };
  const onOnline = () => run();
  const onVis = () => {
    if (document.visibilityState === 'visible') run();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVis);
  if (navigator.onLine && queueLength() > 0) run();
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVis);
  };
}
