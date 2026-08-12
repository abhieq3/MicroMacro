import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Whiteboard } from '@/models/Whiteboard';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Stroke = z.object({
  id: z.string().max(40).optional(),
  tool: z.enum(['pen', 'highlighter', 'eraser', 'text', 'rect', 'ellipse', 'arrow']),
  color: z.string().max(20),
  size: z.number().finite().min(0.1).max(40),
  points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).max(2500),
  text: z.string().max(500).optional().default(''),
  promotedTaskId: z.string().max(40).optional().default(''),
});

const Body = z.object({ strokes: z.array(Stroke).max(800) });

async function assertProjectVisible(projectId: string, userId: string, role: string) {
  const scope = await getLeadScope(userId, role);
  const proj = await Project.findOne({ _id: projectId, ...projectsVisibleFilter(scope) })
    .select('_id name')
    .lean();
  return proj;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const proj = await assertProjectVisible(params.id, user!.sub, user!.role);
    if (!proj) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const doc = await Whiteboard.findOne({ projectId: params.id }).lean();
    let updatedByName: string | null = null;
    if ((doc as any)?.updatedBy) {
      const u = await User.findById((doc as any).updatedBy).select('name').lean();
      updatedByName = (u as any)?.name || null;
    }
    return NextResponse.json({
      projectId: params.id,
      projectName: (proj as any).name,
      strokes: doc?.strokes || [],
      updatedAt: (doc as any)?.updatedAt || null,
      updatedByName,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const proj = await assertProjectVisible(params.id, user!.sub, user!.role);
    if (!proj) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await readBody(req, Body);
    const doc = await Whiteboard.findOneAndUpdate(
      { projectId: params.id },
      { $set: { strokes: body.strokes, updatedBy: user!.sub }, $unset: { userId: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    return NextResponse.json({
      strokes: doc?.strokes || [],
      updatedAt: (doc as any)?.updatedAt || null,
    });
  } catch (e) {
    return handleError(e);
  }
}
