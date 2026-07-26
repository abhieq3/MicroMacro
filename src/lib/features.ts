/**
 * Launch / focus feature flags.
 *
 * First principle: the product mission is the morning decision — open Pragati
 * and act on the highest-leverage work. Secondary workbench tools are real and
 * valuable, but they dilute first paint and first impression when everything is
 * on by default.
 *
 * Flags are NEXT_PUBLIC_ so client components (nav, panels) and server code
 * share the same answer. Defaults preserve today's behaviour unless FOCUS MODE
 * is turned on.
 *
 *   NEXT_PUBLIC_FOCUS_MODE=1
 *     Hides secondary personal/workbench surfaces so the mission loop stays
 *     sharp: Dashboard · Projects · Teams · My Day · (admin) People/Audit.
 *
 * Per-surface overrides (only consulted when focus mode is off, except
 * scratchpad which stays opt-in):
 *   NEXT_PUBLIC_WHITEBOARD_ENABLED=0     hide whiteboard
 *   NEXT_PUBLIC_WORKBENCH_MODULES=0      hide tickets / CSV-QMS entry points
 *   NEXT_PUBLIC_SCRATCHPAD_ENABLED=1     enable scratchpad (off by default)
 */

function envOn(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function envOff(name: string): boolean {
  const v = (process.env[name] || '').trim().toLowerCase();
  return v === '0' || v === 'false' || v === 'no';
}

/** Mission-first mode — strip secondary surfaces from nav and team panels. */
export const FOCUS_MODE = envOn('NEXT_PUBLIC_FOCUS_MODE');

/**
 * Full-page whiteboard (personal thinking canvas). On by default; off in
 * focus mode or when explicitly disabled.
 */
export const WHITEBOARD_ENABLED =
  !FOCUS_MODE && !envOff('NEXT_PUBLIC_WHITEBOARD_ENABLED');

/**
 * Team workbench modules (tickets, CSV activity / QMS sheets). On by default;
 * off in focus mode. Individual teams still gate via `team.modules.*.enabled`.
 */
export const WORKBENCH_MODULES_ENABLED =
  !FOCUS_MODE && !envOff('NEXT_PUBLIC_WORKBENCH_MODULES');

/**
 * Scratchpad / sticky notes workbench — opt-in only (launch default off).
 */
export const SCRATCHPAD_ENABLED = envOn('NEXT_PUBLIC_SCRATCHPAD_ENABLED');
