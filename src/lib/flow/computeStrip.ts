/**
 * Flow Signal — server-side strip computation.
 *
 * Fact-based path only (Phase 0–3 launch). Inferred / learned layers
 * (anomaly baseline, survival model, text classifier, bandit) are intentionally
 * deferred — they require accumulated history to be safe, and the
 * TaskFlowEvent stream lit up in Phase 1 will gather that data quietly. When
 * those layers are added, they should plug in here under the same payload
 * shape so the client never has to change.
 *
 * Privacy guarantees enforced here:
 *   - Private task overlays (privateToUserId) are visible only to their owner.
 *   - Personal projects (isPersonal / PRSN- code) never appear in any other
 *     user's strip.
 *   - The caller's `scope` controls which projects are visible — admin still
 *     sees only what their scope grants, not the whole workspace.
 *
 * What counts as a "fact" today (Layer 1):
 *   - Task status is 'blocked' on a shared, non-personal task; OR
 *   - flowPendingType is populated AND flowResolvedAt is null (a confirmed
 *     waiting/decision/help report from the assignee that hasn't been cleared).
 *
 * What does NOT count:
 *   - A due date alone. Pragati already has Due & Overdue surfaces; this
 *     feature must remain orthogonal (spec is explicit).
 *   - Inferred silence. That's Phase 4+ (anomaly baseline) and lives behind
 *     a separate flag, off by default.
 */

import type { FlowConfig } from './config';

/** Shape rendered by the dashboard strip (mirrors getLeadDashboardData). */
export interface FlowSignalItem {
  taskId: string;
  projectId: string;
  projectCode?: string;
  taskTitle: string;
  /** Plain neutral copy, e.g. "Waiting on approval", "Help requested". */
  headline: string;
  /** Optional extra context, never employee-blaming. */
  detail?: string;
  /** Bounded reason codes — drives the dot colour client-side. */
  reasonCodes: string[];
  pendingType?: string;
  /** True when the item was confirmed by a user (fact). Inferred items would
   *  set this false; today's launch only emits facts so it's always true. */
  confirmed: boolean;
  confirmedByName?: string;
  confirmedAt?: string;
}

export interface FlowSignalPayload {
  mode: 'quick_check' | 'needs_attention' | 'check_needed';
  items: FlowSignalItem[];
  additionalCount: number;
}

interface CandidateTask {
  _id: any;
  title: string;
  projectId: any;
  assigneeId?: any;
  status?: string;
  privateToUserId?: any;
  flowPendingType?: string | null;
  flowPendingDetail?: string;
  flowPendingConfirmedAt?: Date | string | null;
  flowPendingConfirmedByUserId?: any;
  flowResolvedAt?: Date | string | null;
}

interface CandidateProject {
  _id: any;
  code?: string;
  name?: string;
  isPersonal?: boolean;
  ownerId?: any;
}

export interface ComputeStripArgs {
  viewer: { id: string; role: string };
  tasks: CandidateTask[];
  projects: CandidateProject[];
  /** Lookup of user id → display name, for "Confirmed today by X" copy. */
  userNameById: Map<string, string>;
  cfg: FlowConfig;
}

const HEADLINE_BY_PENDING: Record<string, string> = {
  approval: 'Waiting on approval',
  another_team: 'Waiting on another team',
  person: 'Waiting on a person',
  other: 'Waiting',
  decision: 'Decision needed',
  help: 'Help requested',
};

/**
 * Pure, deterministic, no DB calls. Tests can drive this directly.
 *
 * The fact path produces "needs_attention" items only (everything we emit
 * is user-confirmed). Once the inferred layers ship, this function will
 * also produce "quick_check" (ask the assignee) and "check_needed"
 * (degraded, neutral language for stale unanswered prompts).
 */
export function computeFlowStrip(args: ComputeStripArgs): FlowSignalPayload | null {
  const { viewer, tasks, projects, userNameById, cfg } = args;

  if (cfg.mode === 'off' || cfg.mode === 'shadow') return null;
  if (!cfg.factsEnabled) return null;

  // Project lookup — drop personal projects entirely. The Task path also
  // drops private overlays the viewer doesn't own.
  const projectById = new Map<string, CandidateProject>();
  for (const p of projects) {
    if (p.isPersonal || (p.code && String(p.code).startsWith('PRSN-'))) continue;
    projectById.set(String(p._id), p);
  }

  const isLeadOrAdmin = viewer.role === 'lead' || viewer.role === 'admin' || viewer.role === 'pm';
  const candidates: FlowSignalItem[] = [];

  for (const t of tasks) {
    // Skip private overlays viewer doesn't own. The dashboard query already
    // applies the same filter, but defense-in-depth here costs nothing.
    if (t.privateToUserId && String(t.privateToUserId) !== String(viewer.id)) continue;
    const proj = projectById.get(String(t.projectId));
    if (!proj) continue; // personal or out-of-scope

    // Contributor view: only items on tasks assigned to the contributor.
    if (!isLeadOrAdmin) {
      if (!t.assigneeId || String(t.assigneeId) !== String(viewer.id)) continue;
    }

    // Fact 1: confirmed pending state, not yet resolved.
    const pending = t.flowPendingType;
    if (pending && !t.flowResolvedAt) {
      const confirmedBy = t.flowPendingConfirmedByUserId
        ? userNameById.get(String(t.flowPendingConfirmedByUserId))
        : undefined;
      candidates.push({
        taskId: String(t._id),
        projectId: String(t.projectId),
        projectCode: proj.code,
        taskTitle: t.title || '',
        headline: HEADLINE_BY_PENDING[pending] || 'Needs attention',
        detail: t.flowPendingDetail || undefined,
        reasonCodes: [pending, 'confirmed'],
        pendingType: pending,
        confirmed: true,
        confirmedByName: confirmedBy,
        confirmedAt: t.flowPendingConfirmedAt ? new Date(t.flowPendingConfirmedAt).toISOString() : undefined,
      });
      continue;
    }

    // Fact 2: explicit 'blocked' status — observable, no inference. Skip
    // when a confirmed pending state is already present (handled above)
    // so we don't double-emit on the same task.
    if (t.status === 'blocked') {
      candidates.push({
        taskId: String(t._id),
        projectId: String(t.projectId),
        projectCode: proj.code,
        taskTitle: t.title || '',
        headline: 'Marked blocked',
        reasonCodes: ['blocked', 'status'],
        confirmed: true,
      });
    }
  }

  // Order: pending-with-confirmation first (it's a user-attested blocker),
  // then status-blocked items. Within each bucket, alphabetical by title so
  // the strip is deterministic for the demo.
  candidates.sort((a, b) => {
    const ap = a.reasonCodes.includes('confirmed') ? 0 : 1;
    const bp = b.reasonCodes.includes('confirmed') ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  if (candidates.length === 0) return null;

  const maxItems = isLeadOrAdmin ? cfg.maxLeadItems : 1;
  const items = candidates.slice(0, maxItems);
  const additionalCount = Math.max(0, candidates.length - items.length);

  return {
    mode: 'needs_attention',
    items,
    additionalCount,
  };
}
