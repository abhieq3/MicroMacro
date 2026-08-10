'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { AlertTriangle, X } from 'lucide-react';

/**
 * Factory-grade "who is blocking?" dialog.
 * Replaces window.prompt — works on mobile, accessible, no browser chrome.
 */

const SUGGESTIONS = ['Vendor', 'Decision', 'Part', 'Test', 'Another team', 'Approval'];

export function BlockerPromptModal({
  initial = '',
  taskTitle,
  onConfirm,
  onCancel,
}: {
  initial?: string;
  taskTitle?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const t = value.trim().slice(0, 120);
    if (!t) {
      inputRef.current?.focus();
      return;
    }
    onConfirm(t);
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blocker-prompt-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-[2px]"
          aria-label="Cancel"
          onClick={onCancel}
        />
        <form
          onSubmit={submit}
          className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#262624] shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          style={{ animation: 'modal-in 0.18s ease-out both' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
              <AlertTriangle size={18} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                id="blocker-prompt-title"
                className="text-[15px] font-bold text-slate-900 dark:text-white/95 tracking-tight"
              >
                Name the blocker
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-white/45 mt-0.5 leading-snug">
                Blocked without a cause is a lie.
                {taskTitle ? (
                  <>
                    {' '}
                    <span className="font-semibold text-slate-600 dark:text-white/60">“{taskTitle}”</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Waiting on
          </label>
          <input
            ref={inputRef}
            className="input text-sm w-full"
            placeholder="Person, team, part, decision…"
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
          />

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValue(s)}
                className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="btn-primary flex-1 justify-center text-sm disabled:opacity-50"
            >
              Mark blocked
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

/**
 * Promise-based blocker request for status transitions.
 * Returns existing pendingWith if set; otherwise opens the modal.
 */
export function useBlockerPrompt() {
  const [open, setOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState<string | undefined>();
  const resolveRef = useRef<((v: string | null) => void) | null>(null);

  const requestBlocker = useCallback((existing?: string | null, title?: string) => {
    const have = String(existing || '').trim();
    if (have) return Promise.resolve(have);
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve;
      setTaskTitle(title);
      setOpen(true);
    });
  }, []);

  const finish = useCallback((v: string | null) => {
    setOpen(false);
    const r = resolveRef.current;
    resolveRef.current = null;
    r?.(v);
  }, []);

  const ui = open ? (
    <BlockerPromptModal
      taskTitle={taskTitle}
      onConfirm={(v) => finish(v)}
      onCancel={() => finish(null)}
    />
  ) : null;

  return { requestBlocker, blockerPromptUI: ui };
}
