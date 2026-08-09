'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

/**
 * Jensen Huang ack — speed of light, no theater.
 *
 * One factual line. No confetti, no pep, no dual motivational copy.
 * Everyday close: verb from the work type.
 * Rare milestone: project board is clear (last open task closed).
 * That is the only "surprise" — earned by finishing the real work.
 */

export type CompleteAck = {
  id: string;
  title?: string;
  taskType?: string;
  gxpCritical?: boolean;
  priority?: string;
  /** Server: no open tasks left on a real (non-system) project. */
  projectClear?: boolean;
  projectName?: string | null;
  /** Last overdue exception on the personal list just closed. */
  clearedLastOverdue?: boolean;
};

function leadIn(task: CompleteAck): string {
  // Milestone first — rare, so it earns a different sentence.
  if (task.projectClear) return 'Project clear';
  if (task.clearedLastOverdue) return 'Exceptions clear';

  const tt = task.taskType;
  if (tt === 'review' || tt === 'data_review') return 'Reviewed';
  if (tt === 'approval') return 'Approved';
  if (tt === 'test') return 'Test passed';
  if (tt === 'deviation' || tt === 'issue') return 'Closed';
  if (tt === 'capa' || tt === 'corrective_action') return 'CAPA closed';
  if (tt === 'audit_finding' || tt === 'finding') return 'Finding resolved';
  if (task.gxpCritical || task.priority === 'critical') return 'Critical closed';
  return 'Done';
}

function subLine(task: CompleteAck): string {
  if (task.projectClear) {
    const name = (task.projectName || '').trim();
    return name || (task.title || '').trim();
  }
  if (task.clearedLastOverdue) return 'Nothing late on your list.';
  return (task.title || '').trim();
}

export function TaskCompletePop({
  task,
  onDone,
}: {
  task: CompleteAck | null;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!task) return;
    // Milestone holds a beat longer — still short. Ordinary closes vanish faster.
    const ms = task.projectClear || task.clearedLastOverdue ? 2200 : 1400;
    const t = setTimeout(() => onDone(), ms);
    return () => clearTimeout(t);
  }, [task, onDone]);

  if (!task || !mounted) return null;

  const head = leadIn(task);
  const sub = subLine(task);
  const milestone = !!(task.projectClear || task.clearedLastOverdue);

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[1000] right-4 bottom-4 max-w-[300px] cursor-pointer"
      onClick={() => onDone()}
    >
      <div
        className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-lg ${
          milestone
            ? 'border-emerald-200/90 dark:border-emerald-500/25 bg-white dark:bg-[#262624]'
            : 'border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#262624]'
        }`}
        style={{ animation: 'fade-in-soft-2 0.15s ease-out both' }}
      >
        <span
          className={`mt-0.5 grid h-6 w-6 place-items-center rounded-full shrink-0 ${
            milestone
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200'
              : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <Check size={13} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-800 dark:text-white/90 leading-snug tracking-tight">
            {head}
          </div>
          {sub && (
            <div className="text-[11px] text-slate-500 dark:text-white/40 leading-snug truncate mt-0.5">
              {sub}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
