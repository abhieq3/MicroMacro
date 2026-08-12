/**
 * Assignee + duration ranker, A/B'd against the TF-IDF heuristic.
 *
 * Variant is sticky per (user, project) so a lead does not flip models
 * mid-board. The ranker re-orders the same candidates the heuristic scored,
 * boosting people who actually finish similar titles and who the lead has
 * accepted before. Due date uses real cycle time (created → completed),
 * not scheduled lead time (created → due).
 *
 * Kill rule: if ranker accept-rate ≤ heuristic accept-rate on the training
 * table, delete this file and serve heuristic only.
 */

import { createHash } from 'crypto';

export type SuggestVariant = 'heuristic' | 'ranker';

export const RANKER_VERSION = 'v1';

export function assignVariant(userId: string, projectId: string): SuggestVariant {
  const hex = createHash('sha1').update(`${userId}:${projectId}`).digest('hex');
  const n = parseInt(hex.slice(0, 8), 16);
  return n % 2 === 0 ? 'heuristic' : 'ranker';
}

export interface RankCandidate {
  id: string;
  tfidf: number;
  count: number;
}

export interface AcceptStat {
  shown: number;
  accepts: number;
}

export function rerankAssignees(
  candidates: RankCandidate[],
  opts: {
    tokenLastAssigneeId?: string;
    acceptByAssignee?: Map<string, AcceptStat>;
  } = {},
): { id: string; score: number }[] {
  if (!candidates.length) return [];
  const maxTf = Math.max(...candidates.map((c) => c.tfidf), 1e-6);
  const ranked = candidates.map((c) => {
    const tf = c.tfidf / maxTf;
    const mem = opts.tokenLastAssigneeId && c.id === opts.tokenLastAssigneeId ? 1 : 0;
    const st = opts.acceptByAssignee?.get(c.id);
    const acc = st && st.shown >= 2 ? st.accepts / st.shown : 0;
    const score = 0.55 * tf + 0.25 * mem + 0.2 * acc;
    return { id: c.id, score };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/** Median actual cycle (created → completed) in days, or null. */
export function medianCycleDays(samples: number[]): number | null {
  const xs = samples.filter((d) => d >= 0 && d <= 180).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const m = Math.floor(xs.length / 2);
  const v = xs.length % 2 ? xs[m] : Math.round((xs[m - 1] + xs[m]) / 2);
  return Math.max(1, v);
}

export function dueFromCycle(medianDays: number, now = new Date()): { date: string; days: number } {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + medianDays);
  return { date: d.toISOString().slice(0, 10), days: medianDays };
}
