/**
 * Top 5 Things (T5T) — the NVIDIA practice, adopted whole.
 *
 * Everyone — newest contributor to admin — regularly writes the top five
 * things on their mind: what they're working on, what they're observing in
 * the work, where something feels early or wrong. Not a status report; a
 * snapshot of thinking. Leads read them to catch weak signals before they
 * become loud ones, and because the feed is open to the whole team, everyone
 * learns from everyone — why should only one person get to learn?
 *
 * One entry per person per ISO week, editable all week. The week key gives a
 * natural cadence without a scheduler: a new week simply presents a fresh,
 * empty list.
 *
 * Pure helpers only in this module — no models, no IO — so the week math is
 * unit-testable and shared by the API route and any future digest hook.
 */

/** ISO-8601 week key, e.g. "2026-W27". Weeks start Monday; week 1 contains
 *  the year's first Thursday (the standard ISO rule). */
export function isoWeekKey(now: Date = new Date()): string {
  // Work in UTC to keep the key stable regardless of server timezone.
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Shift to the Thursday of this week — its year is the ISO year.
  const day = d.getUTCDay() || 7; // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Normalize a submitted list: trim, drop empties, cap at five. */
export function normalizeTop5Items(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

/** How stale a feed entry may be before it drops out — covers "this week or
 *  last" so a Monday-morning reader still sees Friday's signals. */
export const FEED_MAX_AGE_DAYS = 14;
