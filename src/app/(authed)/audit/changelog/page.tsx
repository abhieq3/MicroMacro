import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserFromCookie, normalizeRole } from '@/lib/auth';
import { CHANGELOG, CHANGELOG_TAG_META } from '@/lib/changelog';
import { Sparkles, ArrowLeft } from 'lucide-react';

export const runtime = 'nodejs';

/**
 * Admin-only Changelog page.
 *
 * Renders the contents of `src/lib/changelog.ts` as a reverse-chronological
 * list — the entries live in the codebase so a PR review doubles as a
 * release-notes review. Restricted to admins because the user asked for
 * this to live in the admin login (it doubles as a one-stop "what's
 * changed since I last logged in" view for the workspace owner).
 */
export default async function ChangelogPage() {
  const jwt = await getCurrentUserFromCookie();
  if (!jwt) redirect('/login');
  if (normalizeRole(jwt.role) !== 'admin') redirect('/');

  return (
    <div className="max-w-3xl pb-12">
      {/* Header */}
      <div className="pb-5 mb-6 border-b border-slate-100 dark:border-white/[0.06] pt-1">
        <Link
          href="/audit"
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 mb-3"
        >
          <ArrowLeft size={13} /> Back to audit
        </Link>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 page-icon-box bg-indigo-50 dark:bg-indigo-500/10 shrink-0">
            <Sparkles size={19} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="page-title">Changelog</h1>
            <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
              What's new in Pragati — most recent first.
            </p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-5">
        {/* Vertical rail */}
        <div
          className="absolute left-1.5 top-1.5 bottom-1.5 w-px bg-slate-200 dark:bg-white/10"
          aria-hidden
        />

        <div className="space-y-7">
          {CHANGELOG.map((e, i) => (
            <article key={i} className="relative">
              {/* Dot */}
              <span
                className={`absolute -left-[15.5px] top-1.5 w-3 h-3 rounded-full ring-4 ${
                  e.highlight
                    ? 'bg-indigo-500 ring-indigo-100 dark:ring-indigo-500/20'
                    : 'bg-slate-300 dark:bg-white/30 ring-slate-50 dark:ring-white/5'
                }`}
                aria-hidden
              />

              <div
                className={`rounded-2xl p-5 border ${
                  e.highlight
                    ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/40 dark:bg-indigo-500/5'
                    : 'border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
                  <h2
                    className={`font-bold text-slate-900 dark:text-white/90 leading-tight ${e.highlight ? 'text-base' : 'text-sm'}`}
                  >
                    {e.title}
                  </h2>
                  <time className="text-[11px] font-mono text-slate-400 dark:text-white/40 whitespace-nowrap">
                    {e.date}
                  </time>
                </div>

                {/* Tag chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {e.tags.map((t) => {
                    const m = CHANGELOG_TAG_META[t];
                    return (
                      <span
                        key={t}
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${m.bg} ${m.text}`}
                      >
                        {m.label}
                      </span>
                    );
                  })}
                </div>

                <ul className="space-y-1.5">
                  {e.body.map((line, j) => (
                    <li
                      key={j}
                      className="text-[13px] text-slate-600 dark:text-white/70 leading-relaxed flex gap-2"
                    >
                      <span className="text-slate-300 dark:text-white/30 shrink-0">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-white/40 mt-8 text-center">
        Maintained in <code className="font-mono">src/lib/changelog.ts</code> — append an entry at the top of
        the array when a feature ships.
      </p>
    </div>
  );
}
