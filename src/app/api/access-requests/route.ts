import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AccessRequest } from '@/models/AccessRequest';
import { User } from '@/models/User';
import { requireUser, isAdmin, configuredAdminEmail } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { notify } from '@/lib/notify';
import { mailerConfigured, sendEmail } from '@/lib/mailer';
import {
  AccessRequestCreateSchema,
  adminNotifyCopy,
  isHoneypot,
  publicSubmitResult,
  serializeAccessRequest,
} from '@/lib/accessRequest';

export const runtime = 'nodejs';

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
}

// POST /api/access-requests — public. A stranger asks to be let in.
// Always returns 200 with the same { ok, message } envelope so the form
// can stay calm. Abuse is rate-limited; bots that fill the honeypot get
// a fake success and nothing is stored.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    if (!rateLimit(`access-request:${ip}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests. Try again in an hour.' }, { status: 429 });
    }

    const body = await readBody(req, AccessRequestCreateSchema);
    if (isHoneypot(body.website)) {
      return NextResponse.json(publicSubmitResult('spam'));
    }

    await connectDB();

    const existingUser = await User.findOne({
      $or: [{ email: body.email }, { notifyEmail: body.email }],
    })
      .select('_id')
      .lean();
    if (existingUser) {
      return NextResponse.json(publicSubmitResult('already_member'));
    }

    const pending = await AccessRequest.findOne({
      email: body.email,
      status: 'pending',
    })
      .select('_id')
      .lean();
    if (pending) {
      return NextResponse.json(publicSubmitResult('already_pending'));
    }

    await AccessRequest.create({
      name: body.name,
      email: body.email,
      organisation: body.organisation || '',
      title: body.title || '',
      note: body.note || '',
      status: 'pending',
      ip,
    });

    const copy = adminNotifyCopy(body);
    const admins = await User.find(
      { role: { $in: ['admin', 'master_admin'] }, active: { $ne: false } },
      '_id',
    ).lean();
    for (const admin of admins) {
      void notify({
        userId: String(admin._id),
        type: 'general',
        title: copy.title,
        body: copy.body,
      });
    }

    const adminEmail = configuredAdminEmail();
    if (adminEmail && mailerConfigured()) {
      const noteLine = body.note?.trim() ? `\n\nNote:\n${body.note.trim()}` : '';
      const orgLine = body.organisation?.trim() ? ` at ${body.organisation.trim()}` : '';
      void sendEmail({
        to: adminEmail,
        subject: `Access request: ${body.name}`,
        text: `${body.name} <${body.email}>${orgLine} asked for access.${noteLine}\n\nReview it in Admin → Access requests.`,
        html: `<p><strong>${escapeHtml(body.name)}</strong> &lt;${escapeHtml(body.email)}&gt;${
          orgLine ? escapeHtml(orgLine) : ''
        } asked for access.</p>${
          body.note?.trim() ? `<p>${escapeHtml(body.note.trim())}</p>` : ''
        }<p>Review it in Admin → Access requests.</p>`,
      });
    }

    return NextResponse.json(publicSubmitResult('created'));
  } catch (e) {
    return handleError(e);
  }
}

// GET /api/access-requests — admin inbox.
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    await connectDB();

    const rows = await AccessRequest.find({}).sort({ status: 1, createdAt: -1 }).limit(80).lean();
    return NextResponse.json({
      requests: rows.map(serializeAccessRequest),
      pending: rows.filter((r) => r.status === 'pending').length,
    });
  } catch (e) {
    return handleError(e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
