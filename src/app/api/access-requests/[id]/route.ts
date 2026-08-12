import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { AccessRequest } from '@/models/AccessRequest';
import { requireUser, isAdmin } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';
import { AccessRequestReviewSchema, serializeAccessRequest } from '@/lib/accessRequest';

export const runtime = 'nodejs';

// PATCH /api/access-requests/:id — approve or dismiss. Provisioning the
// account still happens on People (username + employee ID). This just
// clears the inbox so a request isn't reviewed twice.
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

    row.status = body.status;
    row.reviewedAt = new Date();
    row.reviewedBy = user.sub as any;
    row.reviewedByName = user.name || '';
    await row.save();

    await logOperation({
      action: body.status === 'approved' ? 'access_request.approve' : 'access_request.dismiss',
      category: 'user',
      actor: user,
      targetType: 'user',
      targetId: String(row._id),
      targetLabel: row.email,
      summary:
        body.status === 'approved'
          ? `Approved access request from ${row.name}`
          : `Dismissed access request from ${row.name}`,
    });

    return NextResponse.json(serializeAccessRequest(row));
  } catch (e) {
    return handleError(e);
  }
}
