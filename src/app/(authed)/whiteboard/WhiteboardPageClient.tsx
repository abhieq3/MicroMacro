'use client';
import { Whiteboard } from '@/components/Whiteboard';

/**
 * Private sketch surface — personal, not shared team records.
 * Optional tool for planning; tracked work still lives on projects/tasks.
 */
export default function WhiteboardPageClient() {
  return (
    <div className="flex flex-col h-[calc(100vh-72px)] min-h-[540px] max-w-[1440px]">
      <div className="mb-3 shrink-0 px-0.5">
        <h1 className="text-[20px] font-bold text-[#0f1419] dark:text-[#e7e9ea] tracking-tight">
          Whiteboard
        </h1>
        <p className="text-[13px] text-[#536471] dark:text-[#71767b] mt-0.5">
          Private. Only you see this. Use it to sketch plans — not to track assigned work.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <Whiteboard />
      </div>
    </div>
  );
}
