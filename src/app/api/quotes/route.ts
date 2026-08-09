import { NextResponse } from 'next/server';
import { getQuotesPayload } from '@/lib/quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public login quote library — live web APIs (ZenQuotes daily + DummyJSON).
 * No auth. Short CDN cache; server re-pulls from the public web each day.
 */
export async function GET() {
  try {
    const payload = await getQuotesPayload();
    return NextResponse.json(payload, {
      headers: {
        // Refresh through the day; live sources re-fetch on the server daily.
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (e) {
    console.error('[quotes]', e);
    return NextResponse.json({ error: 'Quotes unavailable' }, { status: 500 });
  }
}
