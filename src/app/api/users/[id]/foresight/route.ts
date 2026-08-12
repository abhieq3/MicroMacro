import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildForesight, composePublicHeadline } from '@/lib/ai/deliveryForesight';

export const runtime = 'nodejs';
// Reads the clock + live task history on every hit; must never be cached at the
// route layer (the engine's workspace prior is cached internally instead).
export const dynamic = 'force-dynamic';

/**
 * Delivery Foresight for one member.
 *
 * Two distinct shapes by viewer:
 *   • SELF — the full forecast: schedule-simulation clear date, per-task slip
 *     risk, the headline and the digest line. Computed over the member's own
 *     open plate (including private overlays, which only they can see anyway).
 *   • COLLEAGUE — a redacted "delivery rhythm" read: reliability, on-time rate,
 *     typical turnaround, velocity trend and peak ship-day only. The open
 *     plate is never loaded, so no private/personal task ever informs (or
 *     leaks through) a colleague's view — the same scope the public
 *     contribution heatmap already exposes.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const isSelf = params.id === user!.sub;
    const f = await buildForesight(params.id, { includePlate: isSelf, trials: 3000 });

    if (isSelf) {
      return NextResponse.json(
        { self: true, ...f },
        { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } },
      );
    }

    // Colleague view — strip everything plate-derived; expose rhythm only.
    return NextResponse.json(
      {
        self: false,
        hasSignal: f.hasSignal,
        confidence: f.confidence,
        publicHeadline: composePublicHeadline(f),
        reliability: f.reliability,
        reliabilityLabel: f.reliabilityLabel,
        onTimeRate: f.onTimeRate,
        typicalTurnaroundDays: f.typicalTurnaroundDays,
        throughputPerWeek: f.throughputPerWeek,
        trend: f.trend,
        peakDay: f.peakDay,
        peakPeriod: f.peakPeriod,
        spark: f.spark,
        samples: f.samples,
      },
      { headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=600' } },
    );
  } catch (e) {
    return handleError(e);
  }
}
