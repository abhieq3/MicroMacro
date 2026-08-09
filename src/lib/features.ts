/**
 * Feature flags.
 *
 * Mission: track team work — projects, tasks, due dates, ownership.
 *
 *   NEXT_PUBLIC_FOCUS_MODE=1
 *     Core only: Dashboard · Projects · Teams · My Day · admin.
 *
 * Optional surfaces:
 *   NEXT_PUBLIC_WHITEBOARD_ENABLED=0  — hide My Day board FAB
 *   NEXT_PUBLIC_WORKBENCH_MODULES=0
 *   NEXT_PUBLIC_SCRATCHPAD_ENABLED=1
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
 * Private whiteboard FAB on My Day (Jensen thinking board — not a nav item).
 * On by default. Opt out with NEXT_PUBLIC_WHITEBOARD_ENABLED=0.
 */
export const WHITEBOARD_ENABLED = !envOff('NEXT_PUBLIC_WHITEBOARD_ENABLED');

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
