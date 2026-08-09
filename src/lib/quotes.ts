/**
 * Login quotes — library + live-feed merge + client helpers.
 *
 * Built-in: 250 founders lines (data.ts).
 * Live feed (always on): public/quotes-feed.json in this repo — edit & push.
 * Optional external: QUOTES_FEED_URL (JSON) merges on top without a redeploy.
 */

export type { Quote } from './quotes/data';
export { BUILTIN_QUOTES, BUILTIN_QUOTE_VERSION } from './quotes/data';

import { readFile } from 'fs/promises';
import path from 'path';
import type { Quote } from './quotes/data';
import { BUILTIN_QUOTES, BUILTIN_QUOTE_VERSION } from './quotes/data';

export type QuotesPayload = {
  quotes: Quote[];
  version: string;
  source: 'builtin' | 'merged';
  builtinCount: number;
  remoteCount: number;
};

function normalizeQuote(raw: any, fallbackId: string): Quote | null {
  const text = String(raw?.text || raw?.quote || '').trim();
  if (!text || text.length < 8 || text.length > 400) return null;
  const author = String(raw?.author || raw?.by || 'Unknown').trim().slice(0, 80) || 'Unknown';
  const idRaw = String(raw?.id || '').trim();
  const id =
    idRaw ||
    fallbackId ||
    `r_${text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 48)}`;
  return { id, text, author, authorKey: raw?.authorKey ? String(raw.authorKey) : 'other' };
}

/** Merge libraries; later sources win on same id; de-dupe by normalized text. */
export function mergeQuoteLibraries(...lists: Quote[][]): Quote[] {
  const byId = new Map<string, Quote>();
  const textSeen = new Set<string>();
  for (const list of lists) {
    for (const q of list) {
      const key = q.text.trim().toLowerCase();
      if (textSeen.has(key) && !byId.has(q.id)) continue;
      if (textSeen.has(key) && byId.has(q.id)) {
        byId.set(q.id, q);
        continue;
      }
      if (textSeen.has(key)) continue;
      textSeen.add(key);
      byId.set(q.id, q);
    }
  }
  return [...byId.values()];
}

export function parseRemoteQuotes(body: any): Quote[] {
  const list = Array.isArray(body) ? body : Array.isArray(body?.quotes) ? body.quotes : [];
  const out: Quote[] = [];
  list.forEach((raw: any, i: number) => {
    const q = normalizeQuote(raw, `remote_${i + 1}`);
    if (q) out.push(q);
  });
  return out;
}

let fileFeedCache: { at: number; quotes: Quote[] } | null = null;
let urlFeedCache: { at: number; quotes: Quote[] } | null = null;
const FEED_TTL_MS = 15 * 60 * 1000; // 15 min — pick up push edits reasonably fast

/** Always-on feed: public/quotes-feed.json (shipped with the app). */
async function loadFileFeed(): Promise<Quote[]> {
  const now = Date.now();
  if (fileFeedCache && now - fileFeedCache.at < FEED_TTL_MS) return fileFeedCache.quotes;
  try {
    const filePath = path.join(process.cwd(), 'public', 'quotes-feed.json');
    const raw = await readFile(filePath, 'utf8');
    const quotes = parseRemoteQuotes(JSON.parse(raw));
    fileFeedCache = { at: now, quotes };
    return quotes;
  } catch (e) {
    console.warn('[quotes] public/quotes-feed.json unavailable', e);
    return fileFeedCache?.quotes || [];
  }
}

/** Optional external feed (no redeploy when this URL’s JSON changes). */
async function loadUrlFeed(): Promise<Quote[]> {
  const url = (process.env.QUOTES_FEED_URL || '').trim();
  if (!url) return [];
  const now = Date.now();
  if (urlFeedCache && now - urlFeedCache.at < FEED_TTL_MS) return urlFeedCache.quotes;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 900 },
    } as RequestInit);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const body = await res.json();
    const quotes = parseRemoteQuotes(body);
    urlFeedCache = { at: now, quotes };
    return quotes;
  } catch (e) {
    console.warn('[quotes] QUOTES_FEED_URL unavailable', e);
    return urlFeedCache?.quotes || [];
  }
}

export async function loadRemoteQuotes(): Promise<Quote[]> {
  const [fileFeed, urlFeed] = await Promise.all([loadFileFeed(), loadUrlFeed()]);
  return mergeQuoteLibraries(fileFeed, urlFeed);
}

export async function getQuotesPayload(): Promise<QuotesPayload> {
  const remote = await loadRemoteQuotes();
  const quotes = mergeQuoteLibraries(BUILTIN_QUOTES, remote);
  return {
    quotes,
    version: remote.length
      ? `${BUILTIN_QUOTE_VERSION}+live${remote.length}`
      : BUILTIN_QUOTE_VERSION,
    source: remote.length ? 'merged' : 'builtin',
    builtinCount: BUILTIN_QUOTES.length,
    remoteCount: remote.length,
  };
}

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
  return Math.min(14000, Math.max(5000, words * 400));
}
