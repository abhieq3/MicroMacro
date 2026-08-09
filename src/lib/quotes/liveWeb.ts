/**
 * Live web quote sources — fetched server-side, cached ~daily.
 * Primary feed for the login screen (not the static builtin library).
 *
 * Sources (no API key required):
 *   • ZenQuotes — /api/today (one new line every calendar day) + /api/quotes
 *   • DummyJSON — large open quote dataset (paginated)
 *
 * Preferred authors (Elon circle + peers) are ranked first when present;
 * remaining lines keep success / work / leadership themes when possible.
 */

import type { Quote } from './data';

const PREFERRED_AUTHOR_RE =
  /\b(elon\s*musk|jensen\s*huang|jeff(rey)?\s*bezos|larry\s*page|tobi\s*l[uü]tke|naval(\s*ravikant)?|steve\s*jobs|peter\s*thiel|richard\s*feynman|henry\s*ford|isaac\s*asimov|charlie\s*munger|bill\s*gates|warren\s*buffett|mark\s*zuckerberg|satya\s*nadella|sundar\s*pichai|reed\s*hastings|paul\s*graham|sam\s*altman|andrej\s*karpathy|richard\s*branson|oprah|einstein|tesla|edison|churchill|feynman|bezos|musk|jobs|naval|thiel|munger|gates)\b/i;

/** Themes that map to Pragati (shipping, ownership, focus) — soft filter. */
const RELEVANT_RE =
  /\b(work|success|build|ship|lead|team|focus|action|decide|plan|quality|fail|innovate|simple|hard|finish|owner|time|create|progress|discipline|courage|truth|learn|start|do it|done|goal|product|customer|trust|habit|practice|excellence|speed|delete|first principles?)\b/i;

const FETCH_MS = 12_000;

type CacheEntry = { at: number; quotes: Quote[]; dayKey: string };
let cache: CacheEntry | null = null;

function dayKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function slugId(prefix: string, text: string, author: string): string {
  const base = `${author}|${text}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 72);
  return `${prefix}_${base || 'x'}`;
}

function toQuote(text: string, author: string, prefix: string): Quote | null {
  const t = text.replace(/\s+/g, ' ').trim();
  const a = author.replace(/\s+/g, ' ').trim();
  if (t.length < 12 || t.length > 400) return null;
  if (!a || /zenquotes\.io/i.test(a)) return null; // rate-limit stub
  return {
    id: slugId(prefix, t, a),
    text: t,
    author: a,
    authorKey: 'live',
  };
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'PragatiQuotes/1.0' },
      // Avoid Next freezing a bad body forever
      cache: 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** ZenQuotes: today's quote (changes daily) + random batch. */
async function fetchZenQuotes(): Promise<Quote[]> {
  const out: Quote[] = [];
  const [today, batch] = await Promise.all([
    fetchJson('https://zenquotes.io/api/today'),
    fetchJson('https://zenquotes.io/api/quotes'),
  ]);
  const rows = [
    ...(Array.isArray(today) ? today : []),
    ...(Array.isArray(batch) ? batch : []),
  ];
  for (const row of rows) {
    const q = toQuote(String(row?.q || ''), String(row?.a || ''), 'zen');
    if (q) out.push(q);
  }
  // A few extra random pulls for variety (best-effort; may rate-limit)
  const extras = await Promise.all([
    fetchJson('https://zenquotes.io/api/random'),
    fetchJson('https://zenquotes.io/api/random'),
  ]);
  for (const body of extras) {
    const rows2 = Array.isArray(body) ? body : [];
    for (const row of rows2) {
      const q = toQuote(String(row?.q || ''), String(row?.a || ''), 'zen');
      if (q) out.push(q);
    }
  }
  return out;
}

/** DummyJSON: open dataset — pull several pages for volume. */
async function fetchDummyJsonQuotes(): Promise<Quote[]> {
  const out: Quote[] = [];
  const pages = [0, 100, 200, 300, 400, 500]; // up to ~600
  const bodies = await Promise.all(
    pages.map((skip) => fetchJson(`https://dummyjson.com/quotes?limit=100&skip=${skip}`)),
  );
  for (const body of bodies) {
    const list = Array.isArray(body?.quotes) ? body.quotes : [];
    for (const row of list) {
      const q = toQuote(String(row?.quote || ''), String(row?.author || ''), 'dj');
      if (q) out.push(q);
    }
  }
  return out;
}

function rankScore(q: Quote): number {
  let s = 0;
  if (PREFERRED_AUTHOR_RE.test(q.author)) s += 100;
  if (RELEVANT_RE.test(q.text)) s += 20;
  // Slightly prefer mid-length (readable on login)
  if (q.text.length >= 40 && q.text.length <= 180) s += 5;
  return s;
}

function dedupeAndRank(quotes: Quote[]): Quote[] {
  const byText = new Map<string, Quote>();
  for (const q of quotes) {
    const key = q.text.toLowerCase();
    const prev = byText.get(key);
    if (!prev || rankScore(q) > rankScore(prev)) byText.set(key, q);
  }
  return [...byText.values()].sort((a, b) => rankScore(b) - rankScore(a));
}

/**
 * Fetch live quotes from the public web. Cached per UTC day (and for a few hours
 * within the day) so we refresh daily without hammering free APIs.
 */
export async function fetchLiveWebQuotes(): Promise<Quote[]> {
  const today = dayKey();
  const now = Date.now();
  // Reuse cache within the same UTC day for up to 6 hours
  if (cache && cache.dayKey === today && now - cache.at < 6 * 60 * 60 * 1000) {
    return cache.quotes;
  }

  const [zen, dummy] = await Promise.all([fetchZenQuotes(), fetchDummyJsonQuotes()]);
  const ranked = dedupeAndRank([...zen, ...dummy]);

  // Prefer relevant + preferred, but keep a large pool so the login never feels tiny
  const preferred = ranked.filter((q) => PREFERRED_AUTHOR_RE.test(q.author) || RELEVANT_RE.test(q.text));
  const pool = preferred.length >= 40 ? preferred : ranked;

  if (pool.length > 0) {
    cache = { at: now, quotes: pool, dayKey: today };
  }
  return pool;
}

export function clearLiveWebCache() {
  cache = null;
}
