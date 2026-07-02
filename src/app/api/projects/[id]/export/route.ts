import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { isLead, requireUser } from '@/lib/auth';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { rateLimit } from '@/lib/rateLimit';
import { handleError } from '@/lib/http';
import { buildProjectWorkbook, exportFilename } from '@/lib/reports/projectWorkbook';

export const runtime = 'nodejs';

/**
 * GET /api/projects/[id]/export
 *
 * Streams a minimal two-sheet xlsx (Summary + Tasks) for one project. This
 * handler stays a thin loader: scope-check, fetch, resolve id → name maps, then
 * hand already-shaped data to `buildProjectWorkbook` (unit-tested, DB-free).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    // xlsx generation hits Task.find + User.find({}) every call. Cap at 6/min/user
    // so a single lead can't keep the worker pegged.
    if (!rateLimit(`export:${user.sub}`, 6, 60_000)) {
      return NextResponse.json(
        { error: 'Too many exports in a short time. Wait a minute and try again.' },
        { status: 429 },
      );
    }
    await connectDB();

    // Scope to what this lead/admin can actually see — personal projects are
    // owner-only and must be unreachable through export, exactly like a 404.
    const scope = await getLeadScope(user.sub, user.role);
    const project = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).lean();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [tasksRaw, users, team] = await Promise.all([
      Task.find({ projectId: project._id }).sort({ createdAt: 1 }).lean(),
      User.find({}, 'name _id').lean(),
      (project as any).teamId ? Team.findById((project as any).teamId, 'name').lean() : null,
    ]);

    // Resolve ids → names once so the workbook builder stays presentation-only.
    const userMap = new Map(users.map((u: any) => [String(u._id), u.name]));
    const tasks = (tasksRaw as any[]).map((t) => ({
      ...t,
      assigneeName: t.assigneeId ? userMap.get(String(t.assigneeId)) || 'Unknown' : '',
    }));

    const proj: any = project;
    proj.ownerName = proj.ownerId ? userMap.get(String(proj.ownerId)) || '' : '';
    proj.teamName = (team as any)?.name || '';

    const wb = buildProjectWorkbook(proj, tasks);
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${exportFilename(proj)}"`,
        'Content-Length': buf.byteLength.toString(),
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
