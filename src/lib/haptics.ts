/**
 * Minimal haptic feedback via the Vibration API. Progressive enhancement —
 * supported on most Android browsers, silently ignored on iOS Safari and
 * desktop. Honours a localStorage mute (shared spirit with the sound pref) and
 * the OS "reduce motion" setting, so it never becomes a nuisance.
 *
 * Kept deliberately tiny: a tap for routine confirmations, a richer pattern for
 * milestones. Calls are no-ops on the server.
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

/** A single light tick — for taps, toggles, drops. */
export function hapticTap() {
  if (!allowed()) return;
  try {
    navigator.vibrate(10);
  } catch {
    /* ignore */
  }
}

/** A short double-buzz — for a completed task / saved record. */
export function hapticSuccess() {
  if (!allowed()) return;
  try {
    navigator.vibrate([14, 40, 22]);
  } catch {
    /* ignore */
  }
}

/** A celebratory pattern — reserved for milestones (phase / project complete). */
export function hapticCelebrate() {
  if (!allowed()) return;
  try {
    navigator.vibrate([18, 50, 24, 50, 38]);
  } catch {
    /* ignore */
  }
}
