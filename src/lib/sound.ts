/**
 * Tiny sound effects using the Web Audio API — no asset files needed.
 * Calls are no-ops on the server and gracefully no-op if the browser
 * blocks audio (e.g. user hasn't interacted yet).
 */

import { hapticTap, hapticSuccess, hapticCelebrate } from './haptics';

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

/** Soft two-tone chime — for task / project completion. */
export function playSuccessChime() {
  const c = getCtx();
  if (!c) return;
  try {
    // Resume if suspended (autoplay policy)
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

/** Read user preference — defaults to enabled. */
export function soundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('pragati-sound') !== 'off';
}

/** Plays the chime only when the user hasn't muted sounds. */
export function chimeIfEnabled() {
  if (soundEnabled()) playSuccessChime();
  // Pair a subtle haptic with the success cue — coupled here so every existing
  // chime call site gets tactile feedback for free.
  hapticSuccess();
}

/**
 * Milestone fanfare — a brief ascending major arpeggio (C–E–G–C) for the big
 * moments: a completed phase or a finished project. Distinct from the everyday
 * two-tone chime so a milestone *feels* like one. Pairs with a richer haptic.
 */
export function playFanfare() {
  hapticCelebrate();
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.16 }, // C5
      { freq: 659.25, start: 0.1, dur: 0.16 }, // E5
      { freq: 783.99, start: 0.2, dur: 0.18 }, // G5
      { freq: 1046.5, start: 0.32, dur: 0.34 }, // C6
    ];
    for (const n of notes) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.start);
      gain.gain.linearRampToValueAtTime(0.09, now + n.start + 0.02);
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
 * Short "thunk" played after a successful drag-and-drop (kanban moves, dashboard
 * task reorders). Different tone from the success chime so the two events stay
 * distinguishable. Honours both the global localStorage mute and the server-side
 * `soundDropEnabled` preference passed in by the caller.
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
    // Quick descending sweep so it reads as "drop", not "ping".
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
