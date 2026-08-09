import { NextResponse } from 'next/server';
import { getQuotesPayload } from '@/lib/quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public login quote library.
 *
 * Returns builtin founders set + optional live feed (QUOTES_FEED_URL).
 * No auth — the login page is unauthenticated. Cache short on the edge
 * so new remote lines appear within minutes without thrashing the feed.
 */
export async function GET() {
  try {
    const payload = await getQuotesPayload();
    return NextResponse.json(payload, {
      headers: {
        // Browsers may hold briefly; CDN can revalidate hourly.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    console.error('[quotes]', e);
    return NextResponse.json({ error: 'Quotes unavailable' }, { status: 500 });
  }
}
