import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { isLead, requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';
import { TaskCreateSchema } from '@/lib/validations';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { notify } from '@/lib/notify';
import { logOperation } from '@/lib/audit';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Any authenticated user may add tasks to a personal project they own;
    // shared (GxP) projects still require team-lead / admin authority.
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, TaskCreateSchema);

    const scope = await getLeadScope(user!.sub, user!.role);
    const project = await Project.findOne({ _id: body.projectId, ...projectsVisibleFilter(scope) })
      .select('_id isPersonal personal ownerId')
      .lean();
    if (!project) return NextResponse.json({ error: 'Project not found or not accessible' }, { status: 404 });

    const ownsPersonal =
      ((project as any).isPersonal || (project as any).personal) &&
      String((project as any).ownerId) === user!.sub;
    const privateToMe = !!body.privateToMe;
    if (!privateToMe && !ownsPersonal && !isLead(user!.role)) {
      // Anyone who can see the project may add a bare todo (whiteboard → task).
      // Structure (assignee, dates, compliance) stays lead-owned.
      const leadOnly = [
        'assigneeId',
        'phaseId',
        'gxpCritical',
        'requiresQaSignoff',
        'dueDate',
        'ccTcd',
        'priority',
      ];
      const extras = leadOnly.filter((k) => (body as any)[k] !== undefined && (body as any)[k] !== '');
      if (extras.length > 0) {
        return NextResponse.json(
          { error: 'Only team leaders can assign, date, or structure tasks.' },
          { status: 403 },
        );
      }
    }
    const task = await Task.create({
      projectId: body.projectId,
      phaseId: body.phaseId,
      title: body.title,
      description: body.description || '',
      assigneeId: privateToMe ? user!.sub : body.assigneeId || undefined,
      priority: body.priority || 'medium',
      taskType: body.taskType || 'task',
      gxpCritical: !!body.gxpCritical,
      requiresQaSignoff: !!body.requiresQaSignoff,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      estimatedHours: body.estimatedHours,
      ccNo: body.ccNo || '',
      ccTcd: body.ccTcd ? new Date(body.ccTcd) : undefined,
      documentNo: body.documentNo || '',
      applicableSite: body.applicableSite || 'na',
      deployStage: body.deployStage || 'na',
      remarks: body.remarks || '',
      privateToUserId: privateToMe ? user!.sub : undefined,
    });

    // Tell the assignee they have new work (unless they assigned it to
    // themselves).
    if (!privateToMe && body.assigneeId) {
      await notify({
        userId: String(body.assigneeId),
        actorId: user!.sub,
        type: 'task_assigned',
        title: 'New task assigned to you',
        body: task.title,
        taskId: String(task._id),
        projectId: String(body.projectId),
        preferenceKey: 'notifTaskAssigned',
      });
    }

    // Tasks inside a personal project stay out of the cross-user audit trail.
    if (!privateToMe && !(project as any).isPersonal) {
      await logOperation({
        action: 'task.create',
        category: 'task',
        actor: user,
        targetType: 'task',
        targetId: String(task._id),
        targetLabel: task.title,
        summary: `Created task "${task.title}"`,
        meta: { projectId: String(body.projectId) },
      });
    }

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);
    return NextResponse.json(taskS(task));
  } catch (e) {
    return handleError(e);
  }
}
