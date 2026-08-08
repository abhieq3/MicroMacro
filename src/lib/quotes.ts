/**
 * Login lines — Jeff Bezos + Amazon’s 16 Leadership Principles, rewritten
 * in plain language and aimed at Pragati: visible work, owners, dates, and
 * shipping quality together.
 *
 * No name is shown on screen. Bump the ledger key on the login page when
 * you re-curate this list.
 */

export interface Quote {
  text: string;
  author: string;
}

const E = 'bezos';

export const BUILTIN_QUOTES: Quote[] = [
  // ── Jeff Bezos (documented public lines, kept short) ─────────────────
  {
    text: 'Start with the customer and work backwards — not with the process, and not with the tool.',
    author: E,
  },
  {
    text: 'It’s always Day 1. Stay curious, move fast, and don’t protect yesterday’s habits.',
    author: E,
  },
  {
    text: 'If you double the number of experiments you do per year, you’re going to double your inventiveness.',
    author: E,
  },
  {
    text: 'We are stubborn on vision. We are flexible on details.',
    author: E,
  },
  {
    text: 'A company shouldn’t get addicted to being shiny, because shiny doesn’t last.',
    author: E,
  },
  {
    text: 'There are two kinds of decisions: those you can reverse, and those you can’t. Most work decisions are reversible — so decide and move.',
    author: E,
  },
  {
    text: 'If you’re good at course correcting, being wrong may be less costly than you think — while being slow is going to be expensive for sure.',
    author: E,
  },
  {
    text: 'The best customer service is if the customer doesn’t need to call you, doesn’t need to talk to you. It just works.',
    author: E,
  },
  {
    text: 'I knew that if I failed I wouldn’t regret that — but I knew the one thing I might regret is not trying.',
    author: E,
  },
  {
    text: 'Focus on the things that don’t change. Customers will always want better quality, faster delivery, and clearer ownership.',
    author: E,
  },

  // ── 16 Leadership Principles — plain language, product-relevant ──────
  // 1. Customer Obsession
  {
    text: 'Customer Obsession: Care about the person who uses the work. Start with their need, then design the plan backwards.',
    author: E,
  },
  // 2. Ownership
  {
    text: 'Ownership: Act like you own the outcome. Don’t say “that’s not my task” when the board still shows risk.',
    author: E,
  },
  // 3. Invent and Simplify
  {
    text: 'Invent and Simplify: Find a simpler way. If a status meeting can be a clear board, prefer the board.',
    author: E,
  },
  // 4. Are Right, A Lot
  {
    text: 'Are Right, A Lot: Seek truth over ego. Check the data on the board before you defend a plan.',
    author: E,
  },
  // 5. Learn and Be Curious
  {
    text: 'Learn and Be Curious: Ask why a task slipped. Curiosity fixes more problems than blame.',
    author: E,
  },
  // 6. Hire and Develop the Best
  {
    text: 'Hire and Develop the Best: Grow people by giving clear work, real ownership, and honest feedback.',
    author: E,
  },
  // 7. Insist on the Highest Standards
  {
    text: 'Highest Standards: Don’t ship “good enough” when quality is the product. Raise the bar, then help the team clear it.',
    author: E,
  },
  // 8. Think Big
  {
    text: 'Think Big: Aim for the whole delivery, not one busy day. Bold goals need clear steps on the board.',
    author: E,
  },
  // 9. Bias for Action
  {
    text: 'Bias for Action: Speed matters. When the decision is reversible, pick a direction and update the status.',
    author: E,
  },
  // 10. Frugality
  {
    text: 'Frugality: Do more with less. Cut busywork so energy goes to the work that ships.',
    author: E,
  },
  // 11. Earn Trust
  {
    text: 'Earn Trust: Be honest about dates and blockers. Trust grows when the board matches reality.',
    author: E,
  },
  // 12. Dive Deep
  {
    text: 'Dive Deep: Stay connected to the details. Leads who never open the tasks get surprised by the late list.',
    author: E,
  },
  // 13. Have Backbone; Disagree and Commit
  {
    text: 'Disagree and Commit: Debate the plan openly — then commit. Half-support after a decision wastes the team.',
    author: E,
  },
  // 14. Deliver Results
  {
    text: 'Deliver Results: Focus on finished work, not motion. Done with quality beats busy with status.',
    author: E,
  },
  // 15. Strive to be Earth’s Best Employer (modern principle — team version)
  {
    text: 'Best Employer: Build a place where people can do their best work — clear goals, fair load, respect for time.',
    author: E,
  },
  // 16. Success and Scale Bring Broad Responsibility
  {
    text: 'Broad Responsibility: As the team grows, so does the duty to be clear, fair, and careful with shared systems.',
    author: E,
  },

  // ── Extra plain lines that map Bezos ideas → Pragati daily use ───────
  {
    text: 'Make the work visible. If everyone can see the board, most status meetings aren’t needed.',
    author: E,
  },
  {
    text: 'One owner. One date. One next action. Ambiguity is expensive.',
    author: E,
  },
  {
    text: 'Exceptions first: clear what’s late or blocked before you celebrate what’s fine.',
    author: E,
  },
  {
    text: 'Write it down. A shared board beats a private memory every time.',
    author: E,
  },
  {
    text: 'Long-term thinking: ship work that still makes sense next quarter, not only this morning.',
    author: E,
  },
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
