import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { logOperation } from '@/lib/audit';
import { issueInitialPassword } from '@/lib/defaultPassword';

export const runtime = 'nodejs';

// Admin-only password reset: the workspace admin resets another user's
// password and gets back the password to share verbally / over chat. No SMTP
// round-trip.
//
// Default: a random temporary password (shown once). Forced password change
// on next login. The legacy FirstName@employeeId scheme is opt-in only via
// PRAGATI_PREDICTABLE_DEFAULT_PASSWORD=1 — see lib/defaultPassword.ts.
//
// Flow:
//   1. Admin opens /people, clicks "Reset password" on a row.
//   2. UI calls POST /api/users/[id]/reset-password.
//   3. Endpoint returns { tempPassword, isDefault } and flips the target's
//      mustChangePassword flag.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'admin');
    if (error) return error;

    // Throttle per actor — even a logged-in lead shouldn't be able to
    // mass-rotate every account in the workspace within a minute.
    if (!rateLimit(`reset:${user!.sub}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many resets — wait a minute.' }, { status: 429 });
    }
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    await connectDB();

    const target = await User.findById(params.id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const issued = issueInitialPassword(target.name, target.employeeId);
    const tempPassword = issued.password;
    const isDefault = issued.isDefault;
    target.passwordHash = bcrypt.hashSync(tempPassword, 10);
    target.mustChangePassword = true;
    // Resetting the password implicitly lifts any brute-force lock —
    // otherwise the user would still be locked out with the new temp
    // password and admin would have to make two clicks.
    target.failedLoginAttempts = 0;
    target.lockedAt = null;
    // Force-logout every existing session for this user: a reset means the
    // old credential is dead, so any device still holding a token must be
    // kicked out immediately.
    target.sessionVersion = (target.sessionVersion ?? 0) + 1;
    target.activeSessionId = null;
    await target.save();

    await logOperation({
      action: 'user.reset',
      category: 'user',
      actor: user,
      targetType: 'user',
      targetId: params.id,
      targetLabel: target.name,
      summary: `Reset password for ${target.name}`,
    });

    return NextResponse.json({
      ok: true,
      tempPassword,
      isDefault,
      user: { id: String(target._id), email: target.email, name: target.name },
    });
  } catch (e) {
    return handleError(e);
  }
}
