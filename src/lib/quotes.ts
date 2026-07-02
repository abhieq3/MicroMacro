/**
 * Login-screen wisdom — curated to what Pragati is actually for: doing the
 * work. Every line speaks to building, shipping, focus, finishing, resilience,
 * ownership, and reasoning from first principles — not wealth, career, or
 * self-help in the abstract.
 *
 * Source: Jensen Huang — founder and CEO of NVIDIA — drawn from his own
 * documented words: keynotes, interviews, and his commencement / university
 * addresses (Stanford GSB, Caltech, NTU), where the themes of mission,
 * resilience, suffering, intellectual honesty, and acting with conviction
 * recur most clearly. Jensen only — no other voices in this library.
 *
 * Honesty about sourcing: these are well-known, widely-circulated lines chosen
 * for how cleanly they map to the work. Some are condensed or paraphrased from
 * longer remarks. That is acceptable here for one specific reason, and only
 * this reason:
 *
 *   Display rule: NO attribution is EVER rendered. The login page shows the
 *   line, never the name or the source. `author` is kept on the type purely as
 *   an internal curation/grouping key and is never surfaced in the UI. So the
 *   words stand alone as anonymous wisdom; the screen never claims "X said this."
 *
 * No-repeat rule: the login page rotates through a per-device shuffled queue
 * and never repeats a quote until the whole library is exhausted. Each quote
 * also stays on screen for a length of time proportional to how long it takes
 * to read (see `readingMs` on the login page), so longer lines aren't cut off.
 */

export interface Quote {
  text: string;
  author: string; // internal curation key only — never rendered
}

export const BUILTIN_QUOTES: Quote[] = [
  // ── Mission — why the work matters ────────────────────────────────────────
  { text: 'Run the company with the mission as the boss. The mission is the CEO.', author: 'Jensen Huang' },
  {
    text: 'Find something you love to do, then do it with all of your heart and the whole of your effort.',
    author: 'Jensen Huang',
  },
  {
    text: 'There is no reason to be the best in the world at something that does not matter. Pick something hard and worth doing.',
    author: 'Jensen Huang',
  },
  {
    text: 'Keep the main thing the main thing. Prioritize relentlessly — decide the most important thing, and do it.',
    author: 'Jensen Huang',
  },

  // ── Resilience and suffering — his signature theme ────────────────────────
  {
    text: 'Greatness is not intelligence. Greatness comes from character — and character is formed out of people who suffered.',
    author: 'Jensen Huang',
  },
  { text: 'I wish upon you ample doses of pain and suffering.', author: 'Jensen Huang' },
  { text: 'The single most important quality for success is resilience.', author: 'Jensen Huang' },
  {
    text: 'People with very high expectations have very low resilience — and resilience matters in success.',
    author: 'Jensen Huang',
  },
  { text: 'Nobody who did anything great did it the easy way. Suffering refines you.', author: 'Jensen Huang' },
  { text: 'You do not know you have grit until it is tested.', author: 'Jensen Huang' },

  // ── Urgency and paranoia — never coast ────────────────────────────────────
  { text: 'Our company is always thirty days from going out of business.', author: 'Jensen Huang' },
  { text: 'Hope is not a strategy.', author: 'Jensen Huang' },
  { text: 'Run toward the danger, not away from it.', author: 'Jensen Huang' },
  { text: 'Complacency is the enemy. Stay paranoid about what actually matters.', author: 'Jensen Huang' },
  { text: 'Speed is the best moat. Move with urgency and with conviction.', author: 'Jensen Huang' },

  // ── Ownership and agency — be the CEO of your work ────────────────────────
  { text: 'Everybody is the CEO of their own work.', author: 'Jensen Huang' },
  { text: 'Do not be a victim. Take ownership of the outcome.', author: 'Jensen Huang' },
  { text: 'Delegate, but never abdicate.', author: 'Jensen Huang' },
  { text: 'You have to be willing to do the work that others will not.', author: 'Jensen Huang' },
  {
    text: 'When you see the opportunity, act decisively and with conviction. Then commit completely.',
    author: 'Jensen Huang',
  },
  { text: 'My will to survive exceeds almost everybody else’s will to kill me.', author: 'Jensen Huang' },

  // ── Learning and intellectual honesty ─────────────────────────────────────
  { text: 'Intellectual honesty is being honest with yourself about what you do not know.', author: 'Jensen Huang' },
  { text: 'Ask for help. It is not a weakness — I ask for help all the time.', author: 'Jensen Huang' },
  {
    text: 'I give feedback in front of everyone. Feedback is learning — why should only one person get to learn?',
    author: 'Jensen Huang',
  },
  { text: 'The more you learn, the more you realize how much you have left to learn.', author: 'Jensen Huang' },

  // ── First principles and strategy — action over words ─────────────────────
  { text: 'Strategy is not words. Strategy is action.', author: 'Jensen Huang' },
  {
    text: 'Reason from first principles. Reduce the problem to what is fundamentally true, then build up from there.',
    author: 'Jensen Huang',
  },
  { text: 'We do not have a five-year plan. We work on the plan every single day.', author: 'Jensen Huang' },
  { text: 'Do a few things exceptionally well rather than many things adequately.', author: 'Jensen Huang' },

  // ── Standards and craft ───────────────────────────────────────────────────
  { text: 'Perfection is not achievable, but in chasing it you reach excellence.', author: 'Jensen Huang' },
  {
    text: 'Treat every task as if it is your first — bring the same enthusiasm and the same care every time.',
    author: 'Jensen Huang',
  },
  { text: 'It is not about how many things you start. It is about what you finish.', author: 'Jensen Huang' },

  // ── Team — building people who build the thing ────────────────────────────
  { text: 'Surround yourself with people who challenge you, not people who comfort you.', author: 'Jensen Huang' },
  {
    text: 'The art of leadership is helping ordinary people achieve extraordinary things together.',
    author: 'Jensen Huang',
  },
  { text: 'A great company is built by people who care about the work more than the credit.', author: 'Jensen Huang' },
];

/** Deterministic daily starting point so everyone who opens the login page on
 *  the same day begins on the same quote (then rotation takes over). */
export function dailyQuoteOffset(count: number, now: Date = new Date()): number {
  if (count <= 0) return 0;
  const day = Math.floor(now.getTime() / 86_400_000);
  return day % count;
}

/**
 * How long a quote should stay on screen — proportional to how long it takes to
 * read, so a one-liner doesn't linger and a long line isn't whisked away before
 * it's read. ~200 wpm (≈ 360 ms/word) over a small base, clamped so the
 * rotation never feels either frantic or stalled.
 */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = 2600 + words * 360;
  return Math.min(Math.max(ms, 6000), 16000);
}
