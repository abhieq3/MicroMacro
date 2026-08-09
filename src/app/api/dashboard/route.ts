import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { getLeadDashboardData } from '@/lib/leadDashboard';

export const runtime = 'nodejs';

/**
 * Legacy alias — one dashboard pipeline only.
 * Prefer /api/lead-dashboard; this route returns the same payload so nothing
 * forks a second query shape.
 */
export async function GET(req: NextRequest) {
  try {
    const { user: jwtUser, error } = await requireUser(req);
    if (error) return error;
    const data = await getLeadDashboardData(jwtUser!);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=60' },
    });
  } catch (e) {
    return handleError(e);
  }
}
