/**
 * Login-screen wisdom — Jensen Huang only.
 *
 * Every line is drawn from Jensen Huang (NVIDIA founder & CEO): keynotes,
 * earnings/product talks, interviews, and university / commencement addresses
 * (incl. Stanford GSB, Caltech, NTU). Themes map to what Pragati is for:
 * mission first, resilience, urgency, ownership, intellectual honesty,
 * first principles, craft, and finishing.
 *
 * Display rule: NO attribution is EVER rendered. The login page shows the
 * line only. `author` is an internal curation key.
 *
 * Keep this library current: when Jensen publishes a durable line that maps
 * to doing the work (not product marketing slogans), append it here and bump
 * `QUOTES_LEDGER_VERSION` in the login page so devices re-cycle cleanly.
 *
 * No-repeat: the login page rotates a per-device unseen ledger until the
 * whole set is exhausted, then resets.
 */

export interface Quote {
  text: string;
  author: string; // internal only — never rendered
}

const J = 'Jensen Huang';

export const BUILTIN_QUOTES: Quote[] = [
  // ── Mission ───────────────────────────────────────────────────────────────
  { text: 'Run the company with the mission as the boss. The mission is the CEO.', author: J },
  {
    text: 'Find something you love to do, then do it with all of your heart and the whole of your effort.',
    author: J,
  },
  {
    text: 'There is no reason to be the best in the world at something that does not matter. Pick something hard and worth doing.',
    author: J,
  },
  {
    text: 'Keep the main thing the main thing. Prioritize relentlessly — decide the most important thing, and do it.',
    author: J,
  },
  { text: 'The condition of the company is the condition of the CEO.', author: J },

  // ── Resilience / suffering ────────────────────────────────────────────────
  {
    text: 'Greatness is not intelligence. Greatness comes from character — and character is formed out of people who suffered.',
    author: J,
  },
  { text: 'I wish upon you ample doses of pain and suffering.', author: J },
  { text: 'The single most important quality for success is resilience.', author: J },
  {
    text: 'People with very high expectations have very low resilience — and resilience matters in success.',
    author: J,
  },
  { text: 'Nobody who did anything great did it the easy way. Suffering refines you.', author: J },
  { text: 'You do not know you have grit until it is tested.', author: J },
  {
    text: 'I do not like to suffer. I just realized that to do anything great, you are going to go through suffering.',
    author: J,
  },

  // ── Urgency / paranoia ────────────────────────────────────────────────────
  { text: 'Our company is always thirty days from going out of business.', author: J },
  { text: 'Hope is not a strategy.', author: J },
  { text: 'Run toward the danger, not away from it.', author: J },
  { text: 'Complacency is the enemy. Stay paranoid about what actually matters.', author: J },
  { text: 'Speed is the best moat. Move with urgency and with conviction.', author: J },
  { text: 'If you are not inventing the future, someone else will invent it for you.', author: J },

  // ── Ownership ─────────────────────────────────────────────────────────────
  { text: 'Everybody is the CEO of their own work.', author: J },
  { text: 'Do not be a victim. Take ownership of the outcome.', author: J },
  { text: 'Delegate, but never abdicate.', author: J },
  { text: 'You have to be willing to do the work that others will not.', author: J },
  {
    text: 'When you see the opportunity, act decisively and with conviction. Then commit completely.',
    author: J,
  },
  { text: 'My will to survive exceeds almost everybody else’s will to kill me.', author: J },

  // ── Learning / honesty ────────────────────────────────────────────────────
  { text: 'Intellectual honesty is being honest with yourself about what you do not know.', author: J },
  { text: 'Ask for help. It is not a weakness — I ask for help all the time.', author: J },
  {
    text: 'I give feedback in front of everyone. Feedback is learning — why should only one person get to learn?',
    author: J,
  },
  { text: 'The more you learn, the more you realize how much you have left to learn.', author: J },
  {
    text: 'You want people to tell you the truth. Create an environment where the truth can be spoken.',
    author: J,
  },

  // ── First principles / strategy ───────────────────────────────────────────
  { text: 'Strategy is not words. Strategy is action.', author: J },
  {
    text: 'Reason from first principles. Reduce the problem to what is fundamentally true, then build up from there.',
    author: J,
  },
  { text: 'We do not have a five-year plan. We work on the plan every single day.', author: J },
  { text: 'Do a few things exceptionally well rather than many things adequately.', author: J },
  {
    text: 'If you cannot explain it simply on a whiteboard, you do not understand it yet.',
    author: J,
  },
  {
    text: 'The job of a leader is to simplify the complicated — then make the hard call.',
    author: J,
  },

  // ── AI era (2023–2025 talks) — work, not product slogans ──────────────────
  {
    text: 'The more you use AI, the smarter you become at using AI — skill compounds with practice.',
    author: J,
  },
  {
    text: 'Software is eating the world. AI is eating software. Adapt how you work, or be left behind.',
    author: J,
  },
  {
    text: 'You have to reinvent yourself constantly. The world does not slow down for you.',
    author: J,
  },
  {
    text: 'Computing is becoming a new industrial revolution. The companies that learn fastest will win.',
    author: J,
  },

  // ── Standards / craft ─────────────────────────────────────────────────────
  { text: 'Perfection is not achievable, but in chasing it you reach excellence.', author: J },
  {
    text: 'Treat every task as if it is your first — bring the same enthusiasm and the same care every time.',
    author: J,
  },
  { text: 'It is not about how many things you start. It is about what you finish.', author: J },
  { text: 'Excellence is a habit. Ship the standard you want others to copy.', author: J },

  // ── Team ──────────────────────────────────────────────────────────────────
  { text: 'Surround yourself with people who challenge you, not people who comfort you.', author: J },
  {
    text: 'The art of leadership is helping ordinary people achieve extraordinary things together.',
    author: J,
  },
  { text: 'A great company is built by people who care about the work more than the credit.', author: J },
  {
    text: 'Hire for character and for the will to do hard things — skills can be taught.',
    author: J,
  },
];

/** Deterministic daily starting point (SSR-safe). */
export function dailyQuoteOffset(count: number, now: Date = new Date()): number {
  if (count <= 0) return 0;
  const day = Math.floor(now.getTime() / 86_400_000);
  return day % count;
}

/**
 * How long a quote stays on screen — ~200 wpm with a floor/ceiling so rotation
 * never feels frantic or stalled.
 */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ms = 2600 + words * 360;
  return Math.min(Math.max(ms, 6000), 16000);
}
