import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signToken, setAuthCookie, setDeviceCookie, configuredAdminEmail, newSessionId } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';
import { rateLimit } from '@/lib/rateLimit';
import { logOperation } from '@/lib/audit';
import { isDemoAccount } from '@/lib/demo';

export const runtime = 'nodejs';

/**
 * Login body accepts either a `username` (Instagram-style handle) or an
 * `email`. The form ships a single `identifier` field that can hold either;
 * we resolve which database column to query based on whether the string
 * contains an "@". Either is valid; ambiguous input (e.g. someone with a
 * username that happens to look like an email) prefers the email column.
 */
const Body = z.object({
  identifier: z.string().min(1).max(254),
  password: z.string().min(1).max(200),
});

// After this many consecutive wrong passwords the account is locked
// until an admin/lead clears it from the People page.
const MAX_FAILED_LOGINS = 5;

// Generic "wrong email or password" response. We never reveal which half
// was wrong — even when the account is locked — so an attacker can't
// enumerate valid emails by watching status codes or messages. Real
// users get the helpful message in-product once they sign in successfully
// (their admin tells them their account was locked).
const GENERIC_INVALID = { status: 401, body: { error: 'Invalid email or password.' } } as const;

export async function POST(req: NextRequest) {
  try {
    // Two-tier brute-force throttle. The per-IP limit (20/min) caps single-
    // source attacks; the per-identifier limit (10/min) caps distributed
    // credential-stuffing — an attacker spraying one username from many IPs
    // would otherwise sail past the per-IP gate. The per-account lockout
    // (5 wrong passwords) is the third line of defence.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Wait a minute and try again.' },
        { status: 429 },
      );
    }

    // Validate the body BEFORE touching the database, so malformed input
    // fails fast with a 400 regardless of DB health.
    const body = await readBody(req, Body);
    const idKey = body.identifier.toLowerCase().trim();
    if (!rateLimit(`login-id:${idKey}`, 10, 60_000)) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts on this account. Wait a minute and try again.' },
        { status: 429 },
      );
    }
    await connectDB();
    const ident = body.identifier.toLowerCase().trim();
    // Sign in with whatever the person remembers — username, employee ID,
    // or email. For legacy accounts created before usernames existed, we
    // also match the email's local-part (so "abhi.patel" finds
    // "abhi.patel@company.com"). All identifiers are unique.
    let user;
    if (ident.includes('@')) {
      user = await User.findOne({ email: ident });
    } else {
      const localPart = new RegExp('^' + ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '@', 'i');
      user = await User.findOne({
        $or: [{ username: ident }, { employeeId: body.identifier.trim() }, { email: localPart }],
      });
    }

    // Unified "invalid" path for missing user, locked user, and wrong
    // password. We still do the bcrypt comparison against a dummy hash
    // even when no user matched, so the response time doesn't reveal
    // whether the email exists in the database.
    const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZQAYPwLqL.qZdW7HtLZqL2lF6f7Pi';
    const passwordOk = bcrypt.compareSync(body.password, user?.passwordHash || DUMMY_HASH);

    if (!user) {
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    // ── Admin recovery key ───────────────────────────────────────────────
    // An admin who forgot their password can type the recovery key they
    // generated in their profile into the password field and sign straight
    // in. It works as an alternate credential, never counts toward the
    // lockout counter, and deliberately bypasses an existing lock — that's
    // the whole point: it's the way back in when nothing else works.
    const securityKeyOk =
      !passwordOk &&
      user.role === 'admin' &&
      !!(user as any).securityKeyHash &&
      bcrypt.compareSync(body.password, (user as any).securityKeyHash);

    // Public demo accounts are never walled off by a lock. Their password is
    // published in the README, so the lockout secures nothing and only lets a
    // visitor DoS the shared demo by typing a wrong password five times. They
    // fall through to normal password verification; the success path below then
    // clears any lock an earlier visitor left behind (self-healing). See
    // src/lib/demo.ts.
    const demo = isDemoAccount(user.email);

    if (user.lockedAt && !securityKeyOk && !demo) {
      // The account is real (we matched it above) and is locked. Telling
      // the user this is far more useful than a generic "invalid" wall —
      // a legitimate user keeps retrying with the correct password and
      // would never learn why it stops working. Email enumeration is not
      // a concern here: we already matched a known account.
      return NextResponse.json(
        {
          error:
            'Your account is locked after multiple wrong attempts. Please contact your admin to unlock it and reset your password.',
          locked: true,
        },
        { status: 423 },
      );
    }

    if (!passwordOk && !securityKeyOk) {
      // Demo accounts never accrue failed attempts, so they can never lock —
      // their password is public, so the lockout would only be a self-DoS
      // vector. Reject the wrong password without touching the counter.
      if (demo) {
        return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
      }

      // Atomic increment so two concurrent wrong-password requests can't
      // both read N and both write N+1. The 5th miss flips lockedAt in
      // the same round-trip; if the counter is already at the threshold
      // we get the lockedAt timestamp back from the same operation.
      const updated = await User.findOneAndUpdate(
        { _id: user._id, lockedAt: null },
        [
          {
            $set: {
              failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] },
            },
          },
          {
            $set: {
              lockedAt: {
                $cond: [{ $gte: ['$failedLoginAttempts', MAX_FAILED_LOGINS] }, new Date(), null],
              },
            },
          },
        ] as any,
        { new: true, projection: { lockedAt: 1, failedLoginAttempts: 1 } },
      ).lean();

      // We've already confirmed this email maps to a real account (the
      // lookup above), so disclosing "locked" here doesn't help an
      // attacker enumerate emails. It DOES tell a real user why the right
      // password suddenly stops working — much better than the generic
      // "invalid" wall, which leaves them retrying forever.
      const nowLocked = !!(updated as any)?.lockedAt;
      const fails = (updated as any)?.failedLoginAttempts ?? 0;
      if (nowLocked) {
        return NextResponse.json(
          {
            error:
              'Your account is locked after multiple wrong attempts. Please contact your admin to unlock it and reset your password.',
            locked: true,
          },
          { status: 423 },
        );
      }
      const remaining = Math.max(0, MAX_FAILED_LOGINS - fails);
      if (remaining > 0 && remaining <= 2) {
        return NextResponse.json(
          {
            error: `Wrong password. ${remaining} attempt${remaining === 1 ? '' : 's'} left before this account is locked.`,
          },
          { status: 401 },
        );
      }
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    // ── Deactivated account ──────────────────────────────────────────
    // Checked only AFTER the credential is verified, so we never reveal to
    // someone who doesn't know the password that the account exists. A
    // deactivated user gets a clear, professional message (not the generic
    // "invalid" wall) because this is a known account an admin turned off —
    // they should know to contact their administrator, not keep guessing.
    if ((user as any).active === false) {
      return NextResponse.json(
        { error: 'This account has been deactivated. Please contact your administrator.' },
        { status: 403 },
      );
    }

    // ── Success path ─────────────────────────────────────────────────
    // Reset the counter and promote to admin if this email matches the
    // configured workspace owner. Single atomic save afterwards.
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedAt) {
      user.failedLoginAttempts = 0;
      user.lockedAt = null;
    }
    const adminEmail = configuredAdminEmail();
    if (adminEmail && user.email === adminEmail && user.role !== 'admin') {
      user.role = 'admin' as any;
    }

    // Stamp a fresh session id. Because every authenticated request checks
    // this against the user's activeSessionId, issuing a new one here means
    // any session opened from another browser/device is immediately logged
    // out — one active session per user (concurrent-login restriction).
    const sid = newSessionId();
    user.activeSessionId = sid;
    // Bump the login counter — used to defer the Quick-PIN prompt until
    // the second login so first-time users aren't overwhelmed (password
    // change + tour are enough on day one).
    user.loginCount = ((user as any).loginCount || 0) + 1;
    await user.save();

    // Every provisioned account can sign in: leads + admin get full
    // management, contributors get a read-only view of their
    // team's board plus the ability to update the status / subtasks /
    // comments of tasks assigned to them. Accounts with an unknown role
    // are still refused.
    const KNOWN_ROLES = ['contributor', 'employee', 'pm', 'lead', 'admin'];
    if (!KNOWN_ROLES.includes(String(user.role))) {
      return NextResponse.json(
        { error: 'Your account is not active. Contact your administrator.' },
        { status: 403 },
      );
    }

    const token = signToken({
      sub: String(user._id),
      email: user.email,
      role: user.role === 'pm' ? 'lead' : user.role === 'employee' ? 'contributor' : (user.role as any),
      name: user.name,
      title: user.title || '',
      mustChangePassword: !!user.mustChangePassword,
      sv: user.sessionVersion ?? 0,
      sid,
    });

    await logOperation({
      action: 'auth.login',
      category: 'auth',
      actor: { id: String(user._id), name: user.name },
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.name,
      summary: securityKeyOk ? 'Signed in with recovery key' : 'Signed in',
    });

    const res = NextResponse.json({ token, user: u(user), hasPin: !!(user as any).pinHash });
    setAuthCookie(res, token);
    // Mark this device as trusted so the user can re-enter with a Quick PIN
    // next time (a full password login is what earns that trust).
    setDeviceCookie(res, String(user._id));
    return res;
  } catch (e) {
    return handleError(e);
  }
}
