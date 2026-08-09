/**
 * Login quotes — library + live-feed merge + client helpers.
 *
 * Built-in set: 250 lines from Elon & the founders / books he recommends,
 * tuned to Pragati (ship, own, delete, clarity, quality).
 *
 * Live updates: optional `QUOTES_FEED_URL` JSON feed is fetched server-side
 * and merged by stable id. New lines appear on the login page without a
 * redeploy. Devices track seen ids so quotes never repeat until the pool
 * is exhausted.
 */

export type { Quote } from './quotes/data';
export { BUILTIN_QUOTES, BUILTIN_QUOTE_VERSION } from './quotes/data';

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
  // Prefer stable remote ids; otherwise hash-ish slug from text.
  const id =
    idRaw ||
    fallbackId ||
    `r_${text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 48)}`;
  return { id, text, author, authorKey: raw?.authorKey ? String(raw.authorKey) : 'other' };
}

/** Merge builtin + remote; remote wins on same id; de-dupe by normalized text. */
export function mergeQuoteLibraries(builtin: Quote[], remote: Quote[]): Quote[] {
  const byId = new Map<string, Quote>();
  const textSeen = new Set<string>();
  const push = (q: Quote) => {
    const key = q.text.trim().toLowerCase();
    if (textSeen.has(key)) return;
    textSeen.add(key);
    byId.set(q.id, q);
  };
  for (const q of builtin) push(q);
  for (const q of remote) push(q);
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

// In-memory cache for the remote feed (server only).
let feedCache: { at: number; quotes: Quote[] } | null = null;
const FEED_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function loadRemoteQuotes(): Promise<Quote[]> {
  const url = (process.env.QUOTES_FEED_URL || '').trim();
  if (!url) return [];
  const now = Date.now();
  if (feedCache && now - feedCache.at < FEED_TTL_MS) return feedCache.quotes;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Next.js: revalidate-friendly; also works outside Next with plain fetch.
      next: { revalidate: 3600 },
    } as RequestInit);
    if (!res.ok) throw new Error(`feed ${res.status}`);
    const body = await res.json();
    const quotes = parseRemoteQuotes(body);
    feedCache = { at: now, quotes };
    return quotes;
  } catch (e) {
    console.warn('[quotes] live feed unavailable', e);
    return feedCache?.quotes || [];
  }
}

export async function getQuotesPayload(): Promise<QuotesPayload> {
  const remote = await loadRemoteQuotes();
  const quotes = mergeQuoteLibraries(BUILTIN_QUOTES, remote);
  return {
    quotes,
    version: remote.length
      ? `${BUILTIN_QUOTE_VERSION}+remote${remote.length}`
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
