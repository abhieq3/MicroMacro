'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  Scan,
  Download,
  Layers,
  RotateCcw,
  Pencil,
  Check,
  Brush,
  Eraser,
  Plus,
  Search,
  Copy,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import { notifyCalendarChange } from '@/components/SidebarCalendar';

/**
 * Bird's-Eye View — a clean, executive top-down map of a workspace / team /
 * project. Renders as a packed org-chart with curved connectors. No external
 * graph library — a pure-SVG layout keeps the bundle small and means the
 * export pipeline (print → save-as-PDF, save-as-SVG) sees identical pixels to
 * the on-screen view.
 *
 * Hierarchy by scope:
 *   workspace → teams → projects → tasks (tasks stacked vertically per project)
 *   team      → projects → tasks
 *   project   → phases   → tasks
 *
 * The tree is *deterministic* (alphabetical at each level, then by status) so
 * opening the same view from two sessions paints the same shape. It changes
 * only when the underlying work changes, never because of layout jitter — that
 * reproducibility is what makes it a trustworthy reference for a review.
 *
 * Layout invariants the rest of the file relies on:
 *   • Parents are horizontally centred over their children (no overlap).
 *   • Tasks never fan sideways — one project owns exactly one task column, so a
 *     30-task project lengthens its own column instead of distorting the tree.
 *   • The initial view auto-fits the viewport and centres horizontally, so a
 *     sparse tree (1 team · 1 project) is centred rather than pinned to a
 *     narrow left gutter.
 */

export interface BirdsEyeTeam {
  id: string;
  name: string;
  ownerName?: string | null;
}

export interface BirdsEyeProject {
  id: string;
  code: string;
  name: string;
  teamId?: string | null;
  health: 'healthy' | 'at_risk' | 'critical';
  taskCount: number;
  tasksDone: number;
  dueDate?: string | null;
  ownerName?: string | null;
}

export interface BirdsEyeTask {
  id: string;
  title: string;
  projectId: string;
  status: string;
  assigneeName?: string | null;
  dueDate?: string | null;
  /** Project-scope only: groups tasks under a phase row. Ignored elsewhere. */
  phaseName?: string | null;
  /** Explicit project-detail ordering, retained in project-scope exports. */
  position?: number;
  phasePosition?: number;
  subtaskCount?: number;
  subtasksDone?: number;
  /** First few subtask titles for inline rendering inside the task node. */
  subtaskTitles?: string[];
}

/**
 * Slip-risk urgency — a calibrated LOGISTIC model, not an ad-hoc point sum.
 *
 * Returns an interpretable 0–100 *probability that the task slips its date*,
 * the same model family as lib/ai/slipRisk.ts: engineer a few bounded features
 * from the data we already have, combine them in log-odds space with
 * hand-calibrated weights, and squash through a sigmoid. Because the output is
 * a probability, the "HEAT %" badge and the colour ramp suddenly *mean*
 * something, and the time simulation is a genuine forward projection: advancing
 * `simDays` shrinks the runway, raises the time-pressure feature, and the
 * probability climbs — you are watching the model re-forecast the future, not
 * re-bucketing a counter.
 *
 * Deterministic and dependency-free (runs over the rows already on screen), so
 * it stays free-forever and reproducible — every score traces to these weights.
 */
export function computeTaskUrgency(t: BirdsEyeTask, simDays = 0): number {
  if (t.status === 'done') return 0;
  const now = Date.now() + simDays * 86400000;

  // ── Features (each bounded to [0,1] so a weight is its full influence) ──
  // 1) Time pressure: a smooth runway signal. Overdue saturates at 1; a date
  //    two weeks out contributes ~nothing. Undated work carries no time
  //    pressure (the model leans on flow + progress instead).
  let timePressure = 0;
  if (t.dueDate) {
    const days = (new Date(t.dueDate).getTime() - now) / 86400000;
    timePressure = days <= 0 ? 1 : Math.max(0, Math.min(1, 1 - days / 14));
  }
  // 2) Progress deficit: how much remains. Neutral (0.5) when a task has no
  //    subtasks to measure, so we neither reward nor punish the unknown.
  const hasSubs = (t.subtaskCount ?? 0) > 0;
  const progress = hasSubs ? (t.subtasksDone ?? 0) / (t.subtaskCount as number) : 0.5;
  const deficit = 1 - progress;
  // 3) Flow state.
  const blocked = t.status === 'blocked' ? 1 : 0;
  const inReview = t.status === 'review' ? 1 : 0;

  // ── Log-odds (hand-calibrated logistic regression) ──
  // Base prior is low (most open work is not at risk); features push it up.
  // The deficit term is gated by time pressure — being unfinished only matters
  // as the deadline closes — which is the interaction a flat point-sum misses.
  const z =
    -2.1 +
    2.9 * timePressure +
    1.6 * (deficit * Math.max(timePressure, 0.25)) +
    2.0 * blocked +
    0.7 * inReview;
  const p = 1 / (1 + Math.exp(-z));
  return Math.round(p * 100);
}

/** Elon first-principles: the tree should let you *see the truth and fix it fast*.
 *  At team level: see which projects are leaking value.
 *  At project level: see the critical path and blockers instantly.
 *  Rebalance mode: sort the visual layout by urgency so high-leverage work rises to the top.
 */
export function getSortedTasksForView(tasks: BirdsEyeTask[], urgencyFocus: number): BirdsEyeTask[] {
  return [...tasks].sort((a, b) => {
    const ua = computeTaskUrgency(a);
    const ub = computeTaskUrgency(b);
    if (ua !== ub) return ub - ua; // high urgency first
    // Fallback to original deterministic order
    return 0;
  });
}

export interface BirdsEyeData {
  rootLabel: string; // e.g. "Abhi Patel's workspace" or "BOT Automation"
  rootSubLabel?: string;
  teams: BirdsEyeTeam[]; // can be empty for project-only view
  projects: BirdsEyeProject[];
  tasks: BirdsEyeTask[];
  /** Which level the root represents — drives node-shape choices. */
  scope: 'workspace' | 'team' | 'project';
}

/* ── Status / health palette ───────────────────────────────────────────────
   Kept deliberately muted: a pale fill with a saturated 1px edge. Status is
   communicated by the edge, not a loud block of colour, so a dense board reads
   as a calm executive overview rather than a developer graph. */
const STATUS_FILL: Record<string, string> = {
  todo: '#f8fafc',
  in_progress: '#eff6ff',
  review: '#fffbeb',
  blocked: '#fef2f2',
  done: '#f0fdf4',
};
const STATUS_STROKE: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
};
const STATUS_DOT = STATUS_STROKE;
const HEALTH_FILL: Record<string, string> = {
  healthy: '#f0fdf4',
  at_risk: '#fffbeb',
  critical: '#fef2f2',
};
const HEALTH_STROKE: Record<string, string> = {
  healthy: '#16a34a',
  at_risk: '#d97706',
  critical: '#dc2626',
};

// Urgency color ramp – the visual language that makes this the greatest feature.
// Calm at low urgency, increasingly insistent (but never garish) at high.
const URGENCY_STROKE = (u: number) => {
  if (u >= 70) return '#dc2626'; // critical red
  if (u >= 45) return '#ea580c'; // urgent orange
  if (u >= 25) return '#ca8a04'; // warning amber
  return null; // use normal status/health
};

const URGENCY_WIDTH = (u: number) => {
  if (u >= 70) return 3.5;
  if (u >= 45) return 2.5;
  if (u >= 25) return 1.8;
  return 1;
};

interface PositionedNode {
  kind: 'root' | 'team' | 'project' | 'phase' | 'task' | 'count';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  /** Pre-wrapped title lines, computed at layout time so the node box and the
   *  text agree on how many rows are drawn. */
  titleLines?: string[];
  data?: any;
  /** Whether inline subtask list is visible (computed in fitTaskHeight). */
  showSubtasks?: boolean;
}

interface Edge {
  from: string;
  to: string;
}

// Top-down org-chart geometry. Nodes shrink at deeper levels so a wide tree
// stays scannable from above. Sizes tuned to keep the default (tasks-collapsed)
// view clean — individual projects expand to show task detail on demand.
const NODE_WIDTH = { root: 280, team: 226, project: 240, phase: 210, task: 220, count: 202 } as const;
const NODE_HEIGHT = { root: 88, team: 66, project: 68, phase: 58, task: 46, count: 32 } as const;
// Air between things is what separates "aerial view" from "circuit diagram".
// These gaps were widened after the dense first pass read as congested: the
// auto-fit always frames the whole tree anyway, so extra whitespace costs a
// little zoom, not screen space — and buys a lot of scannability.
const LEVEL_GAP_Y = 88; // vertical distance between depth levels
const SIBLING_GAP_X = 32; // horizontal distance between siblings of the same parent
const SUBTREE_GAP_X = 58; // extra horizontal gap between sibling subtrees
const TASK_STACK_GAP_Y = 12; // vertical spacing inside a project's task stack
const PADDING = 64; // canvas padding around the whole tree

function nodeKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

/** Greedy word-wrap for SVG text. Returns up to `maxLines` lines, ellipsising
 *  the final line if the text overflows. Sized by an average glyph width so the
 *  box drawn around it is wide enough without measuring the DOM. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  // If we ran out of room mid-text, mark the truncation on the last line.
  const consumed = lines.join(' ').length;
  if (consumed < text.replace(/\s+/g, ' ').length && lines.length) {
    let last = lines[lines.length - 1];
    if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1);
    lines[lines.length - 1] = last.replace(/[\s.]+$/, '') + '…';
  }
  return lines.length ? lines : [''];
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Pure layout pass. Returns absolute coordinates for every node + the edges
 * between them. Deterministic (alphabetical) so the export and the on-screen
 * view share pixel coordinates. Direction is strictly top-down.
 */
