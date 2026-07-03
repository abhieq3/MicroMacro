'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { PragatiMark } from '@/components/PragatiMark';

/**
 * Route-level error boundary. Catches anything thrown during render of
 * a (sub-)tree of the App Router. Next.js wraps it automatically — no
 * manual <ErrorBoundary> needed at call sites.
 *
 * We deliberately don't echo the underlying error message to the user
 * (it can contain stack frames, query shapes, or internal IDs); we log
 * to the console for the browser devtools and offer a reset path.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[Pragati] route error:', error);
    // Report to the admin monitoring view (best-effort — never block the
    // fallback UI, and swallow any failure so we don't recurse on errors).
    try {
      fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error?.message || 'Unknown render error',
          stack: error?.stack,
          digest: error?.digest,
          path: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="inline-flex">
          <PragatiMark size={56} flat />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Something went wrong</h1>
        <p className="text-sm text-slate-500 leading-relaxed">
          We hit an unexpected error rendering this page. The team has been notified — we run toward this
          kind of danger, not away from it. Try again, or head back to the dashboard.
        </p>
        {error.digest && <p className="text-[11px] font-mono text-slate-400">ref: {error.digest}</p>}
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => reset()} className="btn-primary text-sm">
            Try again
          </button>
          <Link href="/" className="btn-secondary text-sm">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
