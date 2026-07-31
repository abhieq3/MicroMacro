'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

/**
 * Quiet task-close ack — Naval/Jensen: no status theater.
 * One factual line. No gradient confetti, no pep pairing, no dual lines.
 */

function leadIn(task: {
  title?: string;
  taskType?: string;
  gxpCritical?: boolean;
  priority?: string;
}) {
  const tt = task.taskType;
  if (tt === 'review' || tt === 'data_review') return 'Reviewed';
  if (tt === 'approval') return 'Approved';
  if (tt === 'test') return 'Test passed';
  if (tt === 'deviation') return 'Deviation closed';
  if (tt === 'capa') return 'CAPA closed';
  if (tt === 'audit_finding') return 'Finding resolved';
  if (task.gxpCritical || task.priority === 'critical') return 'Critical work closed';
  return 'Closed';
}

export function TaskCompletePop({
  task,
  onDone,
}: {
  task: {
    id: string;
    title?: string;
    taskType?: string;
    gxpCritical?: boolean;
    priority?: string;
  } | null;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!task) return;
    const t = setTimeout(() => onDone(), 1800);
    return () => clearTimeout(t);
  }, [task, onDone]);

  if (!task || !mounted) return null;

  const head = leadIn(task);
  const title = (task.title || '').trim();

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[1000] right-4 bottom-4 max-w-[300px] cursor-pointer"
      onClick={() => onDone()}
    >
      <div
        className="flex items-start gap-2.5 rounded-2xl border border-slate-200/90 dark:border-[#2f3336] bg-white dark:bg-[#262624] px-3.5 py-2.5 shadow-lg"
        style={{ animation: 'fade-in-soft-2 0.18s ease-out both' }}
      >
        <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
          <Check size={13} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-800 dark:text-white/90 leading-snug">{head}</div>
          {title && (
            <div className="text-[11px] text-slate-500 dark:text-white/40 leading-snug truncate mt-0.5">
              {title}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
