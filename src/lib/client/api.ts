'use client';

/**
 * Thin wrapper around fetch() used by every client component.
 *
 * Behaviour for non-OK responses:
 *
 * - 401 (Unauthenticated) on a non-auth route → the session is missing or
 *   expired; bounce to /login. Correct reflex for a tab left open overnight.
 *
 * - 403 (Forbidden) → the user IS authenticated but lacks permission for
 *   this action (e.g. a contributor hitting a lead-only route). We do NOT
 *   redirect — that would look like a spurious logout. The error bubbles
 *   to the caller to render inline.
 *
 * - 401 / 403 on the auth endpoints themselves (/auth/login, …) never
 *   redirect: the caller is trying to authenticate, so a wrong-password
 *   401 should render below the form, not reload the page.
 *
 * - All other non-OK responses throw an Error with the server's message;
 *   callers display it via setErr() or a toast.
 */

const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/signup',
  '/auth/first-password',
  '/auth/password',
  // A wrong-PIN 401 must render under the PIN pad, not bounce to /login.
  '/auth/unlock',
];

function isAuthEndpoint(path: string): boolean {
  return AUTH_ENDPOINTS.some((p) => path.startsWith(p));
}

// Transient server states worth a quick retry on a safe (idempotent) request.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const NETWORK_ERROR = 'Network error — check your connection and try again.';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 0 → 300ms, 1 → 800ms. Short enough to stay snappy, long enough to ride out a
// blip (a dropped Wi-Fi packet, a cold serverless function).
const backoff = (attempt: number) => 300 + attempt * 500;

/**
 * fetch() with a small retry budget for *idempotent* requests only. A GET that
 * fails on a network blip or a 502/503/504 is safe to repeat; a POST/PATCH is
 * not (it may have already been applied), so mutations never retry — they fail
 * fast with a clear message instead of risking a double-submit.
 */
async function fetchWithRetry(url: string, init: RequestInit, idempotent: boolean): Promise<Response> {
  const budget = idempotent ? MAX_RETRIES : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (idempotent && RETRYABLE_STATUS.has(res.status) && attempt < budget) {
        await delay(backoff(attempt));
        continue;
      }
      return res;
    } catch (e) {
      // fetch() throws on network failure (offline, DNS, CORS) — not on HTTP errors.
      if (attempt < budget) {
        await delay(backoff(attempt));
        continue;
      }
      throw new Error(NETWORK_ERROR);
    }
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const requestMethod = (opts.method || 'GET').toUpperCase();
  const res = await fetchWithRetry(
    `/api${path}`,
    {
      method: requestMethod,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    },
    requestMethod === 'GET',
  );

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      // Surface the first Zod issue ("Task title is required") instead of the
      // generic "Validation failed" wrapper, so the user sees what to fix.
      if (j.error === 'Validation failed' && Array.isArray(j.issues) && j.issues[0]?.message) {
        msg = j.issues[0].message;
      } else {
        msg = j.error || j.message || JSON.stringify(j);
      }
    } catch {
      /* response wasn't JSON — fall back to the HTTP-X label */
    }

    // Unauthenticated → session bounce. ONLY 401 (not 403): a 403 means
    // the user is signed in but not permitted, and redirecting them to
    // /login would masquerade as a logout. 403 falls through to throw.
    if (res.status === 401 && !isAuthEndpoint(path) && typeof window !== 'undefined') {
      // Distinguish a deactivated account from a plain expired session so the
      // login page can show a clear, actionable message rather than a generic
      // "session expired" line.
      const isDeactivated =
        (res as any)._deactivated || (typeof msg === 'string' && msg.toLowerCase().includes('deactivated'));
      window.location.replace(isDeactivated ? '/login?reason=deactivated' : '/login');
      throw new Error(isDeactivated ? 'Account deactivated' : 'Session expired — please log in again');
    }

    // Stale JWT pointing to a deleted user — same bounce.
    if (msg === 'User not found' && !isAuthEndpoint(path) && typeof window !== 'undefined') {
      window.location.replace('/login');
      throw new Error('Session expired — please log in again');
    }

    throw new Error(msg);
  }

  // Realtime: any successful mutation (anything that isn't a GET) tells every
  // mounted live view to refresh — see useLiveRefresh. This is the single hook
  // that makes the whole app feel live to your own actions without each call
  // site having to remember to broadcast.
  //   • this tab : a window event (instant, in-process)
  //   • other tabs/windows on this device : a BroadcastChannel message, so a
  //     change in one tab updates every other open tab of the same app
  //     without a reload. (Cross-DEVICE liveness is the visibility/interval
  //     refetch in useLiveRefresh — no always-on socket needed.)
  if (requestMethod !== 'GET' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('pragati:data-changed'));
    try {
      const bc = new BroadcastChannel('pragati');
      bc.postMessage('data-changed');
      bc.close();
    } catch {
      /* Safari/old browsers without BroadcastChannel — same-tab event still fires */
    }
  }

  if (res.status === 204) return null as T;
  return res.json();
}
