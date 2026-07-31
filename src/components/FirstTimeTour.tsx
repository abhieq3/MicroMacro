'use client';

/**
 * First-session onboarding — role-specific steps that teach by doing.
 * IC / lead / admin each get a short checklist + one clear next action.
 * Dismissible forever after first completion or skip.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, X } from 'lucide-react';
import { api } from '@/lib/client/api';
import { PragatiMark } from './PragatiMark';

const STORAGE_KEY = 'pragati-tour-v8';

type Step = { title: string; body: string; ctaLabel: string; ctaHref: string };

function stepsForRole(role: string): Step[] {
  const isAdmin = role === 'admin' || role === 'master_admin';
  const isLead = role === 'lead' || isAdmin;

  if (isAdmin) {
    return [
      {
        title: 'Create a team',
        body: 'Teams own projects and people. Start with the group you manage.',
        ctaLabel: 'Create a team',
        ctaHref: '/teams',
      },
      {
        title: 'Add people',
        body: 'Invite teammates so work can be assigned. They only need an invite link.',
        ctaLabel: 'Open People',
        ctaHref: '/people',
      },
      {
        title: 'Start a project',
        body: 'Put work on the board. Add tasks, due dates, and owners.',
        ctaLabel: 'New project',
        ctaHref: '/projects/new',
      },
    ];
  }

  if (isLead) {
    return [
      {
        title: 'Open your projects',
        body: 'Projects are where work lives. Create one or open an existing board.',
        ctaLabel: 'Projects',
        ctaHref: '/projects',
      },
      {
        title: 'Assign a task',
        body: 'Pick a task, set an owner and date. It appears on their dashboard.',
        ctaLabel: 'Projects',
        ctaHref: '/projects',
      },
      {
        title: 'Watch Priority and Due',
        body: 'The dashboard surfaces overdue and next-up work for your team.',
        ctaLabel: 'Dashboard',
        ctaHref: '/',
      },
    ];
  }

  // Individual contributor
  return [
    {
      title: 'See your work',
      body: 'Assigned tasks show on the dashboard under Priority and Due.',
      ctaLabel: 'Dashboard',
      ctaHref: '/',
    },
    {
      title: 'Plan your day',
      body: 'My Day is private. Capture notes and personal tasks nobody else sees.',
      ctaLabel: 'My Day',
      ctaHref: '/my-day',
    },
    {
      title: 'Finish something',
      body: 'Open a task, update status, mark done. That is the whole loop.',
      ctaLabel: 'Dashboard',
      ctaHref: '/',
    },
  ];
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
  const steps = stepsForRole(role);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setMounted(true);
    if (alreadySeen) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
      // Honor prior dismissals so we never re-trap returning users.
      if (localStorage.getItem('pragati-tour-v7') === '1' || localStorage.getItem('pragati-tour-v6') === '1') {
        localStorage.setItem(STORAGE_KEY, '1');
        return;
      }
    } catch {
      /* private mode */
    }
    const t = window.setTimeout(() => setOpen(true), 320);
    return () => window.clearTimeout(t);
  }, [alreadySeen]);

  async function finish(go?: string) {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
      localStorage.setItem('pragati-tour-v7', '1');
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

  function next() {
    if (step < steps.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    void finish(steps[step].ctaHref);
  }

  if (!mounted || !open) return null;

  const current = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(91, 112, 131, 0.4)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-login-title"
    >
      <div
        className="w-full max-w-[420px] border border-[#2f3336] bg-black overflow-hidden relative"
        style={{ borderRadius: 16 }}
      >
        {/* Progress bar */}
        <div className="h-1 w-full bg-[#16181c]">
          <div
            className="h-full bg-[#1d9bf0] transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="px-5 pt-5 pb-3 border-b border-[#2f3336] flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void finish()}
            className="absolute top-4 right-3 p-1.5 text-[#71767b] hover:text-[#e7e9ea] hover:bg-[rgba(231,233,234,0.1)]"
            aria-label="Close"
            style={{ borderRadius: 9999 }}
          >
            <X size={18} />
          </button>
          <PragatiMark size={28} flat />
          <div className="min-w-0">
            <span className="brand-wordmark text-[17px] text-[#e7e9ea] block leading-none">Pragati</span>
            <span className="text-[12px] text-[#71767b] mt-0.5 block">
              {roleLabel(role)} · step {step + 1} of {steps.length}
            </span>
          </div>
        </div>

        <div className="px-5 py-5">
          {/* Step dots / checklist */}
          <ol className="mb-5 space-y-2">
            {steps.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={s.title}
                  className={`flex items-center gap-2.5 text-[13px] ${
                    active ? 'text-[#e7e9ea] font-bold' : done ? 'text-[#00ba7c]' : 'text-[#71767b]'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 place-items-center shrink-0 text-[11px] font-bold ${
                      done
                        ? 'bg-[#00ba7c] text-black'
                        : active
                          ? 'bg-[#e7e9ea] text-black'
                          : 'border border-[#2f3336] text-[#71767b]'
                    }`}
                    style={{ borderRadius: 9999 }}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={active ? '' : done ? 'line-through opacity-80' : ''}>{s.title}</span>
                </li>
              );
            })}
          </ol>

          <h2
            id="first-login-title"
            className="text-[20px] font-bold text-[#e7e9ea] tracking-tight"
          >
            {current.title}
          </h2>
          <p className="mt-2 text-[15px] text-[#71767b] leading-relaxed">{current.body}</p>

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                if (step < steps.length - 1) {
                  // Go do the action, keep tour marked seen so they aren't trapped,
                  // but they land on the right page.
                  void finish(current.ctaHref);
                } else {
                  void finish(current.ctaHref);
                }
              }}
              className="btn-primary w-full justify-center py-3 text-[15px]"
            >
              {current.ctaLabel}
              <ArrowRight size={16} />
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="w-full py-2.5 text-[15px] font-bold text-[#1d9bf0] hover:underline"
              >
                Next tip
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void finish()}
                className="w-full py-2.5 text-[15px] font-bold text-[#1d9bf0] hover:underline"
              >
                Got it
              </button>
            )}
            <button
              type="button"
              onClick={() => void finish()}
              className="w-full py-1.5 text-[13px] text-[#71767b] hover:text-[#e7e9ea]"
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
