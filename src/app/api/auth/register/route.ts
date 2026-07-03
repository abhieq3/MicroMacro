import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { normalizeRole, signToken, setAuthCookie, configuredAdminEmail } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  title: z.string().optional(),
});

// Self-registration is INVITE-ONLY in production. There is no public sign-up.
//
// This endpoint is kept solely to provision the very first workspace owner
// during a fresh deploy — and only when ALLOW_PUBLIC_REGISTRATION=true is
// explicitly set in the hosting env. Without that flag, the route is dead
// even when the user collection is empty (which is critical: the cleanup
// scripts and /bootstrap endpoint can both wipe users, and we MUST NOT let
// "0 users → self-register as anyone" become a reachable state).
//
// To onboard the founder on a brand-new database:
//   1. Set ALLOW_PUBLIC_REGISTRATION=true in Vercel env, redeploy.
//   2. Register your account. It auto-promotes to admin if email matches
//      ADMIN_EMAIL (or the hard-coded workspace-owner email).
//   3. Delete the env var, redeploy. Public registration is closed.

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`register:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
    }

    await connectDB();

    if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      // On an empty database this is the founder mid-setup, not an intruder —
      // tell them the one switch they're missing instead of "ask your admin"
      // (they ARE the admin). The latch itself stays: registration never opens
      // just because the user collection is empty.
      const empty = (await User.countDocuments()) === 0;
      return NextResponse.json(
        {
          error: empty
            ? 'One switch left: set ALLOW_PUBLIC_REGISTRATION=true in your hosting environment (Vercel → Settings → Environment Variables), redeploy, then create this account. Remove the variable afterward.'
            : 'Self-registration is disabled. Ask your administrator for an invite.',
        },
        { status: 403 },
      );
    }

    const count = await User.countDocuments();
    if (count > 0) {
      return NextResponse.json(
        { error: 'Self-registration is disabled. Ask your administrator for an invite.' },
        { status: 403 },
      );
    }
    const body = await readBody(req, Body);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    // Founder gets the admin role automatically when their email matches
    // ADMIN_EMAIL, otherwise lead.
    const email = body.email.toLowerCase();
    const role = email === configuredAdminEmail() ? 'admin' : 'lead';
    const user = await User.create({
      email,
      name: body.name,
      passwordHash: bcrypt.hashSync(body.password, 10),
      role,
      title: body.title || '',
      hasSeenTour: false,
    });
    const token = signToken({
      sub: String(user._id),
      email: user.email,
      role: normalizeRole(user.role),
      name: user.name,
      title: user.title || '',
    });
    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
