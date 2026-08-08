'use client';

/**
 * First-session onboarding — one next action by role.
 * Teach by doing. Skip forever. No multi-step homework.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PragatiMark } from './PragatiMark';

const STORAGE_KEY = 'pragati-tour-v9';

type Step = { title: string; body: string; ctaLabel: string; ctaHref: string };

function stepForRole(role: string): Step {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;

  if (isAdmin) {
    return {
      title: 'Create a team',
      body: 'Teams own projects and people. Start with the group you manage — everything else hangs off it.',
      ctaLabel: 'Create a team',
      ctaHref: '/teams',
    };
  }

  if (isLead) {
    return {
      title: 'Open your projects',
      body: 'Projects are where work lives. Put one task on someone with a date. Live in the due list.',
      ctaLabel: 'Open projects',
      ctaHref: '/projects',
    };
  }

  return {
    title: 'See your work',
    body: 'Assigned tasks show on the dashboard. Open My Day for your private list. Finish one thing today.',
    ctaLabel: 'Open My Day',
    ctaHref: '/my-day',
  };
}

function roleLabel(role: string): string {
  if (role === 'admin' || role === 'master_admin') return 'Admin';
  if (role === 'lead') return 'Team Lead';
  return 'Contributor';
}

export function FirstTimeTour({
  alreadySeen = false,
  role = 'contributor',
}: {
  alreadySeen?: boolean;
  role?: string;
}) {
  const router = useRouter();
  const step = stepForRole(role);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (alreadySeen) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
      // Honor prior dismissals so we never re-trap returning users.
      for (const k of ['pragati-tour-v8', 'pragati-tour-v7', 'pragati-tour-v6']) {
        if (localStorage.getItem(k) === '1') {
          localStorage.setItem(STORAGE_KEY, '1');
          return;
        }
      }
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, [alreadySeen]);

  async function dismiss(go?: string) {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
      localStorage.setItem('pragati-tour-v8', '1');
      localStorage.setItem('pragati-tour-v7', '1');
      localStorage.setItem('pragati-tour-v6', '1');
    } catch {
      /* private mode */
    }
    try {
      await api('/me/tour-seen', { method: 'POST' });
    } catch {
      /* non-blocking */
    }
    if (go) router.push(go);
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div
        className="w-full max-w-[400px] bg-white dark:bg-[#0c0a09] border border-[#e7e5e4] dark:border-[#292524] shadow-2xl overflow-hidden"
        style={{ borderRadius: 16 }}
      >
        <div className="h-1 bg-[var(--mars)]" />
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <PragatiMark size={36} flat />
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--mars)]">
                  {roleLabel(role)}
                </p>
                <h2
                  id="tour-title"
                  className="text-[20px] font-bold text-[#0f1419] dark:text-[#e7e9ea] tracking-tight leading-tight"
                >
                  {step.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismiss()}
              className="shrink-0 p-1.5 rounded-full text-[#71767b] hover:bg-[rgba(15,20,25,0.06)] dark:hover:bg-white/10"
              aria-label="Skip"
            >
              <X size={18} />
            </button>
          </div>
          <p className="text-[15px] text-[#536471] dark:text-[#a8a29e] leading-relaxed">{step.body}</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              type="button"
              onClick={() => dismiss(step.ctaHref)}
              className="btn-primary justify-center px-5 py-2.5 text-[14px] font-bold"
            >
              {step.ctaLabel} <ArrowRight size={15} />
            </button>
            <button
              type="button"
              onClick={() => dismiss()}
              className="text-[13px] font-semibold text-[#71767b] hover:text-[#0f1419] dark:hover:text-white px-2 py-2"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
