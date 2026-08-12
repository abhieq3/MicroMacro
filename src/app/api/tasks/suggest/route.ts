import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { SuggestionEvent } from '@/models/SuggestionEvent';
import {
  RANKER_VERSION,
  assignVariant,
  dueFromCycle,
  medianCycleDays,
  rerankAssignees,
} from '@/lib/ai/ranker';

export const runtime = 'nodejs';

/**
 * Task assist — assignee + due-date suggestions.
 *
 * Deliberately *not* an LLM: this is a small, transparent, locally-traceable
 * model so a reviewer can point at the inputs behind any suggestion (the same
 * reproducibility principle the QA triage engine follows). Two signals:
 *
 *   • Assignee — TF-IDF keyword overlap between the new title and the team's
 *     historical task titles, accumulated per assignee. "Who has done work
 *     that reads like this before?"
 *   • Due date — the median lead time (created → due) of the team's past tasks,
 *     so the suggested date matches how this team actually schedules.
 *
 * Read-only, never writes — task creation still flows through POST /api/tasks
 * with full Zod validation. The user always confirms before anything is saved.
 */

const STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'and',
  'or',
  'in',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'is',
  'are',
  'be',
  'this',
  'that',
  'task',
  'tasks',
  'new',
  'update',
  'updates',
  'review',
  'reviews',
  'fix',
  'add',
  'create',
  'check',
  'do',
  'make',
  'use',
  'per',
  'via',
  'into',
  'out',
  'up',
  'all',
  'any',
  'no',
  'not',
]);