function layout(
  data: BirdsEyeData,
  opts: { collapseTasks: boolean; collapsedIds?: ReadonlySet<string>; rebalanceMode?: boolean },
): {
  nodes: PositionedNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];

  // Group projects by team. Projects with no team fall into a synthetic bucket
  // so they still appear in the workspace view.
  const projectsByTeam = new Map<string, BirdsEyeProject[]>();
  const teamMap = new Map<string, BirdsEyeTeam>();
  for (const t of data.teams) teamMap.set(t.id, t);
  for (const p of data.projects) {
    const k = p.teamId || '_untethered_';
    if (!projectsByTeam.has(k)) projectsByTeam.set(k, []);
    projectsByTeam.get(k)!.push(p);
  }
  for (const list of projectsByTeam.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  // Group tasks by project, ordered by status (active first → done last) so a
  // project always renders its column the same way.
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };
  const sortTasks = (a: BirdsEyeTask, b: BirdsEyeTask) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    return s !== 0 ? s : a.title.localeCompare(b.title);
  };
  const tasksByProject = new Map<string, BirdsEyeTask[]>();
  for (const t of data.tasks) {
    if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
    tasksByProject.get(t.projectId)!.push(t);
  }
  for (const list of tasksByProject.values()) {
    if (opts.rebalanceMode) {
      // Elon rebalance: urgency rises. This is what makes the view the greatest control surface.
      // Team level: cross-project priorities surface. Project level: the real work order appears.
      list.sort((a, b) => computeTaskUrgency(b) - computeTaskUrgency(a) || sortTasks(a, b));
    } else {
      list.sort(sortTasks);
    }
  }

  type Subtree = { node: PositionedNode; children: Subtree[]; width: number; tasks?: PositionedNode[] };

  // Build a vertical task stack of PositionedNodes (positions filled later).
  function taskStack(tasks: BirdsEyeTask[], keyPrefix: string): PositionedNode[] {
    const out: PositionedNode[] = [];
    if (opts.collapseTasks && tasks.length > 0) {
      const done = tasks.filter((t) => t.status === 'done').length;
      out.push({
        kind: 'count',
        id: `count:${keyPrefix}`,
        x: 0,
        y: 0,
        width: NODE_WIDTH.count,
        height: NODE_HEIGHT.count,
        label: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
        sub: `${done}/${tasks.length} done`,
      });
      return out;
    }
    const TASK_CAP = 80;
    for (const t of tasks.slice(0, TASK_CAP)) {
      out.push({
        kind: 'task',
        id: nodeKey('task', t.id),
        x: 0,
        y: 0,
        width: NODE_WIDTH.task,
        height: NODE_HEIGHT.task,
        label: t.title,
        titleLines: wrapText(t.title, 30, 2),
        sub: [t.assigneeName, t.status?.replace(/_/g, ' ')].filter(Boolean).join(' · '),
        data: t,
      });
    }
    if (tasks.length > TASK_CAP) {
      out.push({
        kind: 'count',
        id: `more:${keyPrefix}`,
        x: 0,
        y: 0,
        width: NODE_WIDTH.count,
        height: NODE_HEIGHT.count,
        label: `+${tasks.length - TASK_CAP} more — use Group tasks`,
      });
    }
    return out;
  }

  // Re-measure a node's height to fit its wrapped title + optional inline
  // subtask list. Subtask rows are shown when the task has subtask titles AND
  // the node is NOT collapsed in collapsedIds.
  function fitTaskHeight(n: PositionedNode) {
    const t = n.data as BirdsEyeTask | undefined;
    const lines = n.titleLines?.length || 1;
    const subRows = n.sub ? 1 : 0;
    const rawTitles = t?.subtaskTitles;
    const hasSubData = rawTitles && rawTitles.length > 0;
    const taskCollapsed = collapsedIds.has(n.id);
    n.showSubtasks = hasSubData && !taskCollapsed;
    if (n.showSubtasks) {
      const visibleRows = Math.min(3, rawTitles!.length);
      // title rows + assignee row + subtask rows + progress strip
      n.height = 14 + lines * 15 + subRows * 12 + visibleRows * 12 + 10;
    } else {
      n.height = 14 + lines * 15 + subRows * 13;
    }
  }

  const collapsedIds = opts.collapsedIds || new Set<string>();

  function buildProjectSubtree(p: BirdsEyeProject): Subtree {
    const id = nodeKey('project', p.id);
    const collapsed = collapsedIds.has(id);
    const tasks = collapsed ? [] : tasksByProject.get(p.id) || [];
    const taskNodes = taskStack(tasks, p.id);
    taskNodes.forEach((t) => {
      if (t.kind === 'task') fitTaskHeight(t);
    });
    const projectNode: PositionedNode = {
      kind: 'project',
      id,
      x: 0,
      y: 0,
      width: NODE_WIDTH.project,
      height: NODE_HEIGHT.project,
      label: p.name,
      titleLines: wrapText(p.name, 28, 2),
      sub: `${p.code} · ${p.tasksDone}/${p.taskCount} done`,
      data: p,
    };
    return { node: projectNode, children: [], width: NODE_WIDTH.project, tasks: taskNodes };
  }

  function buildTeamSubtree(team: BirdsEyeTeam, teamProjects: BirdsEyeProject[]): Subtree {
    const id = nodeKey('team', team.id);
    const collapsed = collapsedIds.has(id);
    const teamNode: PositionedNode = {
      kind: 'team',
      id,
      x: 0,
      y: 0,
      width: NODE_WIDTH.team,
      height: NODE_HEIGHT.team,
      label: team.name,
      titleLines: wrapText(team.name, 26, 2),
      sub: team.ownerName ? `Lead · ${team.ownerName}` : undefined,
      data: team,
    };
    const children = collapsed ? [] : teamProjects.map(buildProjectSubtree);
    const childrenW =
      children.length === 0
        ? NODE_WIDTH.team
        : children.reduce((sum, c) => sum + c.width + SIBLING_GAP_X, -SIBLING_GAP_X);
    return { node: teamNode, children, width: Math.max(NODE_WIDTH.team, childrenW) };
  }

  // Project scope: phases become the horizontal level, each owning a task
  // column — so the view reads Project → Phases → Tasks.
  function buildPhaseSubtrees(): Subtree[] {
    const byPhase = new Map<string, BirdsEyeTask[]>();
    const order: string[] = [];
    const projectOrder = [...data.tasks].sort(
      (a, b) =>
        (a.phasePosition ?? Number.MAX_SAFE_INTEGER) - (b.phasePosition ?? Number.MAX_SAFE_INTEGER) ||
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
    );
    for (const t of projectOrder) {
      const name = (t.phaseName && t.phaseName.trim()) || 'Unphased';
      if (!byPhase.has(name)) {
        byPhase.set(name, []);
        order.push(name);
      }
      byPhase.get(name)!.push(t);
    }
    return order.map((name, i) => {
      const phaseId = `phase:${i}`;
      const collapsed = collapsedIds.has(phaseId);
      const tasks = byPhase.get(name)!;
      const visibleTasks = collapsed ? [] : tasks;
      const taskNodes = taskStack(visibleTasks, `phase-${i}`);
      taskNodes.forEach((t) => {
        if (t.kind === 'task') fitTaskHeight(t);
      });
      const phaseNode: PositionedNode = {
        kind: 'phase',
        id: phaseId,
        x: 0,
        y: 0,
        width: NODE_WIDTH.phase,
        height: NODE_HEIGHT.phase,
        label: name,
        titleLines: wrapText(name, 26, 2),
        sub: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
      };
      return { node: phaseNode, children: [], width: NODE_WIDTH.phase, tasks: taskNodes };
    });
  }

  // Build the forest of root children.
  const subtrees: Subtree[] = [];
  if (data.scope === 'workspace') {
    const sortedTeams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const t of sortedTeams) subtrees.push(buildTeamSubtree(t, projectsByTeam.get(t.id) || []));
    const untethered = projectsByTeam.get('_untethered_') || [];
    if (untethered.length) {
      subtrees.push(buildTeamSubtree({ id: '_untethered_', name: 'Untethered projects' }, untethered));
    }
  } else if (data.scope === 'team') {
    for (const p of [...data.projects].sort((a, b) => a.name.localeCompare(b.name)))
      subtrees.push(buildProjectSubtree(p));
  } else {
    subtrees.push(...buildPhaseSubtrees());
  }

  const startY = PADDING;

  // Position a subtree (and its descendants) with the given left edge + top.
  function placeSubtreeAt(s: Subtree, leftX: number, topY: number) {
    s.node.x = leftX + (s.width - s.node.width) / 2;
    s.node.y = topY;
    nodes.push(s.node);

    if (s.tasks && s.tasks.length) {
      let stackY = topY + s.node.height + LEVEL_GAP_Y / 2;
      for (const t of s.tasks) {
        t.x = s.node.x + (s.node.width - t.width) / 2;
        t.y = stackY;
        nodes.push(t);
        edges.push({ from: s.node.id, to: t.id });
        stackY += t.height + TASK_STACK_GAP_Y;
      }
    }

    if (s.children.length) {
      const childTop = topY + s.node.height + LEVEL_GAP_Y;
      const childSpan = s.children.reduce((sum, c) => sum + c.width + SIBLING_GAP_X, -SIBLING_GAP_X);
      let cursor = leftX + (s.width - childSpan) / 2;
      for (const c of s.children) {
        placeSubtreeAt(c, cursor, childTop);
        edges.push({ from: s.node.id, to: c.node.id });
        cursor += c.width + SIBLING_GAP_X;
      }
    }
  }

  const forestW =
    subtrees.length === 0
      ? NODE_WIDTH.root
      : subtrees.reduce((sum, s) => sum + s.width + SUBTREE_GAP_X, -SUBTREE_GAP_X);
  const totalW = Math.max(NODE_WIDTH.root, forestW);

  const rootNode: PositionedNode = {
    kind: 'root',
    id: 'root',
    x: PADDING + (totalW - NODE_WIDTH.root) / 2,
    y: startY,
    width: NODE_WIDTH.root,
    height: NODE_HEIGHT.root,
    label: data.rootLabel,
    titleLines: wrapText(data.rootLabel, 30, 2),
    sub: data.rootSubLabel,
  };
  nodes.push(rootNode);

  let cursorX = PADDING + (totalW - forestW) / 2;
  const childTop = startY + NODE_HEIGHT.root + LEVEL_GAP_Y;
  for (const s of subtrees) {
    placeSubtreeAt(s, cursorX, childTop);
    edges.push({ from: 'root', to: s.node.id });
    cursorX += s.width + SUBTREE_GAP_X;
  }

  let maxX = 0,
    maxY = 0;
  for (const n of nodes) {
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  return { nodes, edges, width: maxX + PADDING, height: maxY + PADDING };
}

/* ── Node rendering ────────────────────────────────────────────────────────
   Each level has a distinct silhouette: the workspace root is the boldest, a
   gradient pill; teams/phases are secondary tinted cards; projects carry a
   health edge; tasks are compact status cards. A native <title> on every node
   gives the full, untruncated text on hover. */
