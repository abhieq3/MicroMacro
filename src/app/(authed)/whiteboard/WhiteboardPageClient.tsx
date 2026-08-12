'use client';
import { Whiteboard } from '@/components/Whiteboard';
import { PenLine } from 'lucide-react';

/**
 * Full-page whiteboard. One daily line of whiteboard philosophy up top —
 * rotated by day-of-year like My Day's encouragement, so the page greets you
 * differently through the week without ever repeating within a day.
 */
const BOARD_LINES = [
  'No slides. No deck. Markers and thinking.',
  'Start from a blank board — first principles, not last year’s plan.',
  'If you can’t draw it, you don’t understand it yet.',
  'Sketch the problem before you argue about the solution.',
  'Defend the idea in real time. The board keeps everyone honest.',
  'When the problem is solved, wipe it clean. Nothing here is precious.',
  'The best strategy meetings have exactly one tool. This is it.',
];

function boardLine() {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return BOARD_LINES[dayOfYear % BOARD_LINES.length];
}

export default function WhiteboardPageClient() {
  return (
    <div className="flex flex-col h-[calc(100vh-72px)] min-h-[540px] max-w-[1440px]">
      {/* Minimal header — one slim line, so the board gets the room. The daily
          philosophy line sits inline and quiet; the point is the canvas. */}
      <div className="mb-2.5 shrink-0 flex items-center gap-2 min-w-0">
        <PenLine size={13} className="text-slate-400 dark:text-white/30 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-white/40 shrink-0">
          Whiteboard
        </span>
        <span className="text-slate-300 dark:text-white/15 shrink-0">·</span>
        <span
          className="text-[12px] text-slate-400 dark:text-white/35 font-medium truncate min-w-0"
          suppressHydrationWarning
        >
          {boardLine()}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Whiteboard />
      </div>
    </div>
  );
}
