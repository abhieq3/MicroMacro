'use client';

import { useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { X } from 'lucide-react';

/**
 * One sentence: what's stopping this task. Used whenever status becomes
 * blocked so the board never shows a red chip with no reason.
 */
export function BlockedCauseModal({
  taskTitle,
  initial = '',
  onCancel,
  onConfirm,
}: {
  taskTitle?: string;
  initial?: string;
  onCancel: () => void;
  onConfirm: (cause: string) => void;
}) {
  const [cause, setCause] = useState(initial);
  const ready = cause.trim().length > 0;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onCancel}>
        <form
          className="bg-white dark:bg-[#262624] rounded-2xl shadow-2xl border border-slate-100 dark:border-white/10 p-5 w-full max-w-modal-sm modal-in"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onConfirm(cause.trim());
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">What's blocking it?</div>
              {taskTitle && (
                <div className="text-xs text-slate-400 dark:text-white/40 mt-0.5 truncate">{taskTitle}</div>
              )}
            </div>
            <button type="button" onClick={onCancel} className="text-slate-300 hover:text-slate-500" aria-label="Cancel">
              <X size={16} />
            </button>
          </div>
          <input
            className="input text-sm"
            autoFocus
            maxLength={120}
            placeholder="e.g. Waiting on QA · missing spec · vendor"
            value={cause}
            onChange={(e) => setCause(e.target.value)}
          />
          <div className="flex items-center gap-2 mt-4">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center text-sm">
              Cancel
            </button>
            <button type="submit" disabled={!ready} className="btn-primary flex-1 justify-center text-sm">
              Block
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}
