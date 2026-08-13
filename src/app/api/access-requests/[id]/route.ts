import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { AccessRequest } from '@/models/AccessRequest';
import { User } from '@/models/User';
import { requireUser, isAdmin } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';
import { AccessRequestReviewSchema, serializeAccessRequest } from '@/lib/accessRequest';
import { issueInitialPassword } from '@/lib/defaultPassword';
import { bustPeopleDirectoryCache } from '@/lib/peopleDirectory';
import { mailerConfigured, sendEmail } from '@/lib/mailer';
import { appBaseUrl } from '@/lib/digest';

export const runtime = 'nodejs';

// PATCH /api/access-requests/:id — dismiss closes the row. Approve creates
// the contributor (username + employee ID + one-time password) so a
// stranger's request actually converts — no second trip to People.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();

    const body = await readBody(req, AccessRequestReviewSchema);
    const row = await AccessRequest.findById(params.id);
    if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (row.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 });
    }

    if (body.status === 'dismissed') {
      row.status = 'dismissed';
      row.reviewedAt = new Date();
      row.reviewedBy = user.sub as any;
      row.reviewedByName = user.name || '';
      await row.save();

      await logOperation({
        action: 'access_request.dismiss',
        category: 'user',
        actor: user,
        targetType: 'user',
        targetId: String(row._id),
        targetLabel: row.email,
        summary: `Dismissed access request from ${row.name}`,
      });

      return NextResponse.json(serializeAccessRequest(row));
    }

    const username = body.username;
    const employeeId = body.employeeId.trim();
    const loginEmail = `${username}@pragati.local`;

    const conflict = await User.findOne(
      {
        $or: [
          { username },
          { email: loginEmail },
          { email: row.email },
          { notifyEmail: row.email },
        ],
      },
      '_id username notifyEmail email',
    ).lean();
    if (conflict) {
      const usernameTaken =
        conflict.username === username || conflict.email === loginEmail;
      return NextResponse.json(
        {
          error: usernameTaken
            ? 'Username already in use'
            : 'That email already has an account. They can sign in.',
        },
        { status: 409 },
      );
    }

    const issued = issueInitialPassword(row.name, employeeId);
    const created = await User.create({
      email: loginEmail,
      username,
      employeeId,
      name: row.name,
      notifyEmail: row.email,
      title: row.title || '',
      organisation: row.organisation || '',
      passwordHash: bcrypt.hashSync(issued.password, 10),
      role: 'contributor',
      mustChangePassword: true,
      hasSeenTour: false,
    });

    row.status = 'approved';
    row.reviewedAt = new Date();
    row.reviewedBy = user.sub as any;
    row.reviewedByName = user.name || '';
    row.provisionedUserId = created._id;
    row.provisionedUsername = username;
    await row.save();

    await logOperation({
      action: 'access_request.approve',
      category: 'user',
      actor: user,
      targetType: 'user',
      targetId: String(created._id),
      targetLabel: row.name,
      summary: `Approved ${row.name} — created @${username}`,
    });

    void bustPeopleDirectoryCache();

    if (mailerConfigured()) {
      const base = appBaseUrl();
      const signIn = base ? `${base}/login` : 'the sign-in page';
      void sendEmail({
        to: row.email,
        toName: row.name,
        subject: "You're in — Pragati",
        text: `${row.name}, your request was approved.\n\nSign in at ${signIn} with username ${username}. Your administrator has your temporary password — you'll set your own on first sign-in.`,
        html: `<p>${escapeHtml(row.name)}, your request was approved.</p><p>Sign in${
          base ? ` at <a href="${escapeHtml(base)}/login">${escapeHtml(base)}/login</a>` : ''
        } with username <strong>${escapeHtml(username)}</strong>.</p><p>Your administrator has your temporary password — you'll set your own on first sign-in.</p>`,
      });
    }

    return NextResponse.json({
      ...serializeAccessRequest(row),
      username,
      tempPassword: issued.password,
      isDefault: issued.isDefault,
    });
  } catch (e) {
    return handleError(e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
