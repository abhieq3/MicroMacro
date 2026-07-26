'use client';
import { Whiteboard } from '@/components/Whiteboard';
import { PenLine } from 'lucide-react';

/**
 * Full-page whiteboard — personal thinking room.
 *
 * Jensen’s operating habit: if you can’t put it on a board, you don’t
 * understand it. This page is for that moment — before slides, before status
 * updates. Templates on the canvas do the teaching; the chrome stays minimal.
 */
export default function WhiteboardPageClient() {
  return (
    <div className="flex flex-col h-[calc(100vh-72px)] min-h-[540px] max-w-[1440px]">
      <div className="mb-2.5 shrink-0 flex items-start sm:items-center gap-2 min-w-0 flex-wrap">
        <PenLine size={13} className="text-slate-400 dark:text-white/30 shrink-0 mt-0.5 sm:mt-0" />
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-white/40 shrink-0">
          Whiteboard
        </span>
        <span className="text-slate-300 dark:text-white/15 shrink-0 hidden sm:inline">·</span>
        <span className="text-[12px] text-slate-400 dark:text-white/35 font-medium min-w-0">
          First principles. Blockers. Decisions. Delivery path. Private — wipe when done.
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <Whiteboard />
      </div>
    </div>
  );
}
