/**
 * Feature flags.
 *
 * Mission: the work board for everyone — projects, tasks, owners, dates, blockers.
 * Core always on: Today · Projects · Teams · Capture · admin.
 *
 * Secondary chrome is opt-in. Defaults ship the machine, not the museum.
 *
 *   NEXT_PUBLIC_FOCUS_MODE=1           — force core-only
 *   NEXT_PUBLIC_WHITEBOARD_ENABLED=0   — hide Capture board FAB
 *   NEXT_PUBLIC_WORKBENCH_MODULES=1    — team trackers / tickets
 *   NEXT_PUBLIC_SCRATCHPAD_ENABLED=1   — notes FAB
 *   NEXT_PUBLIC_BIRDS_EYE_ENABLED=1    — bird's-eye power map
 */

function envOn(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function envOff(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no';
}

/** Mission-first mode — strip secondary surfaces. */
export const FOCUS_MODE = envOn('NEXT_PUBLIC_FOCUS_MODE');

/**
 * Private whiteboard FAB on Capture. On by default (thinking tool, not nav).
 * Opt out with NEXT_PUBLIC_WHITEBOARD_ENABLED=0.
 */
export const WHITEBOARD_ENABLED = !FOCUS_MODE && !envOff('NEXT_PUBLIC_WHITEBOARD_ENABLED');

/**
 * Team workbench modules (tickets, tracker sheets). Off by default.
 */
export const WORKBENCH_MODULES_ENABLED =
  !FOCUS_MODE && envOn('NEXT_PUBLIC_WORKBENCH_MODULES');

/**
 * Scratchpad / sticky notes — opt-in only.
 */
export const SCRATCHPAD_ENABLED = !FOCUS_MODE && envOn('NEXT_PUBLIC_SCRATCHPAD_ENABLED');

/**
 * Bird's-eye power map — opt-in. Not the morning path.
 */
export const BIRDS_EYE_ENABLED = !FOCUS_MODE && envOn('NEXT_PUBLIC_BIRDS_EYE_ENABLED');
