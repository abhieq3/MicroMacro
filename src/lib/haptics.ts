/**
 * Haptic feedback via the Vibration API. Progressive enhancement —
 * works on most Android browsers, silently ignored on iOS Safari and desktop.
 * Honours localStorage mute and prefers-reduced-motion.
 */

function allowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  if (localStorage.getItem('pragati-haptics') === 'off') return false;
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  } catch {
    /* matchMedia unavailable — proceed */
  }
  return true;
}

/** Single light tick — taps, toggles, kanban drops. */
export function hapticTap() {
  if (!allowed()) return;
  try {
    navigator.vibrate(10);
  } catch {
    /* ignore */
  }
}

/** Short double-buzz — everyday task complete / save. */
export function hapticSuccess() {
  if (!allowed()) return;
  try {
    navigator.vibrate([14, 40, 22]);
  } catch {
    /* ignore */
  }
}

/** Phase clear — richer pulse (earned, not routine). */
export function hapticCelebrate() {
  if (!allowed()) return;
  try {
    navigator.vibrate([16, 45, 22, 45, 36]);
  } catch {
    /* ignore */
  }
}

/** Whole project complete — the big one. Longer, stepped pattern. */
export function hapticVictory() {
  if (!allowed()) return;
  try {
    navigator.vibrate([20, 40, 20, 40, 28, 50, 45, 70, 70]);
  } catch {
    /* ignore */
  }
}
