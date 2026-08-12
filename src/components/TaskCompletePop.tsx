'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2 } from 'lucide-react';

/**
 * Task-completion micro-celebration — a small toast that pops in the
 * bottom-right corner when a task moves to "done". Deliberately minimal: no
 * confetti, no overlay. Just a personalised one-liner that recognises the
 * *kind* of task that was finished, so the encouragement reads as crafted
 * rather than generic.
 *
 * The phrase is picked deterministically from the task title + type, so a
 * given task always celebrates the same way — no randomness that would feel
 * gimmicky on a regulated tool.
 */

// Short, varied encouragement lines. Each task picks one deterministically
// from a stable hash of its id, so the same task always reads the same way.
const LINES = [
  'You nailed it.',
  'Cleared.',
  'Shipped — clean.',
  'Off the board.',
  'Locked in.',
  'Done and dusted.',
  'Closed out.',
  'Top of the list.',
] as const;

// Type-specific lead-in. Picks a verb that matches what was actually closed —
// a review reads "Reviewed.", a CAPA reads "CAPA closed.", a plain task reads
// "Task done." — so the celebration feels like it noticed what you did.
function leadIn(task: { title?: string; taskType?: string; gxpCritical?: boolean; priority?: string }) {
  const tt = task.taskType;
  if (tt === 'review' || tt === 'data_review') return 'Reviewed.';
  if (tt === 'approval') return 'Approved.';
  if (tt === 'test') return 'Test passed.';
  if (tt === 'deviation') return 'Deviation closed.';
  if (tt === 'capa') return 'CAPA closed.';
  if (tt === 'audit_finding') return 'Finding resolved.';
  if (task.gxpCritical) return 'Critical work done.';
  if (task.priority === 'critical') return 'Critical task done.';
  if (task.priority === 'high') return 'High-priority task done.';
  return 'Task done.';
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function TaskCompletePop({
  task,
  onDone,
}: {
  task: { id: string; title?: string; taskType?: string; gxpCritical?: boolean; priority?: string } | null;
  onDone: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!task) return;
    setShow(true);
    // Slide out + unmount. 2.6s on screen is enough to read without lingering.
    const t1 = setTimeout(() => setShow(false), 2400);
    const t2 = setTimeout(() => onDone(), 2700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [task, onDone]);

  if (!task || !mounted) return null;

  const line = LINES[hash(task.id) % LINES.length];
  const head = leadIn(task);
  const title = (task.title || '').trim();

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed z-[1000] right-4 bottom-4 max-w-[320px] pointer-events-none"
      style={{
        transform: show ? 'translate3d(0,0,0)' : 'translate3d(120%,0,0)',
        opacity: show ? 1 : 0,
        transition: 'transform 0.34s cubic-bezier(0.22,1,0.36,1), opacity 0.24s ease',
      }}
    >
      <div
        className="rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-white shadow-xl"
        style={{
          background: 'linear-gradient(120deg, #15803d 0%, #16a34a 50%, #1565C0 100%)',
          boxShadow: '0 12px 30px rgba(15,23,42,0.22)',
        }}
      >
        <CheckCircle2 size={18} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-[12px] font-black leading-tight">
            {head} {line}
          </div>
          {title && <div className="text-[11px] text-white/80 leading-tight truncate mt-0.5">{title}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
