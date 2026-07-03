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
    <div className="flex flex-col h-[calc(100vh-96px)] min-h-[520px] max-w-[1440px]">
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
            Whiteboard
          </span>
        </div>
        <h1 className="text-[1.7rem] font-black tracking-tight leading-tight text-slate-800 dark:text-white/90">
          <span suppressHydrationWarning>Think here first.</span>
        </h1>
        <div className="flex items-center gap-1.5 mt-1.5">
          <PenLine size={11} className="text-slate-400 dark:text-white/25 shrink-0" />
          <span className="text-[12px] text-slate-500 dark:text-white/40 font-medium" suppressHydrationWarning>
            {boardLine()}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Whiteboard />
      </div>
    </div>
  );
}
