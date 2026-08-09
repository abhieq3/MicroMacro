/**
 * Tiny sound effects using the Web Audio API — no asset files needed.
 * Calls are no-ops on the server and gracefully no-op if the browser
 * blocks audio (e.g. user hasn't interacted yet).
 *
 * Haptics are paired at the call sites that own the UX moment (Celebration,
 * TaskCompletePop, drop tick) so sound + vibration stay in one place per event.
 */

import { hapticTap } from './haptics';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  try {
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Soft two-tone chime — everyday task complete. */
export function playSuccessChime() {
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();

    const now = c.currentTime;
    const notes = [
      { freq: 660, start: 0, dur: 0.12 }, // E5
      { freq: 880, start: 0.1, dur: 0.18 }, // A5
    ];
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.08, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  } catch {
    /* ignore */
  }
}

/** Read user preference — defaults to OFF. */
export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('pragati-sound') === 'on';
}

/**
 * Everyday success cue. Haptic is owned by TaskCompletePop / callers that
 * show UI; this only chimes when sound is on.
 */
export function chimeIfEnabled() {
  if (soundEnabled()) playSuccessChime();
}

/**
 * Phase fanfare — ascending C–E–G–C. Sound only; Celebration owns haptics.
 */
export function playFanfare() {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.18 }, // C5
      { freq: 659.25, start: 0.1, dur: 0.18 }, // E5
      { freq: 783.99, start: 0.2, dur: 0.2 }, // G5
      { freq: 1046.5, start: 0.34, dur: 0.4 }, // C6
    ];
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.12, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Project-complete victory — hard cascade. The rare moment.
 * Sound only; Celebration owns haptics.
 */
export function playVictory() {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.15 }, // C5
      { freq: 659.25, start: 0.08, dur: 0.15 }, // E5
      { freq: 783.99, start: 0.16, dur: 0.16 }, // G5
      { freq: 1046.5, start: 0.26, dur: 0.22 }, // C6
      { freq: 1318.5, start: 0.4, dur: 0.28 }, // E6
      { freq: 1568.0, start: 0.52, dur: 0.32 }, // G6
      { freq: 2093.0, start: 0.68, dur: 0.55 }, // C7 — peak
    ];
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.14, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Short "thunk" after a successful drag-and-drop. Pairs with a light haptic.
 */
export function playDropTick(enabled = true) {
  if (!enabled) return;
  hapticTap();
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch {
    /* ignore */
  }
}
