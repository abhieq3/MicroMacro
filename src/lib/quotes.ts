/**
 * Login lines — short, plain, about shipping hard work and clear schedules.
 * No name is shown on screen. Bump the ledger key on the login page when
 * you re-curate this list.
 */

export interface Quote {
  text: string;
  author: string;
}

const E = 'work';

export const BUILTIN_QUOTES: Quote[] = [
  { text: 'The only rules are the ones dictated by the laws of physics. Everything else is a recommendation.', author: E },
  { text: 'If something is important enough, you do it even if the odds are not in your favor.', author: E },
  { text: 'I think it is possible for ordinary people to choose to be extraordinary.', author: E },
  { text: 'When something is important enough, you do it even if the odds are against you.', author: E },
  { text: 'Persistence is very important. You should not give up unless you are forced to give up.', author: E },
  { text: 'Some people don’t like change, but you need to embrace change if the alternative is disaster.', author: E },
  { text: 'Constantly seek criticism. A well thought out critique of whatever you’re doing is as valuable as gold.', author: E },
  { text: 'I could either watch it happen or be a part of it.', author: E },
  { text: 'Work like hell. I mean you just have to put in 80 to 100 hour weeks every week.', author: E },
  { text: 'If you get up in the morning and think the future is going to be better, it is a bright day.', author: E },
  { text: 'People work better when they know what the goal is and why.', author: E },
  { text: 'The first step is to establish that something is possible; then probability will occur.', author: E },
  { text: 'Any product that needs a manual to work is broken.', author: E },
  { text: 'Make your meetings as short as possible. If a meeting isn’t useful, leave or cancel it.', author: E },
  { text: 'Walk out of a meeting or drop off a call as soon as it is obvious you aren’t adding value.', author: E },
  { text: 'Avoid large meetings. Extreme is a meeting of two people.', author: E },
  { text: 'Delete any part or process you can. If you do not end up adding back at least 10%, you did not delete enough.', author: E },
  { text: 'The path to the CEO’s office should not be through the CFO’s office, and it should not be through the marketing department. It needs to be through engineering and design.', author: E },
  { text: 'You get paid in direct proportion to the difficulty of problems you solve.', author: E },
  { text: 'Focus on signal over noise. Too many things open is how nothing finishes.', author: E },
  { text: 'Hard work is a force multiplier. Apply it to the few things that matter.', author: E },
  { text: 'A maniacal sense of urgency is our operating principle.', author: E },
  { text: 'If you are not failing, you are not innovating enough.', author: E },
  { text: 'Going from idea to working product is the only progress that counts.', author: E },
  { text: 'Optimize for the machine that builds the machine — process that ships.', author: E },
];

/** Deterministic daily offset so SSR and first paint match. */
export function dailyQuoteOffset(count: number): number {
  if (count <= 0) return 0;
  const d = new Date();
  const key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return key % count;
}

/** Rough reading time in ms for a quote line. */
export function readingMs(text: string): number {
  const words = Math.max(8, text.trim().split(/\s+/).length);
  return Math.min(12000, Math.max(4500, words * 420));
}