function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      (
        String(s)
          .toLowerCase()
          .match(/[a-z0-9]+/g) || []
      ).filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  );
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId') || '';
    const title = (url.searchParams.get('title') || '').trim();
    const empty = NextResponse.json({ assignee: null, dueDate: null });
    if (!projectId || title.length < 3) return empty;

    // Honour the same visibility the user already has on the project page.
    const scope = await getLeadScope(user!.sub, user!.role);
    const project = await Project.findOne({ _id: projectId, ...projectsVisibleFilter(scope) })
      .select('_id teamId')
      .lean();
    if (!project) return empty;

    // History = tasks across the project's team (or just this project if none).
    let projectIds: any[] = [projectId];
    if ((project as any).teamId) {
      const teamProjects = await Project.find({ teamId: (project as any).teamId })
        .select('_id')
        .lean();
      if (teamProjects.length) projectIds = teamProjects.map((p) => p._id);
    }

    const history = await Task.find({ projectId: { $in: projectIds } })
      .select('title assigneeId createdAt dueDate completedAt')
      .sort({ createdAt: -1 })
      .limit(600)
      .lean();

    // ── Due-date signal: median lead time (created → due) ──────────────────
    const leadTimes: number[] = [];
    for (const t of history as any[]) {
      if (t.dueDate && t.createdAt) {
        const days = Math.round((+new Date(t.dueDate) - +new Date(t.createdAt)) / 86_400_000);
        if (days >= 0 && days <= 180) leadTimes.push(days);
      }
    }
    let dueSuggestion: { date: string; days: number; reason: string } | null = null;
    if (leadTimes.length >= 3) {
      const days = Math.min(60, Math.max(1, median(leadTimes)));
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() + days);
      dueSuggestion = {
        date: d.toISOString().slice(0, 10),
        days,
        reason: `Similar work here is usually due in ~${days} day${days === 1 ? '' : 's'}`,
      };
    }

    // ── Assignee signal: TF-IDF keyword overlap, accumulated per assignee ──
    const queryTokens = tokenize(title);
    if (!queryTokens.length) return NextResponse.json({ assignee: null, dueDate: dueSuggestion });

    // Document frequency over historical titles (for IDF weighting).
    const df = new Map<string, number>();
    const docTokens: { assigneeId: string; toks: Set<string> }[] = [];
    for (const t of history as any[]) {
      if (!t.assigneeId) continue;
      const toks = new Set(tokenize(t.title));
      if (!toks.size) continue;
      docTokens.push({ assigneeId: String(t.assigneeId), toks });
      for (const tok of toks) df.set(tok, (df.get(tok) || 0) + 1);
    }
    const N = Math.max(1, docTokens.length);
    const idf = (tok: string) => Math.log(1 + N / (df.get(tok) || 0.5));

    const perAssignee = new Map<string, { score: number; count: number; terms: Set<string> }>();
    for (const doc of docTokens) {
      let score = 0;
      const matched: string[] = [];
      for (const tok of queryTokens) {
        if (doc.toks.has(tok)) {
          score += idf(tok);
          matched.push(tok);
        }
      }
      if (score <= 0) continue;
      const cur = perAssignee.get(doc.assigneeId) || { score: 0, count: 0, terms: new Set<string>() };
      cur.score += score;
      cur.count += 1;
      matched.forEach((m) => cur.terms.add(m));
      perAssignee.set(doc.assigneeId, cur);
    }

    const variant = assignVariant(user!.sub, projectId);
    const candidates = [...perAssignee.entries()].map(([id, v]) => ({
      id,
      tfidf: v.score,
      count: v.count,
    }));

    let pickId: string | null = null;
    let pickReason = '';
    let pickCount = 0;
    let pickTerms = '';

    if (variant === 'ranker' && candidates.length) {
      const queryToks = new Set(queryTokens);
      let tokenLastAssigneeId = '';
      for (const t of history as any[]) {
        if (!t.assigneeId || !t.completedAt) continue;
        const toks = tokenize(t.title || '');
        if (toks.some((x) => queryToks.has(x))) {
          tokenLastAssigneeId = String(t.assigneeId);
          break; // history is newest-first
        }
      }
      const events = await SuggestionEvent.find({ projectId: { $in: projectIds } })
        .select('suggestedAssigneeId chosenAssigneeId acceptedAssignee')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
      const acceptByAssignee = new Map<string, { shown: number; accepts: number }>();
      for (const ev of events as any[]) {
        const sid = String(ev.suggestedAssigneeId || '');
        if (!sid) continue;
        const cur = acceptByAssignee.get(sid) || { shown: 0, accepts: 0 };
        cur.shown += 1;
        if (ev.acceptedAssignee) cur.accepts += 1;
        acceptByAssignee.set(sid, cur);
      }
      const reranked = rerankAssignees(candidates, { tokenLastAssigneeId, acceptByAssignee });
      pickId = reranked[0]?.id || null;
      const raw = pickId ? perAssignee.get(pickId) : null;
      pickCount = raw?.count || 0;
      pickTerms = raw ? [...raw.terms].slice(0, 3).join(', ') : '';
      pickReason = `Ranker: handled ${pickCount} similar${pickTerms ? ` (${pickTerms})` : ''}`;
    } else if (candidates.length) {
      const ranked = [...perAssignee.entries()].sort((a, b) => b[1].score - a[1].score);
      pickId = ranked[0][0];
      pickCount = ranked[0][1].count;
      pickTerms = [...ranked[0][1].terms].slice(0, 3).join(', ');
      pickReason = `Handled ${pickCount} similar task${pickCount === 1 ? '' : 's'}${pickTerms ? ` (${pickTerms})` : ''}`;
    }

    let assigneeSuggestion: { id: string; name: string; confidence: number; reason: string } | null = null;
    if (pickId) {
      const u = await User.findById(pickId).select('name active').lean();
      if (u && (u as any).active !== false) {
        const total = candidates.reduce((s, c) => s + c.tfidf, 0) || 1;
        const top = perAssignee.get(pickId);
        assigneeSuggestion = {
          id: pickId,
          name: (u as any).name,
          confidence: Math.round(((top?.score || 0) / total) * 100) / 100,
          reason: pickReason,
        };
      }
    }

    if (variant === 'ranker') {
      const cycles: number[] = [];
      const qtoks = new Set(queryTokens);
      for (const t of history as any[]) {
        if (!t.completedAt || !t.createdAt) continue;
        const toks = tokenize(t.title || '');
        if (!toks.some((x) => qtoks.has(x))) continue;
        const days = Math.round((+new Date(t.completedAt) - +new Date(t.createdAt)) / 86_400_000);
        if (days >= 0 && days <= 180) cycles.push(days);
      }
      const med = medianCycleDays(cycles);
      if (med != null) {
        const d = dueFromCycle(med);
        dueSuggestion = {
          date: d.date,
          days: d.days,
          reason: `Similar work here usually finishes in ~${d.days} day${d.days === 1 ? '' : 's'}`,
        };
      }
    }

    return NextResponse.json({
      assignee: assigneeSuggestion,
      dueDate: dueSuggestion,
      variant,
      modelVersion: RANKER_VERSION,
    });
  } catch (e) {
    return handleError(e);
  }
}
