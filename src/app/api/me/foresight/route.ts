import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildForesight } from '@/lib/ai/deliveryForesight';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in member's own Delivery Foresight (full forecast) — the canonical
 * "my foresight" endpoint, used by My Day to point at the one task to start.
 * Self-only by construction: it always forecasts the caller's own plate, so the
 * full schedule simulation (clear date, riskiest task) is theirs to see.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    const f = await buildForesight(user.sub, { includePlate: true, trials: 3000 });
    return NextResponse.json(f, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    return handleError(e);
  }
}
