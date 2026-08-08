/**
 * Login lines — Steve Jobs only. Short, about focus, craft, shipping, and
 * saying no. No name is shown on screen. Bump the ledger key on the login
 * page when you re-curate this list.
 */

export interface Quote {
  text: string;
  author: string;
}

const E = 'jobs';

export const BUILTIN_QUOTES: Quote[] = [
  {
    text: 'Design is not just what it looks like and feels like. Design is how it works.',
    author: E,
  },
  {
    text: 'Simple can be harder than complex: you have to work hard to get your thinking clean to make it simple.',
    author: E,
  },
  {
    text: 'Focus and simplicity. Simple can be harder than complex, but it’s worth it in the end because once you get there, you can move mountains.',
    author: E,
  },
  {
    text: 'Deciding what not to do is as important as deciding what to do.',
    author: E,
  },
  {
    text: 'I’m as proud of what we don’t do as I am of what we do.',
    author: E,
  },
  {
    text: 'People think focus means saying yes to the thing you’ve got to focus on. But that’s not what it means at all. It means saying no to the hundred other good ideas.',
    author: E,
  },
  {
    text: 'Quality is more important than quantity. One home run is much better than two doubles.',
    author: E,
  },
  {
    text: 'Be a yardstick of quality. Some people aren’t used to an environment where excellence is expected.',
    author: E,
  },
  {
    text: 'Real artists ship.',
    author: E,
  },
  {
    text: 'Details matter. It’s worth waiting to get it right.',
    author: E,
  },
  {
    text: 'You’ve got to start with the customer experience and work back toward the technology — not the other way around.',
    author: E,
  },
  {
    text: 'Innovation distinguishes between a leader and a follower.',
    author: E,
  },
  {
    text: 'People don’t know what they want until you show it to them.',
    author: E,
  },
  {
    text: 'Stay hungry. Stay foolish.',
    author: E,
  },
  {
    text: 'Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.',
    author: E,
  },
  {
    text: 'The only way to do great work is to love what you do.',
    author: E,
  },
  {
    text: 'You can’t connect the dots looking forward; you can only connect them looking backwards. So you have to trust that the dots will somehow connect in your future.',
    author: E,
  },
  {
    text: 'Have the courage to follow your heart and intuition. They somehow already know what you truly want to become.',
    author: E,
  },
  {
    text: 'Great things in business are never done by one person. They’re done by a team of people.',
    author: E,
  },
  {
    text: 'My favorite things in life don’t cost any money. It’s really clear that the most precious resource we all have is time.',
    author: E,
  },
  {
    text: 'Sometimes when you innovate, you make mistakes. It is best to admit them quickly, and get on with improving your other innovations.',
    author: E,
  },
  {
    text: 'It’s not about money. It’s about the people you have, how you’re led, and how much you get it.',
    author: E,
  },
  {
    text: 'We don’t get a chance to do that many things, and every one should be really excellent. Because this is our life.',
    author: E,
  },
  {
    text: 'Get closer than ever to your customers. So close that you tell them what they need well before they realize it themselves.',
    author: E,
  },
  {
    text: 'You have to be burning with an idea, or a problem, or a wrong that you want to right. If you’re not passionate enough from the start, you’ll never stick it out.',
    author: E,
  },
  {
    text: 'Don’t let the noise of others’ opinions drown out your own inner voice.',
    author: E,
  },
  {
    text: 'Things don’t have to change the world to be important.',
    author: E,
  },
  {
    text: 'I want to put a ding in the universe.',
    author: E,
  },
  {
    text: 'Being the richest man in the cemetery doesn’t matter to me. Going to bed at night saying we’ve done something wonderful — that’s what matters to me.',
    author: E,
  },
  {
    text: 'That’s been one of my mantras — focus and simplicity.',
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
