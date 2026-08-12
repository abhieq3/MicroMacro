import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { Notification } from '@/models/Notification';
import { requireUser, canMutate, isAdmin } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskUpdateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { getTaskDetail } from '@/lib/taskDetail';
import { notify } from '@/lib/notify';
import { logOperation } from '@/lib/audit';
import { recordTaskFlowEvent } from '@/lib/flow/events';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';

export const runtime = 'nodejs';

async function assertTaskInScope(taskId: string, userId: string, role?: string | null) {
  const t = await Task.findById(taskId).select('projectId privateToUserId').lean();
  if (!t) return { t: null, forbidden: false, ownsProject: false, ownsPersonal: false, ownsPrivate: false };
  const privateOwner = (t as any).privateToUserId;
  const ownsPrivate = !!privateOwner && String(privateOwner) === String(userId);
  if (privateOwner && !ownsPrivate) {
    return { t, forbidden: true, ownsProject: false, ownsPersonal: false, ownsPrivate: false };
  }
  const scope = await getLeadScope(userId, role);
  const proj = await Project.findOne({ _id: t.projectId, ...projectsVisibleFilter(scope) })
    .select('_id isPersonal ownerId')
    .lean();
  // The project owner has full authority over its tasks — destructive actions
  // (delete) are gated on ownership, not just the lead role.
  const ownsProject = !!(proj && String((proj as any).ownerId) === String(userId));
  // The owner of a personal project has full authority over its tasks, even as
  // an IC — a private workspace would be pointless otherwise.
  const ownsPersonal = !!(proj && (proj as any).isPersonal && ownsProject);
  return { t, forbidden: !proj, ownsProject, ownsPersonal, ownsPrivate };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    // Single source of truth shared with the server-rendered task page.
    const detail = await getTaskDetail(params.id, user!.sub, user!.role);
    if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { forbidden, ownsPersonal, ownsPrivate } = await assertTaskInScope(
      params.id,
      user!.sub,
      user!.role,
    );
    if (forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const body = await readBody(req, TaskUpdateSchema);
    const current = await Task.findById(params.id).select('status assigneeId privateToUserId').lean();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Contributors may edit only the description and due date, and only on a
    // task that is assigned to them. Everything else — status, assignee,
    // priority, compliance flags, reference fields — stays lead-owned, and a
    // task assigned to someone else (or unassigned) is fully read-only for an
    // IC. Exception: inside their own personal project the owner edits freely.
    //
    // The permission check uses `current.assigneeId`, but we close the TOCTOU
    // race (a concurrent lead re-assignment sneaking between the permission
    // read and the actual write) by folding the assignee guard into the update
    // filter for contributor-scoped edits. If the task was reassigned before
    // our write lands, findOneAndUpdate returns null and we surface a 403
    // rather than silently mutating a task the caller no longer owns.
    const icEdit = !canMutate(user!.role) && !ownsPersonal && !ownsPrivate;
    if (icEdit) {
      const isAssignee = current.assigneeId && String(current.assigneeId) === String(user!.sub);
      const keys = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
      const IC_EDITABLE = new Set(['description', 'dueDate']);
      const onlyAllowed = isAssignee && keys.length > 0 && keys.every((k) => IC_EDITABLE.has(k));
      if (!onlyAllowed) {
        return NextResponse.json(
          {
            error:
              'Contributors can edit only the description and due date of a task assigned to them; everything else is read-only.',
          },
          { status: 403 },
        );
      }
    }

    const set: any = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (['startDate', 'dueDate', 'ccTcd'].includes(k)) set[k] = v ? new Date(v as string) : null;
      else set[k] = v;
    }
    if (body.status === 'done' && current.status !== 'done') set.completedAt = new Date();
    else if (body.status && body.status !== 'done') set.completedAt = null;
    set.lastActivityAt = new Date();

    // For contributor edits we add `assigneeId` to the update filter so the
    // write is atomic with the permission check — if the task was re-assigned
    // concurrently the update is a no-op and we return 403.
    const updateFilter = icEdit ? { _id: params.id, assigneeId: user!.sub } : { _id: params.id };
    const fresh = await Task.findOneAndUpdate(updateFilter, { $set: set }, { new: true }).lean();
    if (!fresh) {
      return NextResponse.json(
        { error: icEdit ? 'Task is no longer assigned to you.' : 'Not found' },
        { status: icEdit ? 403 : 404 },
      );
    }

    // ── Notifications ────────────────────────────────────────────────
    // Reassigned → tell the new assignee. Marked done by an assignee →
    // tell the project owner their work landed.
    const isPrivateTask = !!(fresh as any).privateToUserId;
    const reassigned =
      body.assigneeId !== undefined && String(body.assigneeId || '') !== String(current.assigneeId || '');
    if (!isPrivateTask && reassigned && body.assigneeId) {
      await notify({
        userId: String(body.assigneeId),
        actorId: user!.sub,
        type: 'task_assigned',
        title: 'New task assigned to you',
        body: (fresh as any)?.title || '',
        taskId: params.id,
        projectId: String((fresh as any)?.projectId || ''),
        preferenceKey: 'notifTaskAssigned',
      });
    }
    if (!isPrivateTask && body.status === 'done' && current.status !== 'done') {
      const proj = await Project.findById((fresh as any)?.projectId)
        .select('ownerId name')
        .lean();
      if (proj && (proj as any).ownerId) {
        await notify({
          userId: String((proj as any).ownerId),
          actorId: user!.sub,
          type: 'task_done',
          title: 'A task was completed',
          body: (fresh as any)?.title || '',
          taskId: params.id,
          projectId: String((fresh as any)?.projectId || ''),
          preferenceKey: 'notifProjectUpdate',
        });
      }
    }

    // Recurring activity — completing an occurrence spawns the next one so the
    // chore keeps appearing on its cadence. Best-effort: a failure here must
    // never block the completion the user just made.
    if (body.status === 'done' && current.status !== 'done' && (fresh as any).recurringActivityId) {
      try {
        const { RecurringActivity } = await import('@/models/RecurringActivity');
        const { generateOccurrence, hasOpenOccurrence } = await import('@/lib/recurring');
        const activity = await RecurringActivity.findById((fresh as any).recurringActivityId);
        if (activity && activity.active && !(await hasOpenOccurrence(String(activity._id)))) {
          await generateOccurrence(activity);
        }
      } catch (e) {
        console.error('[recurring] spawn-next failed', e);
      }
    }

    const statusChanged = !!body.status && body.status !== current.status;
    // Flow Signal — record actual work movement on the meaningful event
    // stream. Status, completion, reassignment count; cosmetic edits (title,
    // description, dueDate, priority) deliberately do NOT bump the stream
    // or lastMeaningfulActivityAt, so a project can't be made to look
    // "active" by editing its title.
    if (statusChanged) {
      void recordTaskFlowEvent({
        taskId: params.id,
        projectId: String((fresh as any)?.projectId || ''),
        eventType: body.status === 'done' ? 'task_completed' : 'status_changed',
        actorId: user!.sub,
        stateBefore: current.status,
        stateAfter: body.status,
        taskType: (fresh as any)?.taskType || undefined,
      });
    }
    if (reassigned && body.assigneeId) {
      void recordTaskFlowEvent({
        taskId: params.id,
        projectId: String((fresh as any)?.projectId || ''),
        eventType: current.assigneeId ? 'task_reassigned' : 'task_assigned',
        actorId: user!.sub,
        taskType: (fresh as any)?.taskType || undefined,
        metadata: {
          fromAssigneeId: current.assigneeId ? String(current.assigneeId) : null,
          toAssigneeId: String(body.assigneeId),
        },
      });
    }

    const proj = await Project.findById((fresh as any)?.projectId)
      .select('isPersonal code')
      .lean();
    if (
      !isPrivateTask &&
      !((proj as any)?.isPersonal || String((proj as any)?.code || '').startsWith('PRSN-'))
    ) {
      await logOperation({
        action: statusChanged ? 'task.status' : 'task.update',
        category: 'task',
        actor: user,
        targetType: 'task',
        targetId: params.id,
        targetLabel: (fresh as any)?.title || '',
        summary: statusChanged ? `Task status → ${body.status}` : 'Updated task',
        meta: { projectId: String((fresh as any)?.projectId || '') },
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json(taskS(fresh));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { t, forbidden, ownsProject, ownsPrivate } = await assertTaskInScope(
      params.id,
      user!.sub,
      user!.role,
    );
    if (!t || forbidden) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Deleting a task is destructive — only the PROJECT OWNER may do it (plus
    // workspace admins, who can already delete the entire project). Leads who
    // don't own the project may manage tasks but not destroy them. The owner
    // of a private task overlay can always delete their own overlay.
    if (!isAdmin(user!.role) && !ownsProject && !ownsPrivate) {
      return NextResponse.json({ error: 'Only the project owner can delete tasks.' }, { status: 403 });
    }
    const doomed = await Task.findById(params.id).select('title projectId').lean();
    await Task.deleteOne({ _id: params.id });

    // Cascade: remove every connected record so a deleted task leaves nothing
    // dangling across the app. Notifications that deep-link to this task (e.g.
    // an assignment alert already sitting in someone's bell) would otherwise
    // 404 when clicked — so they're cleared here. Subtasks, comments and the
    // effort log are embedded in the Task document and go with it automatically.
    await Notification.deleteMany({ taskId: params.id });

    const doomedProj = await Project.findById((doomed as any)?.projectId)
      .select('isPersonal code')
      .lean();
    if (!((doomedProj as any)?.isPersonal || String((doomedProj as any)?.code || '').startsWith('PRSN-'))) {
      await logOperation({
        action: 'task.delete',
        category: 'task',
        actor: user,
        targetType: 'task',
        targetId: params.id,
        targetLabel: (doomed as any)?.title || '',
        summary: `Deleted task "${(doomed as any)?.title || ''}"`,
        meta: { projectId: String((doomed as any)?.projectId || '') },
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
