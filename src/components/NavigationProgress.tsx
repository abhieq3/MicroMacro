'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Thin brand bar that runs on every in-app hop. Starts the instant a
 * same-origin link is clicked; finishes when the new pathname lands.
 * Feels like water, not a spinner.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const [wide, setWide] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const start = () => {
      if (hide.current) clearTimeout(hide.current);
      setOn(true);
      setWide(false);
      requestAnimationFrame(() => setWide(true));
    };
    window.addEventListener('pragati:nav-start', start);
    return () => window.removeEventListener('pragati:nav-start', start);
  }, []);

  useEffect(() => {
    if (!on) return;
    setWide(true);
    hide.current = setTimeout(() => {
      setOn(false);
      setWide(false);
    }, 220);
    return () => {
      if (hide.current) clearTimeout(hide.current);
    };
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[80] h-[2px] pointer-events-none overflow-hidden">
      <div
        className="h-full origin-left rounded-full"
        style={{
          width: wide ? '100%' : '18%',
          background: 'linear-gradient(90deg, #1565C0, #2E7D32)',
          transition: 'width 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
          boxShadow: '0 0 8px rgba(21,101,192,0.45)',
        }}
      />
    </div>
  );
}
