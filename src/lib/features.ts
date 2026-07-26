/**
 * Feature flags — judgment over surface area (see docs/PRODUCT_PRINCIPLES.md).
 *
 * Mission: open Pragati and act on the highest-leverage work. Secondary
 * workbench tools are real, but they dilute attention when everything is on.
 *
 *   NEXT_PUBLIC_FOCUS_MODE=1
 *     Strip secondary surfaces: Dashboard · Projects · Teams · My Day · admin.
 *
 * Per-surface (when focus mode is off; scratchpad stays opt-in):
 *   NEXT_PUBLIC_WHITEBOARD_ENABLED=0
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
