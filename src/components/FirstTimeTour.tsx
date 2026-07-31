'use client';

/**
 * First login — one card, one action. No multi-step tour.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PragatiMark } from './PragatiMark';

const STORAGE_KEY = 'pragati-tour-v7';

type RoleHint = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

function hintForRole(role: string): RoleHint {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;

  if (isAdmin) {
    return {
      headline: 'Start here',
      body: 'Create a team. Then add people and a project.',
      ctaLabel: 'Create a team',
      ctaHref: '/teams',
    };
  }
  if (isLead) {
    return {
      headline: 'Start here',
      body: 'Open a project and assign work. My Day is private to you.',
      ctaLabel: 'Projects',
      ctaHref: '/projects',
    };
  }
  return {
    headline: 'Start here',
    body: 'Assigned work shows on the dashboard. Use My Day to plan.',
    ctaLabel: 'My Day',
    ctaHref: '/my-day',
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
      if (localStorage.getItem('pragati-tour-v6') === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        return;
      }
    } catch {
      /* private mode */
    }
    const t = window.setTimeout(() => setOpen(true), 280);
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
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div
        className="w-full max-w-[380px] border border-white/12 bg-black overflow-hidden relative"
        style={{ borderRadius: 6 }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-white/10 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void dismiss()}
            className="absolute top-3 right-3 p-1.5 text-white/35 hover:text-white/80"
            aria-label="Close"
            style={{ borderRadius: 4 }}
          >
            <X size={15} />
          </button>
          <PragatiMark size={28} flat />
          <span className="brand-wordmark text-[17px] text-white">Pragati</span>
        </div>

        <div className="px-5 py-5">
          <h2
            id="first-login-title"
            className="text-lg font-bold text-white tracking-tight"
          >
            {hint.headline}
          </h2>
          <p className="mt-2 text-[13px] text-white/45 leading-relaxed">{hint.body}</p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void dismiss(hint.ctaHref)}
              className="btn-primary w-full justify-center py-2.5 text-[13px]"
            >
              {hint.ctaLabel}
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="w-full py-2 text-[12px] font-medium text-white/35 hover:text-white/70 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
