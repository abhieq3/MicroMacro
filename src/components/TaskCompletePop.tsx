'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Sparkles } from 'lucide-react';
import { hapticSuccess, hapticVictory } from '@/lib/haptics';

/**
 * Everyday task-complete ack + light sparkle.
 * Project-clear gets a stronger line + victory haptic (full confetti is
 * Celebration on the project board — here we still mark the moment).
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

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const SPARKLE_COLORS = ['#10b981', '#34d399', '#1565C0', '#60a5fa', '#fbbf24', '#2E7D32'];

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
    if (task.projectClear) hapticVictory();
    else hapticSuccess();
    const ms = task.projectClear || task.clearedLastOverdue ? 2800 : 1700;
    const t = setTimeout(() => onDone(), ms);
    return () => clearTimeout(t);
  }, [task, onDone]);

  const microSparkles = useMemo(() => {
    if (!task || typeof window === 'undefined') return [];
    if (prefersReducedMotion()) return [];
    const n = task.projectClear ? 22 : 12;
    return Array.from({ length: n }, (_, i) => ({
      id: i,
      left: 4 + Math.random() * 92,
      delay: Math.random() * 0.28,
      duration: 0.85 + Math.random() * 0.7,
      size: 4 + Math.random() * 5,
      color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
      dx: (Math.random() - 0.5) * 56,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.projectClear]);

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
      {/* Micro sparkles from the toast */}
      {microSparkles.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-visible" aria-hidden>
          {microSparkles.map((s) => (
            <span
              key={s.id}
              className="task-sparkle absolute bottom-full rounded-full"
              style={{
                left: `${s.left}%`,
                width: s.size,
                height: s.size,
                background: s.color,
                boxShadow: `0 0 4px ${s.color}`,
                animation: `task-sparkle-up ${s.duration}s ease-out ${s.delay}s both`,
                // Horizontal drift for sparkle particles
                ['--spark-dx' as any]: `${s.dx}px`,
              }}
            />
          ))}
        </div>
      )}
      <div
        className={`relative flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-lg ${
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
          {task.projectClear ? (
            <Sparkles size={12} strokeWidth={2.5} />
          ) : (
            <Check size={13} strokeWidth={2.5} />
          )}
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
