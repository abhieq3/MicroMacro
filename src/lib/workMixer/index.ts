/**
 * Work Mixer — public surface (Phase 1).
 *
 * A free-stack translation of X/Twitter's Product Mixer, kept small and easy to
 * remove:
 *   candidate sourcing → deterministic scoring → permission filtering → grouped
 *   output.
 *
 * Nothing here runs unless a caller invokes it. The optional shadow integration
 * in leadDashboard.ts is gated behind WORK_MIXER_ENABLED (default false), so by
 * default this module is dead-simple, dead-safe, dead weight — exactly as Phase
 * 1 intends.
 */

import { buildCandidatesFromDashboardData } from './candidates';
import { filterWorkCandidates } from './filters';
import { buildWorkMixer, type BuildWorkMixerOptions } from './mix';
import type { WorkMixerResult } from './types';

export * from './types';
export { SCORE_WEIGHTS, classifyWorkCandidate, scoreWorkCandidate } from './score';
export { buildWorkMixer } from './mix';
export type { BuildWorkMixerOptions } from './mix';
export { taskToCandidate, projectToCandidate, buildCandidatesFromDashboardData } from './candidates';
export { filterWorkCandidates } from './filters';

/**
 * End-to-end convenience: take an already-computed, already-permission-filtered
 * dashboard payload and produce the mixer result. This is the single entry the
 * shadow integration calls — it never queries the DB itself.
 */
export function buildWorkMixerFromDashboardData(data: any, opts: BuildWorkMixerOptions): WorkMixerResult {
  const candidates = filterWorkCandidates(buildCandidatesFromDashboardData(data));
  return buildWorkMixer(candidates, opts);
}
