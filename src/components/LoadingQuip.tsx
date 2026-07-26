'use client';
import { useEffect, useState } from 'react';

/**
 * One quiet line under loading skeletons — calm, not carnival.
 * Naval lens: no busyness theater; just signal that the system is working.
 */

const QUIPS = [
  'loading what matters…',
  'sorting signal from noise…',
  'fetching the real work…',
  'checking what moved…',
  'one moment…',
  'lining up priorities…',
];

export const QUIP_NAME_KEY = 'pragati-quip-name';

export function LoadingQuip() {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const name = (localStorage.getItem(QUIP_NAME_KEY) || '').trim();
    const quip = QUIPS[Math.floor(Date.now() / 60_000) % QUIPS.length];
    setLine(name ? `${name} — ${quip}` : quip);
  }, []);

  if (!line) return null;
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-white/30 select-none">
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400/80" />
      {line}
    </div>
  );
}
