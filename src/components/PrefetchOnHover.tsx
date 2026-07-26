'use client';

/**
 * Aggressive hover/focus prefetch for every in-app <a>.
 *
 * Next.js Link prefetches in-viewport links, but secondary routes (deep
 * project/task URLs that appear in lists) only become "warm" after this
 * hover touch. pointerdown is even earlier than click — pairs with
 * NavigationProgress for a speed-of-light feel.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const warmed = new Set<string>();

export function PrefetchOnHover() {
  const router = useRouter();

  useEffect(() => {
    const warm = (href: string) => {
      if (!href || warmed.has(href)) return;
      // Strip hash; Next prefetch is path+search.
      const clean = href.split('#')[0];
      if (!clean.startsWith('/')) return;
      warmed.add(clean);
      try {
        router.prefetch(clean);
      } catch {
        /* ignore */
      }
    };

    const fromEvent = (e: Event) => {
      const t = e.target as Element | null;
      if (!t) return;
      const a = t.closest('a');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//')) return;
      if (a.target === '_blank') return;
      warm(href);
    };

    // pointerover bubbles (pointerenter does not) — required for document capture.
    document.addEventListener('pointerover', fromEvent, true);
    document.addEventListener('focusin', fromEvent, true);
    // Touch devices: first touch warms before the click navigates.
    document.addEventListener('touchstart', fromEvent, { capture: true, passive: true });

    return () => {
      document.removeEventListener('pointerover', fromEvent, true);
      document.removeEventListener('focusin', fromEvent, true);
      document.removeEventListener('touchstart', fromEvent, true);
    };
  }, [router]);

  return null;
}