function MultiText({
  x,
  lines,
  fontSize,
  lineHeight,
  fill,
  weight,
  anchor,
}: {
  x: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  fill: string;
  weight: number;
  anchor?: 'middle' | 'start';
}) {
  return (
    <>
      {lines.map((ln, i) => (
        <tspan
          key={i}
          x={x}
          dy={i === 0 ? 0 : lineHeight}
          fontSize={fontSize}
          fontWeight={weight}
          fill={fill}
          textAnchor={anchor || 'start'}
        >
          {ln}
        </tspan>
      ))}
    </>
  );
}

function NodeShape({
  n,
  rootAvgUrgency,
  projectUrgencies,
  simDays = 0,
}: {
  n: PositionedNode;
  rootAvgUrgency?: number;
  projectUrgencies?: Map<string, number>;
  simDays?: number;
}) {
  const lines = n.titleLines && n.titleLines.length ? n.titleLines : [n.label];
  const fullTitle = `${n.label}${n.sub ? `\n${n.sub}` : ''}`;

  if (n.kind === 'root') {
    const cx = n.x + n.width / 2;

    // Elon root treatment: at team or project level the root should scream the current truth.
    // Aggregate urgency from children so the leader sees the "vibe" of the whole scope the instant it renders.
    // simDays makes the root show the *future* state — the greatest planning tool.
    const avgUrgency = rootAvgUrgency ?? 0;
    const rootUrgencyColor = avgUrgency >= 45 ? '#dc2626' : avgUrgency >= 25 ? '#ea580c' : '#0f5db5';

    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={16}
          fill="url(#beRootGrad)"
          stroke={rootUrgencyColor}
          strokeWidth={avgUrgency > 30 ? 3 : 1.5}
          filter="url(#beNodeShadow)"
        />
        <text textAnchor="middle" y={n.y + (n.sub ? 28 : 43)}>
          <MultiText
            x={cx}
            lines={lines}
            fontSize={15}
            lineHeight={17}
            fill="#ffffff"
            weight={800}
            anchor="middle"
          />
        </text>
        {n.sub && (
          <text x={cx} y={n.y + 54} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.88)">
            {truncateText(n.sub, 40)}
          </text>
        )}
        {/* Heat gets a dedicated footer row so it never competes with the
            project reference / task-count subtitle above it. */}
        {avgUrgency > 20 && (
          <g>
            <rect
              x={cx - 34}
              y={n.y + n.height - 22}
              width={68}
              height={16}
              rx={8}
              fill={rootUrgencyColor}
              stroke="rgba(255,255,255,0.38)"
              strokeWidth={0.7}
            />
            <text
              x={cx}
              y={n.y + n.height - 10.5}
              textAnchor="middle"
              fontSize={9}
              fontWeight={700}
              fill="white"
            >
              {avgUrgency}% HEAT
            </text>
          </g>
        )}
      </g>
    );
  }

  if (n.kind === 'team') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={12}
          fill="#eef2ff"
          stroke="#4f46e5"
          strokeWidth={1.25}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#4f46e5" />
        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#312e81" weight={700} />
        </text>
        {n.sub && (
          <text x={n.x + 14} y={n.y + n.height - 12} fontSize={10.5} fill="#6366f1">
            {truncateText(n.sub, 32)}
          </text>
        )}
      </g>
    );
  }

  if (n.kind === 'phase') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={11}
          fill="#f1f5f9"
          stroke="#64748b"
          strokeWidth={1.1}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#64748b" />
        <text x={n.x + 13} y={n.y + 19}>
          <MultiText x={n.x + 13} lines={lines} fontSize={12} lineHeight={14} fill="#0f172a" weight={700} />
        </text>
        {n.sub && (
          <text x={n.x + 13} y={n.y + n.height - 11} fontSize={10} fill="#64748b">
            {truncateText(n.sub, 30)}
          </text>
        )}
      </g>
    );
  }

  if (n.kind === 'project') {
    const p = n.data as BirdsEyeProject;
    const fill = HEALTH_FILL[p?.health || 'healthy'];
    const stroke = HEALTH_STROKE[p?.health || 'healthy'];

    // Team-level greatness: project nodes carry visual weight so leaders feel the heat across the whole team instantly.
    // Use precomputed map (simDays aware) to avoid scope issues in pure NodeShape.
    const avgSimUrgency = projectUrgencies?.get(p.id) ?? 0;
    const projUrgency = Math.min(
      100,
      Math.round(
        (p.health === 'critical' ? 55 : p.health === 'at_risk' ? 30 : 0) +
          (p.taskCount && p.tasksDone < p.taskCount * 0.6 ? 20 : 0) +
          (avgSimUrgency > 40 ? 15 : 0),
      ),
    );

    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={12}
          fill={fill}
          stroke={stroke}
          strokeWidth={projUrgency > 40 ? 2.2 : 1.4}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill={stroke} />

        {/* Urgency top bar on projects – the thing that makes the team-level view magical */}
        {projUrgency > 25 && (
          <rect
            x={n.x + 8}
            y={n.y + 4}
            width={n.width - 16}
            height={3}
            rx={1.5}
            fill={projUrgency > 55 ? '#dc2626' : '#ea580c'}
            opacity={0.85}
          />
        )}

        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#0f172a" weight={700} />
        </text>
        {n.sub &&
          (() => {
            const maxChars = Math.max(8, Math.floor((n.width - 14 - 30) / 6.1));
            const subText =
              n.sub.length > maxChars ? n.sub.slice(0, maxChars - 1).replace(/[\s·]+$/, '') + '…' : n.sub;
            return (
              <text
                x={n.x + 14}
                y={n.y + n.height - 12}
                fontSize={10}
                fill="#475569"
                fontFamily="ui-monospace,monospace"
              >
                {subText}
              </text>
            );
          })()}
      </g>
    );
  }

  if (n.kind === 'task') {
    const t = n.data as BirdsEyeTask;
    const fill = STATUS_FILL[t?.status || 'todo'];
    const baseStroke = STATUS_STROKE[t?.status || 'todo'];
    const dot = STATUS_DOT[t?.status || 'todo'];
    const subtaskTitles = n.showSubtasks ? (t?.subtaskTitles || []).slice(0, 3) : [];
    const titleEndY = n.y + 16 + (n.titleLines?.length || 1) * 15;
    const hasProgress = n.showSubtasks && (t?.subtaskCount ?? 0) > 0;
    const progressRatio = hasProgress
      ? Math.max(0, Math.min(1, (t!.subtasksDone ?? 0) / (t!.subtaskCount ?? 1)))
      : 0;

    // The magic that makes this the greatest feature on earth when you open it.
    // Everything you need to feel the state of the work at a single glance.
    const urgency = computeTaskUrgency(t, simDays);
    const uStroke = URGENCY_STROKE(urgency) || baseStroke;
    const uWidth = URGENCY_WIDTH(urgency);
    const isCritical = urgency >= 70;
    const isUrgent = urgency >= 45;

    // Rich title for the ultimate tooltip / screen reader experience.
    const urgencyLabel = urgency > 0 ? ` [Urgency ${urgency}]` : '';
    const richTitle = `${fullTitle}${urgencyLabel}${t.dueDate ? ` • Due ${new Date(t.dueDate).toLocaleDateString()}` : ''}`;

    return (
      <g>
        <title>{richTitle}</title>

        {/* Urgency outer glow – the "this matters" signal. Subtle at moderate, unmistakable at critical. */}
        {urgency > 20 && (
          <rect
            x={n.x - 3}
            y={n.y - 3}
            width={n.width + 6}
            height={n.height + 6}
            rx={12}
            fill="none"
            stroke={uStroke}
            strokeWidth={isCritical ? 8 : 5}
            opacity={isCritical ? 0.18 : 0.12}
          />
        )}

        {/* Main card */}
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={9}
          fill={fill}
          stroke={uStroke}
          strokeWidth={uWidth}
          filter="url(#beNodeShadow)"
        />

        {/* Left urgency bar – instant vertical signal, especially powerful at team scale. */}
        {urgency > 15 && (
          <rect
            x={n.x}
            y={n.y}
            width={4}
            height={n.height}
            rx={2}
            fill={uStroke}
            opacity={isCritical ? 0.95 : 0.85}
          />
        )}

        {/* Status / urgency dot – larger and more insistent when it matters */}
        <circle
          cx={n.x + 12}
          cy={n.y + 14}
          r={isCritical ? 5 : isUrgent ? 4.2 : 3.5}
          fill={isCritical ? '#dc2626' : dot}
        />

        {/* Task title – crisp, high contrast */}
        <text x={n.x + 22} y={n.y + 17}>
          <MultiText x={n.x + 22} lines={lines} fontSize={11.5} lineHeight={14} fill="#0f172a" weight={600} />
        </text>

        {/* Assignee / date line – only when clean (no subtasks shown) */}
        {n.sub && !n.showSubtasks && (
          <text x={n.x + 12} y={n.y + n.height - 8} fontSize={9.5} fill="#64748b">
            {n.sub}
          </text>
        )}

        {/* Inline subtask list – tiny but perfect density */}
        {subtaskTitles.map((st, i) => (
          <text key={i} x={n.x + 16} y={titleEndY + i * 12} fontSize={8.5} fill="#64748b">
            <tspan fill={dot} fontSize={6} dy={0}>
              ■
            </tspan>
            <tspan dx={3}>{st.length > 26 ? st.slice(0, 25) + '…' : st}</tspan>
          </text>
        ))}

        {/* Subtask progress – now with urgency tint when the work is behind */}
        {hasProgress && (
          <>
            <rect
              x={n.x + 12}
              y={n.y + n.height - 8}
              width={n.width - 24}
              height={2.5}
              rx={1.25}
              fill="#e2e8f0"
            />
            <rect
              x={n.x + 12}
              y={n.y + n.height - 8}
              width={(n.width - 24) * progressRatio}
              height={2.5}
              rx={1.25}
              fill={isCritical || isUrgent ? uStroke : dot}
              opacity={isCritical ? 0.95 : 0.85}
            />
          </>
        )}

        {/* Urgency badge – the thing that makes people say "holy shit" the first time they open the tree at scale */}
        {isUrgent && (
          <g>
            <rect
              x={n.x + n.width - 22}
              y={n.y + 4}
              width={18}
              height={14}
              rx={3}
              fill={isCritical ? '#dc2626' : '#ea580c'}
            />
            <text
              x={n.x + n.width - 13}
              y={n.y + 15}
              fontSize={9}
              fontWeight={700}
              fill="white"
              textAnchor="middle"
            >
              {isCritical ? '!' : '↑'}
            </text>
          </g>
        )}
      </g>
    );
  }

  // count chip
  return (
    <g>
      <title>{n.label}</title>
      <rect
        x={n.x}
        y={n.y}
        width={n.width}
        height={n.height}
        rx={10}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeDasharray="4,3"
        strokeWidth={1}
      />
      <text
        x={n.x + n.width / 2}
        y={n.y + (n.sub ? 17 : 24)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#475569"
      >
        {n.label}
      </text>
      {n.sub && (
        <text x={n.x + n.width / 2} y={n.y + 31} textAnchor="middle" fontSize={9.5} fill="#64748b">
          {n.sub}
        </text>
      )}
    </g>
  );
}

