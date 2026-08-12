'use client';
import { useEffect, useState } from 'react';

/**
 * One quiet, friendly line under the loading skeletons — fun without being a
 * carnival. Personalised with the viewer's first name when known (cached in
 * localStorage by the dashboard), deterministic per minute so rapid
 * navigations don't strobe through quips. Renders nothing until mounted, so
 * the server HTML stays stable.
 */

const QUIPS = [
  'lining up your day…',
  'counting what’s already done…',
  'sweeping dust off the kanban…',
  'brewing your morning brief…',
  'checking what moved overnight…',
  'sorting the urgent from the loud…',
  'fetching the fresh stuff…',
];

export const QUIP_NAME_KEY = 'pragati-quip-name';

export function LoadingQuip() {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const name = (localStorage.getItem(QUIP_NAME_KEY) || '').trim();
    const quip = QUIPS[Math.floor(Date.now() / 60_000) % QUIPS.length];
    setLine(name ? `One sec, ${name} — ${quip}` : `One sec — ${quip}`);
  }, []);

  if (!line) return null;
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-white/30 select-none animate-pulse">
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
      {line}
    </div>
  );
}
