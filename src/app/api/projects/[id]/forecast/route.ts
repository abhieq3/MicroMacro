import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { getProjectDetail } from '@/lib/projectDetail';
import {
  cycleSamplesByAssignee,
  fitDurationModels,
  simulateProjectFinish,
  speedOfLightDays,
  type ForecastTaskInput,
} from '@/lib/ai/projectForecast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/[id]/forecast
 *
 * Heavy lifting (learn per-person duration models from history → Monte-Carlo
 * the remaining schedule a few thousand times) for a deliberately tiny result:
 * a likely finish date, an 80% date, and the one constraint worth acting on.
 *
 * Cached in-process for a few minutes — the simulation is cheap but the history
 * query isn't worth repeating on every board mount.
 */

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; payload: any }>();
const HISTORY_WINDOW_MS = 18 * 30 * DAY();
function DAY() {
  return 86_400_000;
}

// Deterministic per-project seed → the same project forecasts identically until
// its data changes (auditable, no flicker between mounts).
function seedFrom(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid project id' }, { status: 400 });
    }

    const cached = cache.get(params.id);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json(cached.payload);
    }

    // Access-controlled fetch of the project + its board tasks + phases.
    const project = await getProjectDetail(params.id, user.sub, user.role);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const status = (project as any).status;
    if (status === 'completed' || status === 'cancelled') {
      return ok(params.id, { ok: false, reason: 'completed' });
    }

    const tasks: any[] = Array.isArray((project as any).tasks) ? (project as any).tasks : [];
    const openTasks = tasks.filter((t) => t.status !== 'done');
    if (openTasks.length === 0) {
      return ok(params.id, { ok: false, reason: 'no_open_tasks' });
    }

    // Phase sequencing: map each phase id → its 0-based order.
    const phases: any[] = Array.isArray((project as any).phases) ? (project as any).phases : [];
    const ordered = [...phases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const phaseIndex = new Map<string, number>();
    ordered.forEach((ph, i) => phaseIndex.set(String(ph.id), i));
    const phaseName = new Map<number, string>();
    ordered.forEach((ph, i) => phaseName.set(i, ph.name || `Phase ${i + 1}`));

    // Learn duration models from completed work across the workspace (bounded
    // window). Per-assignee profiles are shrunk toward this global pool.
    await connectDB();
    const cutoff = new Date(Date.now() - HISTORY_WINDOW_MS);
    const history = await Task.find({ status: 'done', completedAt: { $gte: cutoff } })
      .select('assigneeId createdAt completedAt')
      .limit(8000)
      .lean();

    const samples = cycleSamplesByAssignee(history as any[]);
    const { byAssignee, global } = fitDurationModels(samples);

    if (global.n < 3) {
      return ok(params.id, { ok: false, reason: 'insufficient_history' });
    }

    const inputs: ForecastTaskInput[] = openTasks.map((t) => ({
      id: String(t.id),
      assigneeId: t.assigneeId ? String(t.assigneeId) : null,
      status: t.status,
      phaseIndex: t.phaseId ? (phaseIndex.get(String(t.phaseId)) ?? 0) : 0,
      priority: t.priority,
    }));

    const now = new Date();
    const core = simulateProjectFinish({
      tasks: inputs,
      byAssignee,
      global,
      now,
      trials: 4000,
      seed: seedFrom(params.id),
    });

    // Speed of light — the theoretical fastest finish (phases in sequence,
    // zero queueing, every task at its assignee's demonstrated-fast pace).
    // The gap to the P50 forecast is the actionable slack: contention,
    // queueing, variance. See lib/ai/projectForecast.ts for the physics.
    const solDays = speedOfLightDays({ tasks: inputs, byAssignee, global });
    const sol = new Date(+now + solDays * DAY()).toISOString();

    // ── The long pole: prefer naming a person if one assignee binds often;
    //    otherwise name the binding phase. ───────────────────────────────────
    const assigneeName = new Map<string, string>();
    for (const t of tasks)
      if (t.assigneeId && t.assigneeName) assigneeName.set(String(t.assigneeId), t.assigneeName);
    let longPole: { kind: 'assignee' | 'phase'; label: string; share: number } | null = null;
    if (core.longPoleAssignee && core.longPoleAssignee.share >= 0.3) {
      const nm = assigneeName.get(core.longPoleAssignee.assigneeId);
      if (nm) longPole = { kind: 'assignee', label: nm, share: core.longPoleAssignee.share };
    }
    if (!longPole && core.longPolePhase && phases.length > 1) {
      longPole = {
        kind: 'phase',
        label: phaseName.get(core.longPolePhase.phaseIndex) || 'a later phase',
        share: core.longPolePhase.share,
      };
    }

    // ── Confidence: how much of the plan is backed by real personal history. ─
    const modelledRatio = core.openTasks ? core.modelledTasks / core.openTasks : 0;
    const confidence: 'high' | 'medium' | 'low' =
      modelledRatio >= 0.6 && global.n >= 30
        ? 'high'
        : modelledRatio >= 0.3 || global.n >= 10
          ? 'medium'
          : 'low';

    // ── How the forecast sits against the committed due date, if any. ────────
    const dueIso = (project as any).dueDate || null;
    let vsTarget: 'on_track' | 'tight' | 'at_risk' | null = null;
    if (dueIso) {
      const due = +new Date(dueIso);
      vsTarget = +new Date(core.p80) <= due ? 'on_track' : +new Date(core.p50) <= due ? 'tight' : 'at_risk';
    }

    const payload = {
      ok: true,
      p50: core.p50,
      p80: core.p80,
      p90: core.p90,
      p50Days: Math.round(core.p50Days),
      p80Days: Math.round(core.p80Days),
      p90Days: Math.round(core.p90Days),
      sol,
      solDays: Math.round(solDays),
      longPole,
      confidence,
      openTasks: core.openTasks,
      modelledTasks: core.modelledTasks,
      targetDate: dueIso,
      vsTarget,
      summary: `Likely around ${shortDate(core.p50)} · 80% by ${shortDate(core.p80)}`,
    };
    return ok(params.id, payload);
  } catch (e) {
    return handleError(e);
  }
}

function ok(id: string, payload: any) {
  cache.set(id, { at: Date.now(), payload });
  return NextResponse.json(payload);
}
