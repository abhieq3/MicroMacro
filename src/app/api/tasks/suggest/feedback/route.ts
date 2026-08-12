import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { SuggestionEvent } from '@/models/SuggestionEvent';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { RANKER_VERSION } from '@/lib/ai/ranker';

export const runtime = 'nodejs';

const Body = z.object({
  projectId: z.string().min(1),
  title: z.string().max(300).optional(),
  variant: z.enum(['heuristic', 'ranker']),
  suggestedAssigneeId: z.string().optional().default(''),
  suggestedDueDate: z.string().optional().default(''),
  chosenAssigneeId: z.string().optional().default(''),
  chosenDueDate: z.string().optional().default(''),
});

/**
 * Log one suggest interaction. Fire-and-forget from the add-task chip.
 * Never blocks task creation; never writes the task itself.
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    const scope = await getLeadScope(user!.sub, user!.role);
    const project = await Project.findOne({
      _id: body.projectId,
      ...projectsVisibleFilter(scope),
    })
      .select('_id')
      .lean();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const suggestedA = body.suggestedAssigneeId || '';
    const suggestedD = body.suggestedDueDate || '';
    const chosenA = body.chosenAssigneeId || '';
    const chosenD = body.chosenDueDate || '';

    await SuggestionEvent.create({
      projectId: body.projectId,
      actorId: user!.sub,
      title: (body.title || '').slice(0, 300),
      variant: body.variant,
      suggestedAssigneeId: suggestedA,
      suggestedDueDate: suggestedD,
      chosenAssigneeId: chosenA,
      chosenDueDate: chosenD,
      acceptedAssignee: !!suggestedA && suggestedA === chosenA,
      acceptedDue: !!suggestedD && suggestedD === chosenD,
      modelVersion: RANKER_VERSION,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
