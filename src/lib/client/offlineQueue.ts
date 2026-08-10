/**
 * Offline mutation queue — when the network is gone, queue safe PATCHes
 * (task status / waiting-on / critical path) and flush when online.
 *
 * Deliberately tiny. Not a full offline app — just "finish the task on the
 * factory floor and sync when signal returns."
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

/** Only queue task field updates that are safe to replay out of order-ish. */
export function isQueueableMutation(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'PATCH') return false;
  // /tasks/:id only — not nested subroutes.
  return /^\/tasks\/[a-f\d]{24}$/i.test(path);
}

export function enqueueMutation(path: string, method: string, body?: unknown): QueuedMutation {
  const item: QueuedMutation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    method: method.toUpperCase(),
    body,
    createdAt: Date.now(),
  };
  const next = [...read(), item];
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

/**
 * Flush queued mutations. Returns counts. Stops on first hard failure
 * (non-network) so the operator can fix and retry.
 */
export async function flushOfflineQueue(
  send: (path: string, opts: { method: string; body?: unknown }) => Promise<unknown>,
): Promise<{ flushed: number; remaining: number; error?: string }> {
  const items = read();
  if (!items.length) return { flushed: 0, remaining: 0 };

  const kept: QueuedMutation[] = [];
  let flushed = 0;
  let error: string | undefined;

  for (const item of items) {
    try {
      await send(item.path, { method: item.method, body: item.body });
      flushed += 1;
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      // Still offline / transient — keep the rest.
      if (/network|offline|failed to fetch/i.test(msg)) {
        kept.push(item, ...items.slice(items.indexOf(item) + 1));
        error = msg;
        break;
      }
      // Permanent failure — drop this item, continue (don't block the queue forever).
      flushed += 1;
      error = msg;
    }
  }

  write(kept);
  if (typeof window !== 'undefined' && flushed > 0) {
    window.dispatchEvent(new CustomEvent('pragati:offline-flushed', { detail: { flushed, remaining: kept.length } }));
    window.dispatchEvent(new Event('pragati:data-changed'));
  }
  return { flushed, remaining: kept.length, error };
}

export function installOnlineFlush(
  send: (path: string, opts: { method: string; body?: unknown }) => Promise<unknown>,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const run = () => {
    if (!navigator.onLine) return;
    void flushOfflineQueue(send);
  };
  window.addEventListener('online', run);
  // First paint after return from background.
  if (navigator.onLine && queueLength() > 0) run();
  return () => window.removeEventListener('online', run);
}
