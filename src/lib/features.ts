/**
 * Feature flags.
 *
 * Mission: the work board for everyone — projects, tasks, owners, dates, blockers.
 * Core always on: Today · Projects · Teams · My Day · admin.
 *
 * Secondary modules are opt-in. Earth (and Mars) defaults to the machine, not the chrome.
 *
 *   NEXT_PUBLIC_FOCUS_MODE=1           — force core-only (also kills workbench)
 *   NEXT_PUBLIC_WHITEBOARD_ENABLED=0   — hide My Day board FAB
 *   NEXT_PUBLIC_WORKBENCH_MODULES=1    — enable team trackers / tickets tabs
 *   NEXT_PUBLIC_SCRATCHPAD_ENABLED=1   — notes FAB on My Day
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
 * Private whiteboard FAB on My Day. On by default (thinking tool, not nav).
 * Opt out with NEXT_PUBLIC_WHITEBOARD_ENABLED=0.
 */
export const WHITEBOARD_ENABLED = !envOff('NEXT_PUBLIC_WHITEBOARD_ENABLED');

/**
 * Team workbench modules (tickets, tracker sheets). **Off by default** —
 * universal product ships the core board; teams that need trackers opt in
 * with NEXT_PUBLIC_WORKBENCH_MODULES=1. Also off in focus mode.
 */
export const WORKBENCH_MODULES_ENABLED =
  !FOCUS_MODE && envOn('NEXT_PUBLIC_WORKBENCH_MODULES');

/**
 * Scratchpad / sticky notes — opt-in only.
 */
export const SCRATCHPAD_ENABLED = envOn('NEXT_PUBLIC_SCRATCHPAD_ENABLED');
