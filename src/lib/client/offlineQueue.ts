/**
 * Offline mutation queue — when the network is gone, queue safe PATCHes
 * (task status / waiting-on / critical path) and flush when online.
 *
 * Deliberately tiny. Not a full offline app — just "finish the task on the
 * factory floor and sync when signal returns."
 *
 * Flush uses raw fetch (not api()) so a still-dead network cannot re-enqueue
 * the same mutations in a loop.
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

/** Only queue task field updates that are safe to replay. */
export function isQueueableMutation(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'PATCH') return false;
  // /tasks/:id only — not nested subroutes. Mongo ObjectId = 24 hex.
  return /^\/tasks\/[a-f\d]{24}$/i.test(path);
}

export function enqueueMutation(path: string, method: string, body?: unknown): QueuedMutation {
  // Coalesce: same path+method keeps only the latest body (last write wins).
  const items = read().filter(
    (q) => !(q.path === path && q.method.toUpperCase() === method.toUpperCase()),
  );
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method: method.toUpperCase(),
    body,
    createdAt: Date.now(),
  };
  const next = [...items, item];
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
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j.error || j.message || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/**
 * Flush queued mutations. Stops on network failure (keeps rest).
 * Drops permanent errors so one bad item cannot block the line forever.
 */
export async function flushOfflineQueue(): Promise<{
  flushed: number;
  remaining: number;
  dropped: number;
  error?: string;
}> {
  const items = read();
  if (!items.length) return { flushed: 0, remaining: 0, dropped: 0 };

  const kept: QueuedMutation[] = [];
  let flushed = 0;
  let dropped = 0;
  let error: string | undefined;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      await rawSend(item.path, item.method, item.body);
      flushed += 1;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      // Still offline / transient — keep this and everything after.
      if (
        /network|offline|failed to fetch|load failed|NetworkError|HTTP 502|HTTP 503|HTTP 504/i.test(
          msg,
        ) ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        kept.push(...items.slice(i));
        error = msg;
        break;
      }
      // Permanent (403/400/404) — drop and continue so the factory isn't stuck.
      dropped += 1;
      error = msg;
    }
  }

  write(kept);
  if (typeof window !== 'undefined' && (flushed > 0 || dropped > 0)) {
    window.dispatchEvent(
      new CustomEvent('pragati:offline-flushed', {
        detail: { flushed, remaining: kept.length, dropped },
      }),
    );
    if (flushed > 0) window.dispatchEvent(new Event('pragati:data-changed'));
  }
  return { flushed, remaining: kept.length, dropped, error };
}

export function installOnlineFlush(): () => void {
  if (typeof window === 'undefined') return () => {};
  let flushing = false;
  const run = () => {
    if (!navigator.onLine || flushing) return;
    if (queueLength() === 0) return;
    flushing = true;
    void flushOfflineQueue().finally(() => {
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
