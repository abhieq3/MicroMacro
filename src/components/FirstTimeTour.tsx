'use client';

/**
 * First-login welcome — Naval style.
 *
 * First-time users often land once. A 6-step spotlight tour is a busy mind:
 * they bounce. One calm card, one next action by role, skip forever.
 * No arrows, no confetti, no homework.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PragatiMark } from './PragatiMark';

const STORAGE_KEY = 'pragati-tour-v6';

type RoleHint = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  secondary?: string;
};

function hintForRole(role: string): RoleHint {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;

  if (isAdmin) {
    return {
      headline: 'You’re in. One thing first.',
      body: 'Create a team, then invite people and open a project. Everything else can wait.',
      ctaLabel: 'Create a team',
      ctaHref: '/teams',
      secondary: 'Or open People to invite someone by username.',
    };
  }
  if (isLead) {
    return {
      headline: 'You’re in. One thing first.',
      body: 'Open or create a project, assign the next task. Skip the rest until you need it.',
      ctaLabel: 'Go to projects',
      ctaHref: '/projects',
      secondary: 'My Day is private planning — yours alone.',
    };
  }
  return {
    headline: 'You’re in. One thing first.',
    body: 'When your lead assigns work, it shows up on the dashboard. Until then, plan in My Day.',
    ctaLabel: 'Open My Day',
    ctaHref: '/my-day',
    secondary: 'Nothing assigned yet is normal on day one.',
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
    } catch {
      /* private mode — still show once this session */
    }
    // Let the page paint first so first login feels instant, not blocked.
    const t = window.setTimeout(() => setOpen(true), 400);
    return () => window.clearTimeout(t);
  }, [alreadySeen]);

  async function dismiss(go?: string) {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    try {
      await api('/me/tour-seen', { method: 'POST' });
    } catch {
      /* best-effort — localStorage still stops re-show */
    }
    if (go) router.push(go);
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div className="w-full max-w-[400px] rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#262624] shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={() => void dismiss()}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          aria-label="Skip"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <PragatiMark size={28} />
          <span className="brand-wordmark text-[18px] brand-wordmark-gradient dark:text-white">Pragati</span>
        </div>

        <h2 id="first-login-title" className="text-lg font-black text-slate-900 dark:text-white/90 tracking-tight">
          {hint.headline}
        </h2>
        <p className="mt-2 text-[13px] text-slate-500 dark:text-white/45 leading-relaxed">{hint.body}</p>
        {hint.secondary && (
          <p className="mt-2 text-[12px] text-slate-400 dark:text-white/30 leading-snug">{hint.secondary}</p>
        )}

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
    </div>,
    document.body,
  );
}
