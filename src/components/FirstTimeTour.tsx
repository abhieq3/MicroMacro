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
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(91, 112, 131, 0.4)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div
        className="w-full max-w-[380px] border border-[#2f3336] bg-black overflow-hidden relative"
        style={{ borderRadius: 16 }}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[#2f3336] flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void dismiss()}
            className="absolute top-3 right-3 p-1.5 text-[#71767b] hover:text-[#e7e9ea] hover:bg-[rgba(231,233,234,0.1)]"
            aria-label="Close"
            style={{ borderRadius: 9999 }}
          >
            <X size={18} />
          </button>
          <PragatiMark size={28} flat />
          <span className="brand-wordmark text-[17px] text-[#e7e9ea]">Pragati</span>
        </div>

        <div className="px-5 py-5">
          <h2
            id="first-login-title"
            className="text-[20px] font-bold text-[#e7e9ea] tracking-tight"
          >
            {hint.headline}
          </h2>
          <p className="mt-2 text-[15px] text-[#71767b] leading-relaxed">{hint.body}</p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void dismiss(hint.ctaHref)}
              className="btn-primary w-full justify-center py-3 text-[15px]"
            >
              {hint.ctaLabel}
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="w-full py-2.5 text-[15px] font-bold text-[#1d9bf0] hover:underline transition-colors"
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
