import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Whiteboard } from '@/models/Whiteboard';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  strokes: z
    .array(
      z.object({
        tool: z.enum(['pen', 'highlighter', 'eraser', 'text', 'rect', 'ellipse', 'arrow']),
        color: z.string().max(20),
        size: z.number().finite().min(0.1).max(40),
        points: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).max(2500),
        text: z.string().max(500).optional().default(''),
      }),
    )
    .max(800),
});

/**
 * GET / PUT the current user's whiteboard. Owner-private — there is no
 * cross-user read path, even for admin. This is a personal scratch
 * surface, never an organisational record.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const doc = await Whiteboard.findOne({ userId: user!.sub }).lean();
    return NextResponse.json({
      strokes: doc?.strokes || [],
      updatedAt: (doc as any)?.updatedAt || null,
    });
  } catch (e) {
    return handleError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const doc = await Whiteboard.findOneAndUpdate(
      { userId: user!.sub },
      { $set: { strokes: body.strokes } },
      { upsert: true, new: true },
    ).lean();
    return NextResponse.json({
      strokes: doc?.strokes || [],
      updatedAt: (doc as any)?.updatedAt || null,
    });
  } catch (e) {
    return handleError(e);
  }
}
