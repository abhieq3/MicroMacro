/**
 * Login-screen wisdom — Naval Ravikant only.
 *
 * Lines are drawn from Naval’s public writing and talks (Twitter/X essays,
 * podcasts, “How to Get Rich”, Almanack-style compilations of his own words).
 * Curated strictly to what Pragati is for: clear thinking, focus, judgment,
 * leverage, shipping, long-term play, and cutting the unessential — not
 * status, vanity metrics, or abstract wealth-porn.
 *
 * Display rule: NO attribution is EVER rendered. The login page shows the
 * line only. `author` is an internal curation key.
 *
 * No-repeat: the login page keeps a per-device ledger of seen indices and
 * never repeats a quote until every line in the library has been shown once.
 * When you expand this list, bump the ledger key on the login page (vN).
 */

export interface Quote {
  text: string;
  author: string; // internal only — never rendered
}

const N = 'Naval Ravikant';

export const BUILTIN_QUOTES: Quote[] = [
  // ── Focus / one thing ─────────────────────────────────────────────────────
  { text: 'The most important skill for getting rich is becoming a perpetual learner.', author: N },
  { text: 'Play long-term games with long-term people.', author: N },
  { text: 'Escape competition through authenticity.', author: N },
  { text: 'Specific knowledge is found by pursuing your genuine curiosity.', author: N },
  { text: 'If you can’t decide, the answer is no.', author: N },
  { text: 'Desire is a contract you make with yourself to be unhappy until you get what you want.', author: N },
  { text: 'Clear thinkers don’t use jargon.', author: N },
  { text: 'The less you want, the freer you are.', author: N },
  {
    text: 'A busy calendar and a busy mind will destroy your ability to do great things in this world.',
    author: N,
  },
  { text: 'Earn with your mind, not your time.', author: N },

  // ── Leverage / judgment ───────────────────────────────────────────────────
  { text: 'Judgment is the ability to combine knowledge and skills into decisions.', author: N },
  { text: 'You will get rich by giving society what it wants but does not yet know how to get — at scale.', author: N },
  {
    text: 'Code and media are permissionless leverage. They’re the leverage behind the newly rich.',
    author: N,
  },
  { text: 'Labor leverage is what your grandparents used. Capital leverage is what your parents used. Code leverage is what you use.', author: N },
  { text: 'Embrace accountability and take business risks under your own name.', author: N },
  { text: 'The most leveraged skill is judgment — knowing what to do when.', author: N },
  {
    text: 'Pick an industry where you can play long-term games with long-term people.',
    author: N,
  },
  { text: 'Productize yourself. Find product-market fit between what you love and what the world needs.', author: N },
  { text: 'Scale what works. Don’t scale what doesn’t.', author: N },

  // ── Execution / shipping / work ───────────────────────────────────────────
  { text: 'Inspiration is perishable. Act on it immediately.', author: N },
  { text: 'The way to get out of the competition trap is to be authentic — figure out what’s unique about you.', author: N },
  { text: 'Doing things means you have to do things you don’t want to do.', author: N },
  {
    text: 'You make your own luck if you stay at it long enough, if you stay persistent enough, and if you’re willing to work hard enough.',
    author: N,
  },
  { text: 'Hard choices, easy life. Easy choices, hard life.', author: N },
  { text: 'The best jobs are neither decreed nor degreed. They are creative expressions of continuous learners.', author: N },
  { text: 'Become the best in the world at what you do. Keep redefining what you do until this is true.', author: N },
  { text: 'Set and enforce an aspirational personal hourly rate.', author: N },
  { text: 'If you can outsource something or not do something for less than your hourly rate, outsource it or don’t do it.', author: N },
  {
    text: 'Work as hard as you can. Even though who you work with and what you work on are more important than how hard you work.',
    author: N,
  },

  // ── Clarity / thinking / first principles ─────────────────────────────────
  { text: 'The fundamental delusion: there is something out there that will make me happy and fulfilled forever.', author: N },
  { text: 'A rational person can find peace by cultivating indifference to things outside of their control.', author: N },
  { text: 'Read what you love until you love to read.', author: N },
  { text: 'The older the problem, the older the solution.', author: N },
  {
    text: 'If you can’t see yourself working with someone for life, don’t work with them for a day.',
    author: N,
  },
  { text: 'Value your time at an absurdly high rate. And then use that to make decisions.', author: N },
  { text: 'The means of learning are abundant. The desire to learn is scarce.', author: N },
  { text: 'Don’t take yourself so seriously. You’re just a monkey with a plan.', author: N },
  { text: 'All the real benefits in life come from compound interest.', author: N },
  {
    text: 'Compound interest applies to relationships, knowledge, and skills as much as to money.',
    author: N,
  },

  // ── Teams / trust / long games (maps to GxP delivery work) ────────────────
  { text: 'When forced to choose, choose your reputation over money.', author: N },
  { text: 'You will not get rich renting out your time. You must own equity — a piece of a business — to gain your financial freedom.', author: N },
  {
    text: 'Follow your intellectual curiosity more than whatever is “hot” right now. Hot and new is temporary. Curiosity compounds.',
    author: N,
  },
  { text: 'Learn to sell. Learn to build. If you can do both, you will be unstoppable.', author: N },
  { text: 'Arm yourself with specific knowledge, accountability, and leverage.', author: N },
  {
    text: 'Specific knowledge is knowledge that you cannot be trained for. If society can train you, it can train someone else and replace you.',
    author: N,
  },
  {
    text: 'The internet has massively broadened the possible space of careers. Most people haven’t figured this out yet.',
    author: N,
  },
  { text: 'Pick business partners with high intelligence, energy, and integrity — and don’t compromise on integrity.', author: N },
  {
    text: 'Status is a zero-sum game. Wealth is a positive-sum game. Choose carefully which game you’re playing at work.',
    author: N,
  },
  { text: 'The most important person to impress is yourself. If you can do that, everyone else will follow.', author: N },

  // ── Priorities / saying no / simplicity (product + project management) ────
  { text: 'Saying no frees you up to say yes when it matters.', author: N },
  {
    text: 'The perfect project is one that is interesting, important, and that only you can do — or that you are uniquely suited to do.',
    author: N,
  },
  { text: 'Busy is a decision. Busy is not a badge of honor.', author: N },
  { text: 'Optimize for peace of mind, not for the appearance of busyness.', author: N },
  {
    text: 'A calendar filled with meetings is not a sign of importance. It is often a sign of a lack of priorities.',
    author: N,
  },
  { text: 'Be present above all else.', author: N },
  {
    text: 'The modern struggle: lonely but never alone, connected but not relating, always online but never present.',
    author: N,
  },
  { text: 'Meditation is intermittent fasting for the mind.', author: N },
  { text: 'Happiness is a choice and a skill — and the skill is mostly about not over-identifying with every thought.', author: N },

  // ── Progress / compounding / delivery ─────────────────────────────────────
  {
    text: 'If you have nothing in your life, but you have at least one person that loves you unconditionally, it’ll do wonders for your self-esteem.',
    author: N,
  },
  { text: 'Your goal in life is to find the people, business, project, or art that needs you the most.', author: N },
  {
    text: 'The most important thing is to be able to break down your goals into small, achievable pieces and then execute on those pieces day after day.',
    author: N,
  },
  { text: 'You’ll never be free until you free yourself from the desire for other people’s approval.', author: N },
  {
    text: 'Don’t spend your time making other people happy. Other people being happy is their problem. It’s not your problem.',
    author: N,
  },
  {
    text: 'The three big ones in life are wealth, health, and happiness. We pursue them in that order, but their importance is reverse.',
    author: N,
  },
  { text: 'Health, love, and your mission — in that order. Nothing else matters.', author: N },
  {
    text: 'A good founder can manage small teams and build products. A great founder can also articulate a vision that attracts talent and capital.',
    author: N,
  },
  {
    text: 'Technology is the set of things that don’t quite work yet. Once something works, it’s no longer technology — it’s just infrastructure.',
    author: N,
  },
  {
    text: 'Spend more time making the product better than explaining why the product is already good enough.',
    author: N,
  },

  // ── Accountability / honesty at work ──────────────────────────────────────
  { text: 'Tell the truth. It’s easier.', author: N },
  { text: 'Praise specifically, criticize generally.', author: N },
  {
    text: 'The people who succeed over the long run are the ones who are willing to take the short-term pain for the long-term gain.',
    author: N,
  },
  {
    text: 'If you can’t see yourself working with someone for the rest of your life, don’t work with them for a day.',
    author: N,
  },
  { text: 'A rational person never stays angry for long — anger is a signal, not a state.', author: N },
  {
    text: 'The best way to get what you want in negotiation is to deserve it — and to be ready to walk away.',
    author: N,
  },
  {
    text: 'Don’t keep score. Help people without keeping a ledger. The best networks are built on generosity, not transactions.',
    author: N,
  },
  {
    text: 'Your reputation is the only thing you take with you from one room to the next. Guard it like equity.',
    author: N,
  },
  {
    text: 'In a long-term game, it seems that everybody is making each other rich. In a short-term game, it seems like everybody is making themselves rich.',
    author: N,
  },
  {
    text: 'The older I get, the more I realize how much outcomes come from patience and consistency, not from intensity spikes.',
    author: N,
  },

  // ── Applied to knowledge work & tools like Pragati ────────────────────────
  {
    text: 'Information is abundant. Attention and judgment are scarce. Spend them carefully.',
    author: N,
  },
  {
    text: 'A good process beats a good mood. Build systems that work when motivation doesn’t.',
    author: N,
  },
  {
    text: 'The goal is not to be busy. The goal is to have free time and still create things that matter.',
    author: N,
  },
  {
    text: 'If you can’t explain your plan simply, you don’t understand it well enough to execute it.',
    author: N,
  },
  {
    text: 'Ship, learn, iterate. Perfect is a delay tactic dressed up as standards.',
    author: N,
  },
  {
    text: 'Most of what you think you need to do today can be deleted. Start by deleting.',
    author: N,
  },
  {
    text: 'Your calendar is a voting machine for your priorities. Look at it honestly.',
    author: N,
  },
  {
    text: 'The highest form of wealth is owning your time and attention.',
    author: N,
  },
  {
    text: 'Solve problems that don’t go away when you stop looking at them. Those are the real ones.',
    author: N,
  },
  {
    text: 'Do the simple thing that works. Complexity is often insecurity wearing a lab coat.',
    author: N,
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
