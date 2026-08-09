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
    navigator.vibrate(12);
  } catch {
    /* ignore */
  }
}

/** Everyday task complete — clear double-buzz. */
export function hapticSuccess() {
  if (!allowed()) return;
  try {
    navigator.vibrate([22, 35, 32]);
  } catch {
    /* ignore */
  }
}

/** Phase clear — punchy triple pulse. */
export function hapticCelebrate() {
  if (!allowed()) return;
  try {
    navigator.vibrate([28, 40, 35, 40, 45, 50, 55]);
  } catch {
    /* ignore */
  }
}

/**
 * Whole project complete — hard, stepped victory pattern.
 * Long enough to feel like a real finish (Android Vibration API).
 */
export function hapticVictory() {
  if (!allowed()) return;
  try {
    navigator.vibrate([35, 35, 35, 35, 45, 40, 55, 45, 70, 50, 90, 60, 110]);
  } catch {
    /* ignore */
  }
}