/** Smooth cubic-Bézier between two node anchors: exits the bottom-centre of
 *  `from`, enters the top-centre of `to`. */
function edgePath(from: PositionedNode, to: PositionedNode): string {
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  return `M ${x1},${y1} C ${x1},${mid} ${x2},${mid} ${x2},${y2}`;
}

/* ── Component ─────────────────────────────────────────────────────────────
   Renders inside a portal so the modal sits above the app sidebar/header and
   the Bird's-eye header is never clipped. */
export function BirdsEyeView({
  data,
  onClose,
  onChange,
  autoExport,
}: {
  data: BirdsEyeData;
  onClose: () => void;
  /** Fires after a Bird's-Eye edit (assignee/TCD) persists — lets the host
   *  page re-fetch its data without forcing a hard reload. */
  onChange?: () => void;
  /** When set, the view mounts hidden, expands the whole tree, immediately
   *  downloads it in the given format, then closes — powering the Export
   *  menu's one-click "Bird's-eye SVG/PNG" without ever showing the modal. */
  autoExport?: 'svg' | 'png' | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Default collapsed — shows compact count chips per project so the initial
  // view is clean. The user can expand all tasks with "Show tasks" or collapse
  // individual project task stacks with the − button on each project node.
  // Open with tasks EXPANDED for a project or a team — those scopes are bounded
  // and the whole point is to see the actual work, not a count chip (a collapsed
  // team view is mostly empty canvas — low yield). Only the workspace scope (all
  // teams at once) defaults to collapsed, where expanding everything would be a
  // wall; the user expands the branches they care about.
  const [collapseTasks, setCollapseTasks] = useState(data.scope === 'workspace');
  const [editing, setEditing] = useState<{ node: PositionedNode; clientX: number; clientY: number } | null>(
    null,
  );
  const [addingTaskFor, setAddingTaskFor] = useState<{
    node: PositionedNode;
    clientX: number;
    clientY: number;
  } | null>(null);
  // Per-node drag overrides {id → {dx,dy}} — applied on top of the computed
  // layout. localStorage-backed per scope+root so the user's arrangement is
  // preserved across opens but doesn't bleed between views.
  const overrideKey = `pragati-bve-pos:${data.scope}:${data.rootLabel}`;
  const collapseKey = `pragati-bve-collapsed:${data.scope}:${data.rootLabel}`;
  const brushKey = `pragati-bve-brush:${data.scope}:${data.rootLabel}`;
  const [overrides, setOverrides] = useState<Record<string, { dx: number; dy: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(overrideKey) || '{}');
    } catch {
      return {};
    }
  });
  // Set of collapsed node ids — when a node is collapsed its subtree (children
  // and/or tasks) is hidden. Persists per scope.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(collapseKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  // Brief "copied" acknowledgement on the copy-image export button.
  const [copiedImg, setCopiedImg] = useState(false);
  // Brush / annotation layer — freeform polylines over the canvas so a lead
  // can sketch on top of the structure during a brainstorm. Persists per scope.
  type BrushStroke = { color: string; width: number; points: { x: number; y: number }[] };
  const [brushOn, setBrushOn] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(brushKey) || '[]');
    } catch {
      return [];
    }
  });
  const [brushColor, setBrushColor] = useState('#1565C0');
  const liveStroke = useRef<BrushStroke | null>(null);
  const [, forceLive] = useState(0); // re-render trigger for live stroke painting
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has taken manual control of the zoom; until they
  // do, we keep auto-fitting on resize so the first paint always frames the tree.
  const userZoomed = useRef(false);
  // Live mirror of the zoom level for the native wheel listener, which is bound
  // once (non-passive) and would otherwise close over a stale zoom value.
  const zoomRef = useRef(1);
  // Find-on-canvas: a query dims everything that doesn't match so the matches
  // pop without re-laying-out the tree (positions stay stable — that's what
  // keeps the view trustworthy as a spatial reference).
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  // Status spotlight — clicking a legend chip dims tasks not in that status.
  // null = no filter. Single-select; clicking the active chip clears it.
  const [statusFocus, setStatusFocus] = useState<string | null>(null);

  // ── THE THING THAT MAKES IT THE GREATEST FEATURE ON EARTH ─────────────────
  // Urgency focus mode. Users open the tree at team or project level and instantly
  // see what actually matters. This is the "holy shit" moment.
  const [urgencyFocus, setUrgencyFocus] = useState<number>(0); // 0 = all, 25/45/70 = min urgency to show full strength
  const urgencyChips = [
    { label: 'All', value: 0 },
    { label: 'Due soon', value: 25 },
    { label: 'Urgent', value: 45 },
    { label: 'Critical', value: 70 },
  ];

  // Elon "high agency" mode: Rebalance the visual tree by urgency.
  // At team level this surfaces the team's real priorities across projects.
  // At project level it pulls the hot work to the visual top.
  // Purely visual (deterministic), doesn't mutate data unless you want it to.
  const [rebalanceMode, setRebalanceMode] = useState(false);

  // Elon physics simulation: "Simulate tomorrow" to preview how urgency evolves.
  // Greatest planning feature — see what will be on fire if nothing changes.
  const [simDays, setSimDays] = useState(0); // 0 = now, 1/3/7 = days forward for urgency calc
  // Minimap viewport tracking — scroll/size of the canvas, sampled via rAF so
  // panning never pays for a React render per scroll event.
  const [viewportBox, setViewportBox] = useState({ sl: 0, st: 0, cw: 0, ch: 0 });
  const viewportRaf = useRef(0);
  const sampleViewport = useCallback(() => {
    cancelAnimationFrame(viewportRaf.current);
    viewportRaf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setViewportBox({ sl: el.scrollLeft, st: el.scrollTop, cw: el.clientWidth, ch: el.clientHeight });
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Layered escape: close the popover, then the search, then the view.
        if (editing) setEditing(null);
        else if (document.activeElement === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        } else onClose();
        return;
      }
      // Power-user keys — never steal keystrokes from a focused field.
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '+' || e.key === '=') zoomBy(0.1);
      else if (e.key === '-') zoomBy(-0.1);
      else if (e.key === '0' || e.key.toLowerCase() === 'f') resetView();
      else if (e.key.toLowerCase() === 'b') setBrushOn((v) => !v);
      else if (e.key.toLowerCase() === 't') {
        userZoomed.current = false;
        setCollapseTasks((v) => !v);
      } else if (e.key.toLowerCase() === 'r') {
        // Elon high-agency shortcut: rebalance the view instantly.
        setRebalanceMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // zoomBy/resetView are stable in behaviour (setState + refs); listing the
    // states they close over would re-bind the listener every zoom tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editing]);

  // Persist overrides whenever they change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(overrideKey, JSON.stringify(overrides));
    } catch {}
  }, [overrides, overrideKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(collapseKey, JSON.stringify(Array.from(collapsedIds)));
    } catch {}
  }, [collapsedIds, collapseKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(brushKey, JSON.stringify(brushStrokes));
    } catch {}
  }, [brushStrokes, brushKey]);

  const {
    nodes: baseNodes,
    edges,
    width: baseWidth,
    height: baseHeight,
  } = useMemo(
    () => layout(data, { collapseTasks, collapsedIds, rebalanceMode }),
    [data, collapseTasks, collapsedIds, rebalanceMode],
  );

  // Apply drag overrides to the computed layout (and expand canvas if dragged
  // beyond its bounds so edges & scroll still reach the moved node).
  const { nodes, width, height } = useMemo(() => {
    let w = baseWidth,
      h = baseHeight;
    const arr = baseNodes.map((n) => {
      const o = overrides[n.id];
      if (!o) return n;
      const moved = { ...n, x: n.x + o.dx, y: n.y + o.dy };
      if (moved.x + moved.width + PADDING > w) w = moved.x + moved.width + PADDING;
      if (moved.y + moved.height + PADDING > h) h = moved.y + moved.height + PADDING;
      return moved;
    });
    return { nodes: arr, width: w, height: h };
  }, [baseNodes, baseWidth, baseHeight, overrides]);

  const nodeIndex = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  // Un-dragged layout positions, for clamping a node drag to the canvas.
  const baseNodeIndex = useMemo(() => new Map(baseNodes.map((n) => [n.id, n])), [baseNodes]);

  // Compute root avg urgency once for the root NodeShape (avoids scope issues in pure function)
  const rootAvgUrgency = useMemo(() => {
    const childUrgencies = (data.tasks || []).map((t) => computeTaskUrgency(t, simDays));
    return childUrgencies.length
      ? Math.round(childUrgencies.reduce((a, b) => a + b, 0) / childUrgencies.length)
      : 0;
  }, [data.tasks, simDays]);

  const projectUrgencies = useMemo(() => {
    const map = new Map<string, number>();
    const tasksByProj = new Map<string, BirdsEyeTask[]>();
    for (const t of data.tasks || []) {
      if (!tasksByProj.has(t.projectId)) tasksByProj.set(t.projectId, []);
      tasksByProj.get(t.projectId)!.push(t);
    }
    for (const [pid, ts] of tasksByProj) {
      const us = ts.map((t) => computeTaskUrgency(t, simDays));
      const avg = us.length ? Math.round(us.reduce((a, b) => a + b, 0) / us.length) : 0;
      map.set(pid, avg);
    }
    return map;
  }, [data.tasks, simDays]);

  // ── Spotlight ────────────────────────────────────────────────────────────
  // Search and the legend's status focus dim what doesn't match instead of
  // removing it: positions never change, so the user's spatial memory of the
  // tree survives the filter. `null` = no spotlight, everything full-strength.
  const queryNorm = query.trim().toLowerCase();
  const litIds = useMemo(() => {
    if (!queryNorm && !statusFocus && urgencyFocus === 0) return null;
    const lit = new Set<string>();
    for (const n of nodes) {
      if (n.kind === 'root') {
        lit.add(n.id);
        continue;
      }
      const text = `${n.label} ${n.sub || ''}`.toLowerCase();
      const queryOk = !queryNorm || text.includes(queryNorm);
      const statusOk = !statusFocus || n.kind !== 'task' || (n.data as BirdsEyeTask).status === statusFocus;

      // Urgency filter – the killer feature at team and project level.
      let urgencyOk = true;
      if (urgencyFocus > 0 && n.kind === 'task') {
        const u = computeTaskUrgency(n.data as BirdsEyeTask, simDays);
        urgencyOk = u >= urgencyFocus;
      }
      if (queryOk && statusOk && urgencyOk) lit.add(n.id);
    }
    return lit;
  }, [nodes, queryNorm, statusFocus, urgencyFocus]);

  const queryMatchCount = useMemo(() => {
    if (!queryNorm) return 0;
    let c = 0;
    for (const n of nodes) {
      if (n.kind === 'root') continue;
      if (`${n.label} ${n.sub || ''}`.toLowerCase().includes(queryNorm)) c++;
    }
    return c;
  }, [nodes, queryNorm]);

  // Enter in the search box flies to the first match (top-most, then left-most).
  const jumpToFirstMatch = useCallback(() => {
    if (!queryNorm) return;
    const el = scrollRef.current;
    if (!el) return;
    const first = [...nodes]
      .filter((n) => n.kind !== 'root' && `${n.label} ${n.sub || ''}`.toLowerCase().includes(queryNorm))
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (!first) return;
    el.scrollTo({
      left: (first.x + first.width / 2) * zoom - el.clientWidth / 2,
      top: (first.y + first.height / 2) * zoom - el.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [nodes, queryNorm, zoom]);

  // ── INSIGHT COMMAND BAR ───────────────────────────────────────────────────
  // This is the part that makes people say "this is the greatest feature on Earth"
  // the moment they open the tree at team or project level. Instant situational awareness + action.
  const highUrgencyCount = nodes.filter(
    (n) => n.kind === 'task' && computeTaskUrgency(n.data as BirdsEyeTask, simDays) >= 45,
  ).length;
  const criticalCount = nodes.filter(
    (n) => n.kind === 'task' && computeTaskUrgency(n.data as BirdsEyeTask, simDays) >= 70,
  ).length;

  // Compute the zoom that frames the whole tree in the current viewport, then
  // centre it. Capped at 1× (we never blow content up past natural size on a
  // sparse tree) and floored so a huge tree stays legible.
  const fitToViewport = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const availW = el.clientWidth;
    const availH = el.clientHeight;
    if (!availW || !availH) return;
    const z = Math.min(availW / width, availH / height, 1);
    const clamped = Math.max(0.3, Math.round(z * 100) / 100);
    setZoom(clamped);
    // Centre after the scaled size settles.
    requestAnimationFrame(() => {
      const e2 = scrollRef.current;
      if (!e2) return;
      e2.scrollLeft = Math.max(0, (width * clamped - e2.clientWidth) / 2);
      e2.scrollTop = 0;
    });
  }, [width, height]);

  // Auto-fit on first paint and whenever the layout changes — unless the user
  // has taken manual zoom control.
  useLayoutEffect(() => {
    if (!mounted) return;
    if (!userZoomed.current) fitToViewport();
  }, [mounted, fitToViewport, collapseTasks]);

  // Keep it fitted across viewport/orientation changes (pre-manual-zoom).
  useEffect(() => {
    if (!mounted) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!userZoomed.current) fitToViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, fitToViewport]);

  // Keep the minimap's viewport rectangle honest across zoom, layout and
  // container-size changes (scrolling is handled by onScroll on the canvas).
  useEffect(() => {
    if (mounted) sampleViewport();
  }, [mounted, zoom, width, height, sampleViewport]);

  // Mirror zoom into a ref so the once-bound native wheel handler always reads
  // the current level.
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const zoomBy = (delta: number) => {
    userZoomed.current = true;
    setZoom((z) => Math.min(2, Math.max(0.3, Math.round((z + delta) * 100) / 100)));
  };
  const resetView = () => {
    userZoomed.current = false;
    fitToViewport();
  };

  // Cursor-anchored wheel / trackpad-pinch zoom. The natural way to zoom a
  // canvas — hold ⌘/Ctrl (trackpad pinch sends ctrlKey automatically) and
  // scroll; the point under the pointer stays put. Bound natively with
  // { passive: false } because React routes wheel through a passive listener,
  // so preventDefault (which stops the browser's own page-zoom) wouldn't fire.
  // A plain wheel without the modifier still scrolls/pans as before.
  useEffect(() => {
    if (!mounted) return;
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (brushOn) return;
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const z0 = zoomRef.current;
      const svgRect = svg.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Content point (unscaled) under the cursor + cursor position in the canvas.
      const cx = (e.clientX - svgRect.left) / z0;
      const cy = (e.clientY - svgRect.top) / z0;
      const px = e.clientX - elRect.left;
      const py = e.clientY - elRect.top;
      // Exponential step → smooth, consistent zoom regardless of device deltas.
      const z2 = Math.min(2, Math.max(0.3, Math.round(z0 * Math.exp(-e.deltaY * 0.0015) * 100) / 100));
      if (z2 === z0) return;
      userZoomed.current = true;
      setZoom(z2);
      // After the re-render settles, nudge scroll so the content point lands
      // back under the cursor. Measuring the real svg rect keeps this correct
      // even with the canvas centred when it's narrower than the viewport.
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        const svg2 = svgRef.current;
        if (!el2 || !svg2) return;
        const nr = svg2.getBoundingClientRect();
        const er = el2.getBoundingClientRect();
        el2.scrollLeft -= er.left + px - (nr.left + cx * z2);
        el2.scrollTop -= er.top + py - (nr.top + cy * z2);
        sampleViewport();
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mounted, brushOn, sampleViewport]);

  // Pointer handling — two modes share one set of handlers:
  //   • Node drag  : press on a [data-be-node] element moves only that node.
  //                  Suppresses the native <a> click on release so the node
  //                  isn't navigated to after a drag.
  //   • Canvas pan : press on blank space scrolls the viewport, as before.
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    // The node's un-dragged layout position — lets pointer-move clamp the drag
    // so a node can never be pushed off the top-left of the canvas and clip.
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);
  // Distinguishes single-click (toggle this node's branch) from double-click
  // (open the node's detail page): a single click waits briefly to see whether
  // a second one is coming.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Translate viewport pointer coords into SVG coords (accounts for zoom + scroll).
  function toSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Brush mode — any press on the canvas starts a stroke.
    if (brushOn) {
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!p) return;
      liveStroke.current = { color: brushColor, width: 2.5, points: [p] };
      forceLive((n) => n + 1);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    // Action affordances (collapse/expand toggle, add-task, edit) handle their
    // own onClick. If we started a drag + pointer-capture here, the capture
    // would re-target the follow-up `click` to the scroll container and the
    // button's handler would never fire — which is exactly why hide/expand
    // appeared dead. Bail so the native click reaches the <g> handler.
    if (target.closest('[data-be-action]')) return;
    const nodeEl = target.closest('[data-be-node]') as HTMLElement | null;
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-be-node') || '';
      // Root is fixed (it's the brand anchor); count chips aren't user-data.
      const kind = nodeEl.getAttribute('data-be-kind');
      if (kind === 'root' || kind === 'count') return;
      const existing = overrides[id] || { dx: 0, dy: 0 };
      const base = baseNodeIndex.get(id);
      drag.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        baseDx: existing.dx,
        baseDy: existing.dy,
        baseX: base?.x ?? 0,
        baseY: base?.y ?? 0,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (liveStroke.current) {
      e.preventDefault();
      e.stopPropagation();
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!p) return;
      const last = liveStroke.current.points[liveStroke.current.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      liveStroke.current.points.push(p);
      forceLive((n) => n + 1);
      return;
    }
    if (drag.current) {
      const dx = (e.clientX - drag.current.startX) / zoom;
      const dy = (e.clientY - drag.current.startY) / zoom;
      if (!drag.current.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) drag.current.moved = true;
      if (drag.current.moved) {
        const d = drag.current;
        // Clamp so the node's absolute position never crosses the top-left edge
        // (x,y >= MARGIN). Dragging left/up past the origin used to push the
        // node to negative coords, off the fixed 0..width viewBox → the node
        // clipped and the view "broke". The canvas still grows right/bottom.
        const MARGIN = 8;
        let ndx = d.baseDx + dx;
        let ndy = d.baseDy + dy;
        if (d.baseX + ndx < MARGIN) ndx = MARGIN - d.baseX;
        if (d.baseY + ndy < MARGIN) ndy = MARGIN - d.baseY;
        setOverrides((o) => ({ ...o, [d.id]: { dx: ndx, dy: ndy } }));
      }
      return;
    }
    if (!pan.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };

  const endPointer = (e: React.PointerEvent) => {
    if (liveStroke.current) {
      // Capture the stroke into a local BEFORE clearing the ref. React may run
      // the setBrushStrokes updater during the next render (automatic
      // batching) — by then liveStroke.current is null, which would push a
      // null into the list and crash the polyline map on the following paint.
      const stroke = liveStroke.current;
      liveStroke.current = null;
      if (stroke.points.length >= 2) {
        setBrushStrokes((s) => [...s, stroke]);
      }
      forceLive((n) => n + 1);
      return;
    }
    // Suppress the click on the underlying <a> if the user actually dragged
    // — otherwise releasing the drag opens the task page.
    if (drag.current?.moved) {
      const stopClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', stopClick, true);
      };
      window.addEventListener('click', stopClick, true);
    }
    drag.current = null;
    pan.current = null;
  };

  function resetLayout() {
    setOverrides({});
  }
  function clearBrush() {
    if (brushStrokes.length === 0) return;
    if (!confirm('Erase all annotations on this view?')) return;
    setBrushStrokes([]);
  }

  // A standalone clone of the live tree for export: the exact on-screen pixels,
  // on a white page, at intrinsic size (zoom-independent). Shared by every
  // export format so SVG, PNG and clipboard always agree.
  const buildExportClone = useCallback((): SVGSVGElement | null => {
    if (!svgRef.current) return null;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.removeAttribute('style');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    return clone;
  }, [width, height]);

  const triggerDownload = useCallback(
    (blob: Blob, ext: string) => {
      const slug =
        (data.rootLabel || 'view')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 40) || 'view';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pragati-birds-eye-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    [data.rootLabel],
  );

  const exportSvg = useCallback(() => {
    const clone = buildExportClone();
    if (!clone) return;
    const xml = new XMLSerializer().serializeToString(clone);
    triggerDownload(new Blob([`<?xml version="1.0"?>\n${xml}`], { type: 'image/svg+xml' }), 'svg');
  }, [buildExportClone, triggerDownload]);

  // Rasterise the clone to a crisp 2× PNG via an offscreen canvas. Returns the
  // blob so the same path powers both "download PNG" and "copy to clipboard".
  const renderPngBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const clone = buildExportClone();
      if (!clone) return resolve(null);
      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => resolve(b), 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = svg64;
    });
  }, [buildExportClone, width, height]);

  const exportPng = useCallback(async () => {
    const blob = await renderPngBlob();
    if (blob) triggerDownload(blob, 'png');
  }, [renderPngBlob, triggerDownload]);

  const copyPng = useCallback(async () => {
    try {
      const blob = await renderPngBlob();
      const Clip = (window as any).ClipboardItem;
      if (!blob || !navigator.clipboard?.write || !Clip) return;
      await navigator.clipboard.write([new Clip({ 'image/png': blob })]);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 1600);
    } catch {
      /* clipboard blocked (permissions / unsupported) — silent */
    }
  }, [renderPngBlob]);

  // Headless one-shot export (Export menu → "Bird's-eye SVG/PNG"). Mount hidden,
  // expand the whole tree so the file is complete, let it paint, download, close.
  useEffect(() => {
    if (!autoExport || !mounted) return;
    setCollapseTasks(false);
    setCollapsedIds(new Set());
    const t = setTimeout(() => {
      if (autoExport === 'png') void exportPng();
      else exportSvg();
      onClose();
    }, 200);
    return () => clearTimeout(t);
    // exportSvg/exportPng are stable callbacks; re-running on their identity
    // would risk a double export. Fire once when the hidden view has mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExport, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      className={`fixed inset-0 z-[60] ${autoExport ? '' : 'bg-slate-900/70 backdrop-blur-sm overlay-in'}`}
      style={autoExport ? { opacity: 0, pointerEvents: 'none' } : undefined}
      aria-hidden={autoExport ? true : undefined}
      onClick={autoExport ? undefined : onClose}
    >
      {/* Opening choreography — the card swoops in while the tree itself
          settles from a higher "altitude" (scaled up, slightly transparent)
          down to its fitted size: the literal feeling of a bird's-eye view
          opening up beneath you. GPU-only (transform + opacity). */}
      <style>{`
        @keyframes be-swoop {
          from { opacity: 0; transform: translateY(18px) scale(0.975); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes be-aerial {
          from { opacity: 0; transform: scale(1.32); }
          to   { opacity: 1; transform: scale(1); }
        }
        .be-swoop  { animation: be-swoop 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .be-aerial { animation: be-aerial 0.7s 0.06s cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: 50% 16%; }
        .be-node-g { transition: opacity 0.25s ease; }
        @media (prefers-reduced-motion: reduce) {
          .be-swoop, .be-aerial { animation-duration: 0.01ms !important; }
          .be-node-g { transition: none !important; }
        }
      `}</style>
      {/* The map is the workspace, not a dialog inside it: use the complete
          viewport so wide trees and the command bar get every available pixel. */}
      <div
        className="absolute inset-0 bg-white shadow-2xl flex flex-col be-swoop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — full-width band above the canvas. Title block left, controls
            right; both wrap independently so neither is clipped on a phone. */}
        <div className="shrink-0 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Bird&apos;s-eye view
            </div>
            <div className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">
              {data.rootLabel}
            </div>
            {data.rootSubLabel && (
              <div className="text-[11px] text-slate-500 truncate">{data.rootSubLabel}</div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0">
            {/* Find on canvas — dims everything that doesn't match; Enter flies
                to the first hit. `/` focuses from anywhere in the view. */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') jumpToFirstMatch();
                }}
                placeholder="Find  ( / )"
                aria-label="Find a team, project or task on the canvas"
                className="w-[124px] sm:w-[150px] pl-8 pr-7 py-1.5 text-[12px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {queryNorm && (
              <span className="text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
                {queryMatchCount} match{queryMatchCount === 1 ? '' : 'es'}
              </span>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => {
                userZoomed.current = false;
                setCollapseTasks((v) => !v);
              }}
              title={
                collapseTasks
                  ? 'Expand all projects to show individual tasks'
                  : 'Collapse each project to a task-count summary'
              }
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                collapseTasks
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Layers size={13} /> {collapseTasks ? 'Expand tasks' : 'Group tasks'}
            </button>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => zoomBy(-0.1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Zoom out (− or ⌘/Ctrl+scroll)"
            >
              <ZoomOut size={15} />
            </button>
            <button
              onClick={resetView}
              className="text-[11px] font-bold text-slate-600 tabular-nums w-10 text-center hover:text-blue-600"
              title="Reset zoom · fit to screen"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => zoomBy(0.1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Zoom in (+ or ⌘/Ctrl+scroll)"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={resetView}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Reset · fit to screen"
            >
              <Scan size={15} />
            </button>
            {Object.keys(overrides).length > 0 && (
              <button
                onClick={resetLayout}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Reset node positions to the computed layout"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => setBrushOn((v) => !v)}
              title={brushOn ? 'Exit brush — back to pan/drag' : 'Brush — draw notes & arrows on the canvas'}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                brushOn
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Brush size={13} /> Brush
            </button>
            {brushOn && (
              <>
                <div className="flex items-center gap-0.5 mx-0.5">
                  {['#1565C0', '#22c55e', '#f59e0b', '#ef4444', '#0f172a'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBrushColor(c)}
                      title={`Use ${c}`}
                      className={`w-5 h-5 rounded-full transition-transform ${brushColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                      style={{ background: c }}
                      aria-label={`Use ${c}`}
                    />
                  ))}
                </div>
                {brushStrokes.length > 0 && (
                  <button
                    onClick={clearBrush}
                    title="Erase all brush strokes"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Eraser size={14} />
                  </button>
                )}
              </>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            {/* Export group — same view, three takeaways: a vector SVG, a crisp
                2× PNG, or the image straight onto the clipboard to paste into a
                deck or chat. */}
            <div className="inline-flex items-center rounded-lg bg-blue-600 overflow-hidden shadow-sm">
              <button
                onClick={exportSvg}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 text-white hover:bg-blue-700 transition-colors"
                title="Download this view as a vector SVG"
              >
                <Download size={13} />
                <span className="hidden sm:inline">SVG</span>
              </button>
              <span className="w-px h-4 bg-white/25" />
              <button
                onClick={exportPng}
                className="text-[11px] font-bold px-2.5 py-1.5 text-white hover:bg-blue-700 transition-colors"
                title="Download this view as a high-resolution PNG"
              >
                PNG
              </button>
              <span className="w-px h-4 bg-white/25" />
              <button
                onClick={copyPng}
                className="inline-flex items-center px-2 py-1.5 text-white hover:bg-blue-700 transition-colors"
                title="Copy the image to your clipboard"
                aria-label="Copy image to clipboard"
              >
                {copiedImg ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Canvas — scroll + drag to pan. Inner wrapper is min-w-full so a tree
            narrower than the viewport is centred; a wider one scrolls to both
            edges without clipping. */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-auto select-none bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:22px_22px] bg-slate-50 dark:bg-[#1f1e1d] ${
            brushOn ? 'cursor-crosshair touch-none' : 'cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerLeave={endPointer}
          onScroll={sampleViewport}
        >
          <div className="inline-block min-w-full">
            <div className="flex justify-center">
              <div className="be-aerial" style={{ width: width * zoom, height: height * zoom }}>
                <svg
                  ref={svgRef}
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    display: 'block',
                    width: width * zoom,
                    height: height * zoom,
                    touchAction: brushOn ? 'none' : 'auto',
                  }}
                >
                  <defs>
                    {/* Match the app's 3-stop brand gradient so the workspace
                        root reads as the same identity as the sidebar wordmark. */}
                    <linearGradient id="beRootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1565C0" />
                      <stop offset="50%" stopColor="#1976D2" />
                      <stop offset="100%" stopColor="#2E7D32" />
                    </linearGradient>
                    {/* Soft drop shadow lifts every card off the dotted canvas
                        so the tree reads with depth instead of as flat stickers. */}
                    <filter id="beNodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow
                        dx="0"
                        dy="1.5"
                        stdDeviation="2.5"
                        floodColor="#1e293b"
                        floodOpacity="0.10"
                      />
                    </filter>
                  </defs>
                  <g pointerEvents={brushOn ? 'none' : undefined}>
                    {edges.map((e, i) => {
                      const a = nodeIndex.get(e.from);
                      const b = nodeIndex.get(e.to);
                      if (!a || !b) return null;
                      // Clicking a connector expands/hides the subtree hanging
                      // off it — the child's own subtree when the child is
                      // collapsible, otherwise the parent's stack (so a
                      // project → task edge folds the whole task column).
                      const collapsibleChild =
                        b.kind === 'team' || b.kind === 'project' || b.kind === 'phase';
                      const toggleId = collapsibleChild ? b.id : a.id;
                      const d = edgePath(a, b);
                      // Edges follow the spotlight: a connector into a dimmed
                      // node fades with it so lit branches read as paths.
                      const edgeDim = litIds && (!litIds.has(a.id) || !litIds.has(b.id));
                      return (
                        <g
                          key={i}
                          data-be-action="edge-toggle"
                          className="be-node-g"
                          opacity={edgeDim ? 0.18 : 1}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            toggleCollapsed(toggleId);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>Expand / hide this branch</title>
                          {/* Softer, thinner connectors — calmer than a hard slate line. */}
                          <path d={d} fill="none" stroke="#cbd6e4" strokeWidth={1.25} strokeOpacity={0.85} />
                          {/* Invisible wide twin of the connector — a comfortable
                            click target without thickening the visible line. */}
                          <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                        </g>
                      );
                    })}
                  </g>
                  <g pointerEvents={brushOn ? 'none' : undefined}>
                    {nodes.map((n) => {
                      const navHref =
                        n.kind === 'task'
                          ? `/tasks/${(n.data as BirdsEyeTask).id}`
                          : n.kind === 'project'
                            ? `/projects/${(n.data as BirdsEyeProject).id}`
                            : n.kind === 'team'
                              ? `/teams/${(n.data as BirdsEyeTeam).id}`
                              : null;
                      const isTask = n.kind === 'task';
                      // Task nodes with subtasks are also collapsible — clicking
                      // hides/shows the inline subtask list inside the node.
                      const canCollapse =
                        n.kind === 'team' ||
                        n.kind === 'project' ||
                        n.kind === 'phase' ||
                        (isTask && !!(n.data as BirdsEyeTask)?.subtaskTitles?.length);
                      const canAddTask = n.kind === 'project' || n.kind === 'phase';
                      const isCollapsed = collapsedIds.has(n.id);
                      const dragProps = {
                        'data-be-node': n.id,
                        'data-be-kind': n.kind,
                        style: { cursor: n.kind === 'root' || n.kind === 'count' ? 'default' : 'grab' },
                      } as const;
                      const shape = (
                        <NodeShape
                          key={`s-${n.id}`}
                          n={n}
                          rootAvgUrgency={rootAvgUrgency}
                          projectUrgencies={projectUrgencies}
                          simDays={simDays}
                        />
                      );

                      // Task nodes get an inline edit affordance — a tiny pencil
                      // button in the top-right corner of the card. Clicking it
                      // pops the inline editor with assignee + TCD fields.
                      const editBtn = isTask ? (
                        <g
                          data-be-action="edit"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditing({ node: n, clientX: (e as any).clientX, clientY: (e as any).clientY });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle
                            cx={n.x + n.width - 11}
                            cy={n.y + 11}
                            r={8}
                            fill="#ffffff"
                            stroke="#cbd5e1"
                            strokeWidth={0.8}
                          />
                          <path
                            d={`M ${n.x + n.width - 14} ${n.y + 13} l 4 -4 l 2 2 l -4 4 z M ${n.x + n.width - 10} ${n.y + 9} l 1 1`}
                            stroke="#475569"
                            strokeWidth={0.9}
                            fill="none"
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null;

                      // Collapse/expand toggle — top-right for team/project/phase,
                      // bottom-right for task nodes (which already have the edit
                      // pencil in the top-right corner).
                      const collapseCx = isTask ? n.x + n.width - 11 : n.x + n.width - 11;
                      const collapseCy = isTask ? n.y + n.height - 11 : n.y + 11;
                      const collapseBtn = canCollapse ? (
                        <g
                          data-be-action="collapse"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCollapsed(n.id);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>{isCollapsed ? 'Expand' : 'Collapse'}</title>
                          <circle
                            cx={collapseCx}
                            cy={collapseCy}
                            r={8}
                            fill="#ffffff"
                            stroke="#cbd5e1"
                            strokeWidth={0.8}
                          />
                          {isCollapsed ? (
                            <>
                              <line
                                x1={collapseCx - 4}
                                y1={collapseCy}
                                x2={collapseCx + 4}
                                y2={collapseCy}
                                stroke="#1565C0"
                                strokeWidth={1.6}
                                strokeLinecap="round"
                              />
                              <line
                                x1={collapseCx}
                                y1={collapseCy - 4}
                                x2={collapseCx}
                                y2={collapseCy + 4}
                                stroke="#1565C0"
                                strokeWidth={1.6}
                                strokeLinecap="round"
                              />
                            </>
                          ) : (
                            <line
                              x1={collapseCx - 4}
                              y1={collapseCy}
                              x2={collapseCx + 4}
                              y2={collapseCy}
                              stroke="#475569"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                            />
                          )}
                        </g>
                      ) : null;

                      // "+" add-task affordance — bottom-right corner of project/phase
                      // nodes. Opens an inline new-task popover that posts to /tasks.
                      const addBtn = canAddTask ? (
                        <g
                          data-be-action="add"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAddingTaskFor({
                              node: n,
                              clientX: (e as any).clientX,
                              clientY: (e as any).clientY,
                            });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>Add a task under this {n.kind}</title>
                          <circle cx={n.x + n.width - 11} cy={n.y + n.height - 11} r={8.5} fill="#1565C0" />
                          <line
                            x1={n.x + n.width - 15}
                            y1={n.y + n.height - 11}
                            x2={n.x + n.width - 7}
                            y2={n.y + n.height - 11}
                            stroke="#ffffff"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                          />
                          <line
                            x1={n.x + n.width - 11}
                            y1={n.y + n.height - 15}
                            x2={n.x + n.width - 11}
                            y2={n.y + n.height - 7}
                            stroke="#ffffff"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null;

                      // One interaction model for every node:
                      //   • single click → toggle this node's branch (open/hide
                      //     the children/subtasks), the most common move;
                      //   • double click → open the node's detail page.
                      // A single click waits ~250ms to confirm a second isn't
                      // coming, so a double-click never also fires the toggle.
                      const interactive = canCollapse || !!navHref;
                      const body = (
                        <g
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (clickTimer.current) clearTimeout(clickTimer.current);
                            clickTimer.current = setTimeout(() => {
                              clickTimer.current = null;
                              if (canCollapse) toggleCollapsed(n.id);
                            }, 250);
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (clickTimer.current) {
                              clearTimeout(clickTimer.current);
                              clickTimer.current = null;
                            }
                            if (navHref) window.open(navHref, '_blank', 'noopener,noreferrer');
                          }}
                          style={interactive ? { cursor: 'pointer' } : undefined}
                        >
                          {navHref && <title>Click to open/hide · double-click to open the page</title>}
                          {shape}
                        </g>
                      );

                      // Spotlight: anything outside the current search/status
                      // focus fades back instead of disappearing — positions
                      // hold steady so spatial memory survives the filter.
                      const dimmed = litIds && !litIds.has(n.id);
                      return (
                        <g key={n.id} {...dragProps} className="be-node-g" opacity={dimmed ? 0.13 : 1}>
                          {body}
                          {collapseBtn}
                          {addBtn}
                          {editBtn}
                        </g>
                      );
                    })}
                  </g>

                  {/* Brush / annotation layer — painted over the tree so notes
                      sit on top. Persisted strokes + the in-progress stroke. */}
                  <g pointerEvents="none">
                    {brushStrokes.map((s, i) => (
                      <polyline
                        key={i}
                        points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {liveStroke.current && liveStroke.current.points.length > 1 && (
                      <polyline
                        points={liveStroke.current.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={liveStroke.current.color}
                        strokeWidth={liveStroke.current.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.8}
                      />
                    )}
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Minimap — the bird's-eye of the bird's-eye. A scaled silhouette of
            the whole tree with the current viewport framed; click or drag
            anywhere on it to fly there. Only shown when the tree actually
            overflows the viewport — on a fully-visible tree it's just noise. */}
        {(() => {
          if (nodes.length < 9) return null;
          const overflowing =
            viewportBox.cw > 0 && (width * zoom > viewportBox.cw + 4 || height * zoom > viewportBox.ch + 4);
          if (!overflowing) return null;
          const scale = Math.min(176 / width, 132 / height);
          const mmW = Math.max(60, Math.round(width * scale));
          const mmH = Math.max(44, Math.round(height * scale));
          const MM_KIND_FILL: Record<string, string> = {
            root: '#1565C0',
            team: '#a5b4fc',
            phase: '#cbd5e1',
            count: '#e2e8f0',
          };
          const flyTo = (e: React.PointerEvent<SVGSVGElement>) => {
            const el = scrollRef.current;
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            if (!el) return;
            const cx = ((e.clientX - rect.left) / mmW) * width;
            const cy = ((e.clientY - rect.top) / mmH) * height;
            el.scrollLeft = cx * zoom - el.clientWidth / 2;
            el.scrollTop = cy * zoom - el.clientHeight / 2;
          };
          return (
            <div
              className="hidden sm:block absolute right-4 bottom-12 z-10 rounded-xl border border-slate-200 bg-white/92 backdrop-blur shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width={mmW}
                height={mmH}
                viewBox={`0 0 ${width} ${height}`}
                className="block cursor-pointer"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  flyTo(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) flyTo(e);
                }}
              >
                {nodes.map((n) => {
                  const fill =
                    n.kind === 'task'
                      ? STATUS_STROKE[(n.data as BirdsEyeTask).status] || '#94a3b8'
                      : n.kind === 'project'
                        ? (n.data as BirdsEyeProject).health === 'critical'
                          ? '#fca5a5'
                          : (n.data as BirdsEyeProject).health === 'at_risk'
                            ? '#fcd34d'
                            : '#86efac'
                        : MM_KIND_FILL[n.kind] || '#e2e8f0';
                  return (
                    <rect
                      key={n.id}
                      x={n.x}
                      y={n.y}
                      width={n.width}
                      height={n.height}
                      rx={6}
                      fill={fill}
                      opacity={n.kind === 'task' ? 0.55 : 0.9}
                    />
                  );
                })}
                {/* Current viewport */}
                <rect
                  x={viewportBox.sl / zoom}
                  y={viewportBox.st / zoom}
                  width={viewportBox.cw / zoom}
                  height={viewportBox.ch / zoom}
                  fill="rgba(21,101,192,0.08)"
                  stroke="#1565C0"
                  strokeWidth={Math.max(2, 2 / scale / 2)}
                  rx={8}
                />
              </svg>
            </div>
          );
        })()}

        {/* Footer legend + INSIGHT COMMAND BAR
            This combination is why the Bird's Eye becomes the greatest single feature users ever open.
            At team level you feel the entire org's heat. At project level you see exactly where the work is stuck or flying.
            One glance, one click, total clarity. */}
        <div className="shrink-0 border-t border-slate-200 bg-white dark:bg-slate-950/80">
          {/* Urgency Command Bar – the "greatest on earth" moment */}
          <div className="flex items-center gap-2 px-4 py-2 text-[11px] border-b border-slate-100 dark:border-white/10">
            <span className="font-bold uppercase tracking-[1.5px] text-slate-400 mr-1">Focus</span>
            {urgencyChips.map((chip) => {
              const active = urgencyFocus === chip.value;
              return (
                <button
                  key={chip.value}
                  onClick={() => setUrgencyFocus(active ? 0 : chip.value)}
                  className={`px-3 py-px rounded-full font-medium transition-all active:scale-[0.97] ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}

            {/* Elon Rebalance: the 10x move. One click and the tree reorders itself to put the highest-leverage work at the top of the visual stack.
                Team level: your team's real priorities bubble up across projects.
                Project level: the hot path becomes obvious. Pure visual, deterministic, reversible. */}
            <button
              onClick={() => setRebalanceMode(!rebalanceMode)}
              className={`ml-2 px-3 py-px rounded-full font-medium transition-all active:scale-[0.97] flex items-center gap-1 ${
                rebalanceMode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
              }`}
              title="Rebalance the tree by urgency (Elon mode: see what actually moves the needle first)"
            >
              {rebalanceMode ? '✓ Rebalanced' : 'Rebalance'}
            </button>

            {/* Elon "what will happen if we do nothing?" simulation.
                The greatest forward-looking feature: advance time and watch urgency evolve in the living tree.
                Team level: will my team be underwater next week?
                Project level: which phases will blow up? */}
            <div className="ml-3 flex items-center gap-1 text-xs">
              <span className="text-slate-400">Sim</span>
              {[0, 1, 3, 7].map((d) => (
                <button
                  key={d}
                  onClick={() => setSimDays(d)}
                  className={`px-2 py-px rounded ${simDays === d ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-white/10'}`}
                  title={d === 0 ? 'Now' : `+${d} days`}
                >
                  {d === 0 ? 'Now' : `+${d}d`}
                </button>
              ))}
            </div>

            <div className="flex-1" />
            <span className="text-slate-400 hidden md:inline">Click chips to filter the living tree</span>
          </div>

          {/* Original status legend, now even more powerful next to urgency focus */}
          <div className="flex items-center gap-2 px-5 py-2 text-[10px] text-slate-500 flex-wrap">
            <span className="font-bold uppercase tracking-widest text-slate-400">Status</span>
            {[
              { c: STATUS_FILL.done, s: STATUS_STROKE.done, l: 'On track / Done', k: 'done' },
              { c: STATUS_FILL.review, s: STATUS_STROKE.review, l: 'At risk / Review', k: 'review' },
              { c: STATUS_FILL.blocked, s: STATUS_STROKE.blocked, l: 'Critical / Blocked', k: 'blocked' },
              {
                c: STATUS_FILL.in_progress,
                s: STATUS_STROKE.in_progress,
                l: 'In progress',
                k: 'in_progress',
              },
              { c: STATUS_FILL.todo, s: STATUS_STROKE.todo, l: 'To do', k: 'todo' },
            ].map((kk) => (
              <button
                key={kk.k}
                type="button"
                aria-pressed={statusFocus === kk.k}
                onClick={() => setStatusFocus((cur) => (cur === kk.k ? null : kk.k))}
                title={
                  statusFocus === kk.k
                    ? 'Clear the status spotlight'
                    : `Spotlight ${kk.l.toLowerCase()} tasks — everything else dims`
                }
                className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-colors ${
                  statusFocus === kk.k
                    ? 'bg-slate-100 ring-1 ring-slate-300 text-slate-800 font-bold'
                    : statusFocus
                      ? 'opacity-45 hover:opacity-100'
                      : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded"
                  style={{ background: kk.c, border: `1.5px solid ${kk.s}` }}
                />
                <span>{kk.l}</span>
              </button>
            ))}
            <span className="ml-auto text-slate-400 hidden lg:inline">
              Drag nodes · ⌘/Ctrl+scroll or pinch to zoom · / search · F fit · B brush · T tasks
            </span>
          </div>
        </div>

        {editing && (
          <BirdsEyeTaskEditor
            task={editing.node.data as BirdsEyeTask}
            anchorX={editing.clientX}
            anchorY={editing.clientY}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChange?.();
            }}
          />
        )}

        {addingTaskFor &&
          (() => {
            const node = addingTaskFor.node;
            const projectId =
              node.kind === 'project'
                ? (node.data as BirdsEyeProject).id
                : node.kind === 'phase'
                  ? // Phase-scope view: every task belongs to the same project as
                    // the existing tasks in this view, so we can grab the first.
                    data.tasks[0]?.projectId || ''
                  : '';
            const phaseName = node.kind === 'phase' ? node.label : undefined;
            if (!projectId) return null;
            return (
              <BirdsEyeNewTaskEditor
                projectId={projectId}
                phaseName={phaseName}
                anchorX={addingTaskFor.clientX}
                anchorY={addingTaskFor.clientY}
                onClose={() => setAddingTaskFor(null)}
                onSaved={() => {
                  setAddingTaskFor(null);
                  onChange?.();
                }}
              />
            );
          })()}
      </div>
    </div>,
    document.body,
  );
}

/* ── Inline task editor ────────────────────────────────────────────────────
   Anchored popover for the pencil affordance on task nodes. Two fields only —
   the two the user said matter most from the bird's-eye altitude (assignee
   and TCD/due-date) — so a lead can rebalance work without diving into the
   task page. Persists via the same PATCH /tasks/:id endpoint the task page
   uses, so audit-trail and validation behave identically. */
function BirdsEyeTaskEditor({
  task,
  anchorX,
  anchorY,
  onClose,
  onSaved,
}: {
  task: BirdsEyeTask;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pull the live task so we have the canonical fields + project to pick the
      // members list from. The bird's-eye payload only carries labels, not ids.
      try {
        const t = await api<any>(`/tasks/${task.id}`);
        if (cancelled) return;
        setTitle(t.title || task.title);
        setStatus(t.status || 'todo');
        setPriority(t.priority || 'medium');
        setAssigneeId(t.assigneeId || '');
        setDue(t.ccTcd || t.dueDate || '');
        const projectId = t.projectId;
        if (projectId) {
          const proj = await api<any>(`/projects/${projectId}`).catch(() => null);
          const teamId = proj?.teamId;
          const users = await api<any[]>(`/users${teamId ? `?teamId=${teamId}` : ''}`).catch(() => []);
          if (!cancelled) setMembers(users.map((u: any) => ({ id: u.id, name: u.name })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Could not load task');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  async function save() {
    const t = title.trim();
    if (!t) {
      setErr('Title is required');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: any = {
        title: t,
        status,
        priority,
        assigneeId: assigneeId || null,
        ccTcd: due || null,
      };
      await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      notifyCalendarChange();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Anchor against the viewport but keep the popover fully on-screen.
  const POP_W = 280;
  const POP_H = 440;
  const left = Math.min(
    Math.max(8, anchorX - POP_W / 2),
    (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8,
  );
  const top = Math.min(
    Math.max(8, anchorY + 12),
    (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8,
  );

  return (
    <>
      {/* Click-away catcher (sits between modal and popover) */}
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] rounded-xl border border-slate-200 bg-white shadow-2xl p-3 modal-in max-h-[90vh] overflow-y-auto"
        style={{ left, top, width: POP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">Quick edit</div>
            <a
              href={`/tasks/${task.id}`}
              className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 inline-flex items-center gap-0.5"
              title="Open the full task page"
            >
              Open full task <ArrowUpRight size={11} />
            </a>
          </div>
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1 mb-1">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-[13px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          placeholder="Task title"
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
              Status
            </label>
            <Select
              value={status}
              onChange={setStatus}
              ariaLabel="Status"
              options={[
                { value: 'todo', label: 'To do' },
                { value: 'in_progress', label: 'In progress' },
                { value: 'review', label: 'Review' },
                { value: 'blocked', label: 'Blocked' },
                { value: 'done', label: 'Done' },
              ]}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
              Priority
            </label>
            <Select
              value={priority}
              onChange={setPriority}
              ariaLabel="Priority"
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'critical', label: 'Critical' },
              ]}
            />
          </div>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Assignee
        </label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[
            { value: '', label: 'Unassigned' },
            ...members.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Target completion date
        </label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Inline new-task editor ────────────────────────────────────────────────
   Quick "+" affordance on project/phase nodes. Two fields only — title and
   assignee — so a lead can spawn work mid-brainstorm without leaving the
   bird's-eye altitude. The new task carries the parent phase as its
   `phaseName` when added from a phase node, so it lands in the right
   column on the next render. */
function BirdsEyeNewTaskEditor({
  projectId,
  phaseName,
  anchorX,
  anchorY,
  onClose,
  onSaved,
}: {
  projectId: string;
  phaseName?: string;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const proj = await api<any>(`/projects/${projectId}`).catch(() => null);
        const teamId = proj?.teamId;
        const users = await api<any[]>(`/users${teamId ? `?teamId=${teamId}` : ''}`).catch(() => []);
        if (!cancelled) setMembers(users.map((u: any) => ({ id: u.id, name: u.name })));
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Could not load project');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function save() {
    const t = title.trim();
    if (!t) {
      setErr('Title is required');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: any = { projectId, title: t };
      if (assigneeId) body.assigneeId = assigneeId;
      if (due) body.ccTcd = due;
      // Resolve phase name → phaseId from the project payload so the new task
      // lands in the right column. "Unphased" is the synthetic bucket used
      // when a phase has no name — skip lookup in that case.
      if (phaseName && phaseName !== 'Unphased') {
        try {
          const proj = await api<any>(`/projects/${projectId}`);
          const phase = (proj?.phases || []).find((p: any) => p.name === phaseName);
          if (phase?.id) body.phaseId = phase.id;
        } catch {
          /* phase lookup is best-effort */
        }
      }
      await api('/tasks', { method: 'POST', body });
      notifyCalendarChange();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const POP_W = 300;
  const POP_H = 310;
  const left = Math.min(
    Math.max(8, anchorX - POP_W / 2),
    (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8,
  );
  const top = Math.min(
    Math.max(8, anchorY + 12),
    (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8,
  );

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] rounded-xl border border-slate-200 bg-white shadow-2xl p-3 modal-in max-h-[90vh] overflow-y-auto"
        style={{ left, top, width: POP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">Add task</div>
            <div className="text-[12px] font-bold text-slate-800 truncate">
              {phaseName ? `Under "${phaseName}"` : 'Under this project'}
            </div>
          </div>
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">
          Title
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="What needs doing?"
          className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          }}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Assignee
        </label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[
            { value: '', label: 'Unassigned' },
            ...members.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Target completion date
        </label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={12} /> {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
