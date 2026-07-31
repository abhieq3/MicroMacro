'use client';

/**
 * Speed-of-light navigation feedback.
 *
 * Next.js App Router can take a beat on the server before `loading.tsx`
 * appears. This bar starts on the *first pointer down / click* of an
 * in-app link so the user always sees motion within a frame — Linear-style.
 * Completes when the pathname changes (or after a safety timeout).
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);
  const [done, setDone] = useState(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Complete the bar whenever the route settles.
  useEffect(() => {
    if (!active) return;
    setDone(true);
    const t = setTimeout(() => {
      setActive(false);
      setDone(false);
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search]);

  useEffect(() => {
    const isInternal = (a: HTMLAnchorElement) => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return false;
      }
      if (a.target === '_blank' || a.hasAttribute('download')) return false;
      try {
        const url = new URL(href, window.location.origin);
        return url.origin === window.location.origin;
      } catch {
        return href.startsWith('/');
      }
    };

    const start = () => {
      setDone(false);
      setActive(true);
      if (safetyRef.current) clearTimeout(safetyRef.current);
      // Never leave the bar stuck if navigation is cancelled.
      safetyRef.current = setTimeout(() => {
        setDone(true);
        setTimeout(() => {
          setActive(false);
          setDone(false);
        }, 180);
      }, 8000);
    };

    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || e.button !== 0) return;
      // Modified clicks open new tabs — don't fake progress.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = t.closest('a');
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      if (!isInternal(a)) return;
      const url = new URL(a.href, window.location.origin);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    };

    // Capture phase so we beat React handlers and show progress immediately.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] h-[2.5px] pointer-events-none overflow-hidden"
    >
      <div
        className="h-full rounded-r-full"
        style={{
          width: done ? '100%' : '70%',
          background: 'var(--text-primary)',
          transition: done
            ? 'width 140ms ease-out, opacity 160ms ease 40ms'
            : 'width 4s cubic-bezier(0.1, 0.05, 0, 1)',
          opacity: done ? 0 : 1,
          boxShadow: 'none',
        }}
      />
    </div>
  );
}
