import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { requireUser, requireRole } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';
import { UsernameSchema } from '@/lib/validations';
import { logOperation } from '@/lib/audit';
import { bustPeopleDirectoryCache } from '@/lib/peopleDirectory';
import { issueInitialPassword } from '@/lib/defaultPassword';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const sp = req.nextUrl.searchParams;

    // Optional ?teamId=... narrows the listing to members + lead of that
    // single team. Used by the project task-assignee dropdown so leads
    // only see people who actually belong to the project's team.
    const teamId = sp.get('teamId');
    // Deactivated accounts are excluded everywhere by default — they must
    // not appear in assignee pickers or team rosters. Only an admin can ask
    // for them (the People page does, to show the deactivated record).
    const includeInactive = sp.get('includeInactive') === '1' && String(user.role) === 'admin';
    let filter: any = includeInactive ? {} : { active: { $ne: false } };
    if (teamId) {
      const team = await Team.findById(teamId).select('leadId memberIds').lean();
      if (team) {
        const ids = [team.leadId, ...(team.memberIds || [])].filter(Boolean);
        filter = { ...filter, _id: { $in: ids } };
      } else {
        return NextResponse.json([]);
      }
    }

    // ── Directory features (additive — keep the legacy unparam'd shape) ───
    // Free-text typeahead across the fields a picker actually shows. Anchored
    // with ^ on `username` so a 1-char "a" doesn't hit every user containing
    // an 'a'; for `name` / employeeId we allow substring matches (Mongoose
    // escapes the regex via the explicit RegExp constructor).
    const q = (sp.get('q') || sp.get('search') || '').trim();
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      filter = {
        ...filter,
        $or: [
          { name: rx },
          { username: rx },
          { email: rx },
          { employeeId: rx },
          { title: rx },
          { department: rx },
          { organisation: rx },
          { location: rx },
        ],
      };
    }
    // Hard facet filters — let a picker say "show me only people in
    // Operations / Pune / role=lead", etc. Empty value = no filter.
    const role = sp.get('role');
    if (role) filter = { ...filter, role };
    const department = sp.get('department');
    if (department) filter = { ...filter, department };
    const organisation = sp.get('organisation');
    if (organisation) filter = { ...filter, organisation };
    const location = sp.get('location');
    if (location) filter = { ...filter, location };

    // Pagination — opt-in via ?limit. Without it we return the full list to
    // keep every existing caller (server-rendered teams page, etc.) working
    // unchanged. With ?limit, the response wraps results in a `{ items,
    // total, limit, offset, facets? }` envelope.
    const limitRaw = sp.get('limit');
    const wantsPage = limitRaw !== null;
    const limit = wantsPage ? Math.max(1, Math.min(200, parseInt(limitRaw!, 10) || 50)) : 0;
    const offset = wantsPage ? Math.max(0, parseInt(sp.get('offset') || '0', 10) || 0) : 0;
    const wantsFacets = sp.get('facets') === '1';

    if (!wantsPage) {
      // Full-list path for existing callers (pickers, server-rendered teams
      // page). Hard backstop so a workspace that grows to tens of thousands of
      // users can never load the entire collection into one response — invisible
      // at normal scale; a directory that large should use the ?limit envelope.
      const list = await User.find(filter).sort({ name: 1 }).limit(5000).lean();
      return NextResponse.json(list.map(u));
    }

    const [items, total, facets] = await Promise.all([
      User.find(filter)
        .select(
          'name username email notifyEmail role title department organisation location avatarLetter avatarBg avatarFont active',
        )
        .sort({ name: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
      // Distinct values for the picker's group-by/filter rail. Scoped to the
      // current filter (minus the field itself) so counts adapt as the user
      // refines. Cheap on small workspaces; if it ever becomes a hot path we
      // can replace with an aggregation $facet pipeline.
      wantsFacets
        ? (async () => {
            const base = { ...filter };
            delete base.organisation;
            delete base.department;
            delete base.location;
            delete base.role;
            const [orgs, depts, locs, roles] = await Promise.all([
              User.distinct('organisation', base),
              User.distinct('department', base),
              User.distinct('location', base),
              User.distinct('role', base),
            ]);
            return {
              organisation: orgs.filter(Boolean).sort(),
              department: depts.filter(Boolean).sort(),
              location: locs.filter(Boolean).sort(),
              role: roles.filter(Boolean).sort(),
            };
          })()
        : null,
    ]);

    return NextResponse.json({
      items: items.map(u),
      total,
      limit,
      offset,
      ...(facets ? { facets } : {}),
    });
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  // Display name; auto-derived from the username on the client but always
  // sent so the password's first-name component is predictable.
  name: z.string().min(1).max(120),
  // Corporate login handle (the part before @ in their work email).
  username: UsernameSchema,
  // Company employee ID (identity / roster). Not used for password derivation
  // unless PRAGATI_PREDICTABLE_DEFAULT_PASSWORD=1 is set.
  employeeId: z.string().trim().min(1).max(40),
  // Real, deliverable work email — REQUIRED at creation. The login identity
  // stays `username@pragati.local` (contributors sign in by username); this
  // address is used only for notifications such as the daily task-due digest.
  notifyEmail: z.string().trim().toLowerCase().email('Enter a valid email address').max(200),
  // role is intentionally excluded — all new accounts are contributors.
  // Promotion to Lead requires a separate explicit PATCH action.
  // No job title — a person is shown by their role, nothing else.
});

export async function POST(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, CreateBody);

    const username = body.username; // already lowercased + trimmed
    const employeeId = body.employeeId.trim();
    // Internal placeholder address so legacy code referencing user.email
    // keeps working; contributors sign in with their username, never email.
    const email = `${username}@pragati.local`;

    const conflict = await User.findOne({ $or: [{ email }, { username }] }, '_id username').lean();
    if (conflict) {
      return NextResponse.json({ error: 'Username already in use' }, { status: 409 });
    }

    // Random temp by default (shown once). Predictable scheme only with env latch.
    const issued = issueInitialPassword(body.name, employeeId);
    const user = await User.create({
      email,
      username,
      employeeId,
      name: body.name,
      notifyEmail: body.notifyEmail,
      passwordHash: bcrypt.hashSync(issued.password, 10),
      role: 'contributor',
      // Always force a personal password on first login (server-enforced).
      mustChangePassword: true,
      // Admin-provisioned accounts must still get the guided tour on first
      // login — the model default is `true` (for migration safety of existing
      // users), so new accounts have to opt in explicitly, exactly like the
      // self-register and bootstrap paths do.
      hasSeenTour: false,
    });
    await logOperation({
      action: 'user.create',
      category: 'user',
      actor: caller,
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: body.name,
      summary: `Created contributor ${body.name}`,
    });

    void bustPeopleDirectoryCache();
    // Return the one-time temp password so the admin can hand it off. Never
    // stored in plaintext; never logged. Client shows it once then discards.
    return NextResponse.json({
      user: u(user),
      tempPassword: issued.password,
      isDefault: issued.isDefault,
    });
  } catch (e) {
    return handleError(e);
  }
}
