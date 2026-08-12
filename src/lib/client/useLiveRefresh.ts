'use client';
import { useEffect, useRef } from 'react';

/**
 * Realtime-ish refresh without a server push channel.
 *
 * Vercel serverless + a free-forever budget rules out always-on WebSockets, so
 * "as realtime as possible" is built from three cheap signals that, together,
 * make data feel live:
 *
 *   1. **Focus / visibility** — the moment you return to the tab (or alt-tab
 *      back), the page refetches. This is what makes Linear/Vercel-style
 *      dashboards feel current: you never look at stale data.
 *   2. **A gentle interval** — while the tab is visible, refetch every
 *      `intervalMs` (default 30s) so other people's changes appear without you
 *      doing anything. Paused entirely while the tab is hidden, so it costs
 *      nothing in the background.
 *   3. **Same-tab events** — your own actions dispatch `pragati:data-changed`
 *      (see `notifyDataChanged`), so every mounted view updates instantly,
 *      with no reload and no waiting for the interval.
 *
 * `refresh` is kept in a ref so callers can pass an inline closure without
 * resubscribing every render. Pass `enabled: false` to suspend (e.g. while a
 * drag or inline edit is in flight, so a refetch can't yank the UI).
 */
export function useLiveRefresh(
  refresh: () => void,
  opts?: { intervalMs?: number; enabled?: boolean; events?: string[] },
) {
  const enabled = opts?.enabled ?? true;
  const intervalMs = opts?.intervalMs ?? 30_000;
  const events = opts?.events ?? ['pragati:data-changed'];
  const ref = useRef(refresh);
  ref.current = refresh;

  const eventsKey = events.join(',');

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') ref.current();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') ref.current();
    };
    const onFocus = () => ref.current();

    const timer = intervalMs > 0 ? setInterval(run, intervalMs) : null;
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    // Change events can arrive in bursts (a few rapid edits). Coalesce them
    // into a single refresh so we never storm the server / re-render thrash.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => ref.current(), 350);
    };
    const evtList = eventsKey ? eventsKey.split(',').filter(Boolean) : [];
    evtList.forEach((name) => window.addEventListener(name, onEvent));

    // Cross-tab liveness: a mutation in any other tab of this app (see
    // lib/client/api) posts here, so every open tab updates without a reload.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('pragati');
      bc.onmessage = (e) => {
        if (e.data === 'data-changed') onEvent();
      };
    } catch {
      /* no BroadcastChannel — same-tab event + interval still cover liveness */
    }

    return () => {
      if (timer) clearInterval(timer);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      evtList.forEach((name) => window.removeEventListener(name, onEvent));
      bc?.close();
    };
  }, [enabled, intervalMs, eventsKey]);
}

