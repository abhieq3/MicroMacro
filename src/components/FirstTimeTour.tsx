'use client';

/**
 * First-login welcome — top-notch, Naval-simple.
 *
 * First-time users often land once. One calm card, one next action by role,
 * skip forever. Premium feel without multi-step homework.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, X, Sparkles } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PragatiMark } from './PragatiMark';

const STORAGE_KEY = 'pragati-tour-v7';

type RoleHint = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  chips: string[];
};

function hintForRole(role: string): RoleHint {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;

  if (isAdmin) {
    return {
      headline: 'You’re in.',
      body: 'Start with a team. Invite people, open a project, assign work. Everything else can wait.',
      ctaLabel: 'Create a team',
      ctaHref: '/teams',
      chips: ['Teams', 'People', 'Projects'],
    };
  }
  if (isLead) {
    return {
      headline: 'You’re in.',
      body: 'Open a project and assign the next task. My Day is private planning — yours alone.',
      ctaLabel: 'Go to projects',
      ctaHref: '/projects',
      chips: ['Projects', 'Dashboard', 'My Day'],
    };
  }
  return {
    headline: 'You’re in.',
    body: 'When your lead assigns work, it shows on the dashboard. Until then, plan in My Day.',
    ctaLabel: 'Open My Day',
    ctaHref: '/my-day',
    chips: ['My Day', 'Dashboard', 'Projects'],
  };
}

export function FirstTimeTour({
  alreadySeen = false,
  role = 'contributor',
}: {
  alreadySeen?: boolean;
  role?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hint = hintForRole(role);

  useEffect(() => {
    setMounted(true);
    if (alreadySeen) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
      // Honor older tour keys so we never re-show after a prior dismiss.
      if (localStorage.getItem('pragati-tour-v6') === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        return;
      }
    } catch {
      /* private mode — still show once this session */
    }
    const t = window.setTimeout(() => setOpen(true), 320);
    return () => window.clearTimeout(t);
  }, [alreadySeen]);

  async function dismiss(go?: string) {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
      localStorage.setItem('pragati-tour-v6', '1');
    } catch {
      /* ignore */
    }
    try {
      await api('/me/tour-seen', { method: 'POST' });
    } catch {
      /* best-effort */
    }
    if (go) router.push(go);
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#262624] shadow-2xl overflow-hidden relative"
        style={{ animation: 'fade-in-soft-2 0.22s ease-out both' }}
      >
        {/* Soft brand header band */}
        <div
          className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]"
          style={{
            background:
              'linear-gradient(135deg, rgba(18,86,176,0.08) 0%, rgba(34,197,94,0.06) 100%)',
          }}
        >
          <button
            type="button"
            onClick={() => void dismiss()}
            className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white/70 hover:bg-white/60 dark:hover:bg-white/[0.06]"
            aria-label="Skip"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <PragatiMark size={30} />
            <div>
              <span className="brand-wordmark text-[18px] brand-wordmark-gradient dark:text-white block leading-none">
                Pragati
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35 mt-1 inline-flex items-center gap-1">
                <Sparkles size={10} /> One thing first
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <h2
            id="first-login-title"
            className="text-xl font-black text-slate-900 dark:text-white/90 tracking-tight"
          >
            {hint.headline}
          </h2>
          <p className="mt-2 text-[13.5px] text-slate-500 dark:text-white/45 leading-relaxed">
            {hint.body}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {hint.chips.map((c) => (
              <span
                key={c}
                className="text-[11px] font-semibold text-slate-500 dark:text-white/40 bg-slate-50 dark:bg-white/[0.05] border border-slate-100 dark:border-white/[0.06] px-2 py-0.5 rounded-full"
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void dismiss(hint.ctaHref)}
              className="btn-primary w-full justify-center py-2.5 text-[13px]"
            >
              {hint.ctaLabel}
              <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="w-full py-2 text-[12px] font-semibold text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70 transition-colors"
            >
              Skip — I’ll explore
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
