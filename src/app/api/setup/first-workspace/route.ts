import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { isLead, requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { team as teamS, project as projectS } from '@/lib/serialize';
import { logOperation } from '@/lib/audit';
import { bustDashboardCache } from '@/lib/leadDashboard';
import { bustProjectsPageCache } from '@/lib/projectList';
import { LIFECYCLES } from '@/lib/lifecycles';

export const runtime = 'nodejs';

const Body = z.object({
  teamName: z.string().min(1).max(80),
  projectName: z.string().min(1).max(200),
});

/**
 * Day-one: one call creates the team (caller as lead) and a blank project.
 * First-time users were dying on Teams → People → New project. This is the
 * path they should have had.
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user!.role)) {
      return NextResponse.json({ error: 'Only a lead can create the first workspace.' }, { status: 403 });
    }
    await connectDB();
    const body = await readBody(req, Body);

    const existing = await Project.countDocuments({
      ownerId: user!.sub,
      isPersonal: { $ne: true },
      archived: { $ne: true },
    });
    if (existing > 0) {
      return NextResponse.json({ error: 'A workspace already exists. Open Projects to add another.' }, { status: 409 });
    }

    let team = await Team.findOne({ leadId: user!.sub }).sort({ createdAt: 1 });
    if (!team) {
      team = await Team.create({
        name: body.teamName.trim(),
        description: '',
        leadId: user!.sub,
        memberIds: [user!.sub],
        function: 'general',
      });
    }

    const year = new Date().getFullYear();
    const ts = Date.now().toString(36).slice(-4).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    const code = `GENERIC-${year}-${ts}${rand}`;
    const lc = LIFECYCLES.generic;
    const phaseDocs = lc.phases.map((ph, i) => ({
      _id: new mongoose.Types.ObjectId(),
      name: ph.name,
      position: i,
    }));

    const project = await Project.create({
      code,
      ccNo: code,
      name: body.projectName.trim(),
      description: '',
      lifecycle: 'generic',
      priority: 'medium',
      teamId: team._id,
      ownerId: user!.sub,
      gxpImpact: 'none',
      regulatoryRefs: lc.regulatoryRefs || '',
      phases: phaseDocs,
    });

    await logOperation({
      action: 'workspace.first',
      category: 'team',
      actor: user,
      targetType: 'project',
      targetId: String(project._id),
      targetLabel: project.name,
      summary: `First workspace: team ${team.name} · project ${project.name}`,
    });

    void bustDashboardCache(user!.sub, user!.role);
    void bustProjectsPageCache(user!.sub, user!.role);

    return NextResponse.json({
      team: teamS(team),
      project: projectS(project),
    });
  } catch (e) {
    return handleError(e);
  }
}
