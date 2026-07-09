import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge auth pre-filter.
 *
 * Runs on Vercel's Edge network (geographically near the user) BEFORE any
 * Node serverless function spins up. It is deliberately minimal and is NOT a
 * replacement for the real authentication check:
 *
 *   • Every authed page's Server Component still calls validateSession()
 *     (full `jsonwebtoken` verify + a MongoDB session check for
 *     sessionVersion / activeSessionId / active) in the Node runtime. That is
 *     and remains the single source of truth for access.
 *
 *   • This middleware only short-circuits requests that carry NO session
 *     cookie at all — logged-out users, bots, and crawlers hitting an authed
 *     route. They are redirected straight to /login at the edge, so they never
 *     start a Node function or open a database connection. At scale this keeps
 *     junk traffic off the Node/Mongo tier.
 *
 * Fail-open by design: if the cookie IS present we pass the request straight
 * through and let Node do the authoritative validation (which will redirect an
 * invalid/expired/deactivated session itself, exactly as before). We never
 * verify the signature here — no JWT secret touches the edge, and a forged
 * cookie gains nothing because Node still rejects it.
 *
 * The matcher is an explicit allow-list of the known authed route segments, so
 * public routes (/login, /forgot-password, the bootstrap flow, static assets,
 * API routes, and any public profile page) are never touched. When a NEW
 * top-level authed route is added, add its segment here too.
 */

const SESSION_COOKIE = 'pragati_token';

export function middleware(req: NextRequest) {
  const hasSession = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasSession) return NextResponse.next();

  // No session cookie on an authed route → bounce to login at the edge.
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = ''; // don't echo the attempted path back in the URL
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Allow-list of authed routes only. Mirrors the folders under src/app/(authed).
  // Keep in sync when adding a new top-level authed segment — missing entries
  // still get Node-side auth via the layout, but they lose the free edge bounce.
  matcher: [
    '/', // dashboard
    '/admin/:path*',
    '/audit/:path*',
    '/csv-activity/:path*',
    '/my-day/:path*',
    '/people/:path*',
    '/projects/:path*',
    '/settings/:path*',
    '/tasks/:path*',
    '/teams/:path*',
    '/whiteboard/:path*',
  ],
};
