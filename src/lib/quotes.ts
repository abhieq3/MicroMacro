/**
 * Login quotes — **live web first**, daily refresh.
 *
 * Primary: ZenQuotes (today + batch) + DummyJSON (public APIs, no key).
 * Fallback: built-in 250 founders lines if the web is unreachable.
 * Optional: QUOTES_FEED_URL external JSON still merges on top.
 *
 * Devices track seen quote ids so lines never repeat until the pool cycles.
 */

export type { Quote } from './quotes/data';
export { BUILTIN_QUOTES, BUILTIN_QUOTE_VERSION } from './quotes/data';

import type { Quote } from './quotes/data';
import { BUILTIN_QUOTES, BUILTIN_QUOTE_VERSION } from './quotes/data';
import { fetchLiveWebQuotes } from './quotes/liveWeb';

export type QuotesPayload = {
  quotes: Quote[];
  version: string;
  source: 'live' | 'live+builtin' | 'builtin' | 'merged';
  builtinCount: number;
  remoteCount: number;
  liveCount: number;
  /** UTC day the live cache is keyed on */
  dayKey?: string;
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

export function mergeQuoteLibraries(...lists: Quote[][]): Quote[] {
  const byId = new Map<string, Quote>();
  const textSeen = new Set<string>();
  for (const list of lists) {
    for (const q of list) {
      const key = q.text.trim().toLowerCase();
      if (textSeen.has(key)) {
        // Allow id update for same text from a higher-priority later list
        if (byId.has(q.id)) byId.set(q.id, q);
        continue;
      }
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

let urlFeedCache: { at: number; quotes: Quote[] } | null = null;
const URL_FEED_TTL_MS = 15 * 60 * 1000;

/** Optional external JSON (your own CDN) — still supported. */
async function loadUrlFeed(): Promise<Quote[]> {
  const url = (process.env.QUOTES_FEED_URL || '').trim();
  if (!url) return [];
  const now = Date.now();
  if (urlFeedCache && now - urlFeedCache.at < URL_FEED_TTL_MS) return urlFeedCache.quotes;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
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

function utcDayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Build the login library:
 *   1. Live web APIs (ZenQuotes daily + DummyJSON) — primary
 *   2. Optional QUOTES_FEED_URL
 *   3. Builtin founders set only if live returned nothing (offline / blocked)
 */
export async function getQuotesPayload(): Promise<QuotesPayload> {
  const day = utcDayKey();
  let live: Quote[] = [];
  try {
    live = await fetchLiveWebQuotes();
  } catch (e) {
    console.warn('[quotes] live web fetch failed', e);
  }
  const external = await loadUrlFeed();

  const liveMerged = mergeQuoteLibraries(live, external);
  const useBuiltinFallback = liveMerged.length < 10;
  const quotes = useBuiltinFallback
    ? mergeQuoteLibraries(liveMerged, BUILTIN_QUOTES)
    : liveMerged;

  let source: QuotesPayload['source'] = 'builtin';
  if (live.length > 0 && !useBuiltinFallback) source = external.length ? 'merged' : 'live';
  else if (live.length > 0 && useBuiltinFallback) source = 'live+builtin';
  else if (external.length > 0) source = 'merged';

  return {
    quotes,
    version: `live-${day}-${quotes.length}`,
    source,
    builtinCount: BUILTIN_QUOTES.length,
    remoteCount: external.length,
    liveCount: live.length,
    dayKey: day,
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
