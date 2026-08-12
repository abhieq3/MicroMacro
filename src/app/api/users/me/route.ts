import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { sendEmail, mailerConfigured } from '@/lib/mailer';
import { appBaseUrl } from '@/lib/digest';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';
import { bustPeopleDirectoryCache } from '@/lib/peopleDirectory';

export const runtime = 'nodejs';

// Fields the user can always edit themselves
const EditableBody = z.object({
  title: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  location: z.string().max(80).optional(),
  // Legacy single GitHub link — still accepted for backward compatibility.
  githubUrl: z
    .string()
    .max(200)
    .regex(/^(https:\/\/github\.com\/[A-Za-z0-9_.-]{1,39})?$/, 'Must be a valid GitHub profile URL or empty')
    .optional(),
  // Generic public links — any site, not just GitHub. Each must be an http(s)
  // URL (so no javascript:/data: redirects) with an optional short label. Capped
  // at six so the profile stays clean.
  links: z
    .array(
      z.object({
        url: z
          .string()
          .max(300)
          .regex(/^https?:\/\/[^\s]+$/i, 'Links must start with http:// or https://'),
        label: z.string().max(24).optional(),
      }),
    )
    .max(6)
    .optional(),
  // Notifications
  notifTaskAssigned: z.boolean().optional(),
  notifTaskDueSoon: z.boolean().optional(),
  notifTaskOverdue: z.boolean().optional(),
  notifProjectUpdate: z.boolean().optional(),
  // Opt-in for the daily 08:30 task-due email.
  notifDailyDigest: z.boolean().optional(),
  // Preferred digest hour (0–23, workspace tz). null clears it → default hour.
  digestHour: z.number().int().min(0).max(23).nullable().optional(),
  digestMinute: z.number().int().min(0).max(59).optional(),
  // The address where the daily digest is sent. Users can set this themselves
  // so they can choose a delivery address (work vs personal inbox) without
  // asking an admin. Admins can still override it via the People page.
  notifyEmail: z.string().email('Must be a valid email').max(254).or(z.literal('')).optional(),
  // Monogram avatar (validated tightly so an attacker can't squirrel
  // unbounded HTML/CSS into another user's view via the avatar fields).
  avatarLetter: z
    .string()
    .max(2)
    .regex(/^[A-Za-z0-9]{0,2}$/, 'Use 1–2 letters or digits')
    .optional(),
  avatarBg: z
    .string()
    .regex(/^(#[0-9A-Fa-f]{6}|)$/, 'Use a hex colour')
    .optional(),
  avatarFont: z.number().int().min(0).max(9).optional(),
  // Uploaded photo: client-compressed data URL. Hard server cap (~90KB of
  // base64 ≈ 65KB binary) + strict prefix so nothing but a small raster image
  // can ever be stored. '' clears the photo.
  avatarImage: z
    .string()
    .max(90_000)
    .regex(/^(data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|)$/, 'Invalid image')
    .optional(),
  // Drop sound on kanban/dashboard reorders.
  soundDropEnabled: z.boolean().optional(),
});

// Fields locked when LDAP is synced (name, department, employeeId, managerName)
const ManualIdentityBody = z.object({
  name: z.string().min(1).max(100).optional(),
  department: z.string().max(100).optional(),
  employeeId: z.string().max(50).optional(),
  managerName: z.string().max(100).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const user = await User.findById(jwt.sub).lean();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const user = await User.findById(jwt.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const editable = EditableBody.safeParse(body);
    if (!editable.success)
      return NextResponse.json({ error: editable.error.issues[0].message }, { status: 400 });

    // Apply always-editable fields
    const d = editable.data;
    if (d.title !== undefined) user.title = d.title as any;
    if (d.phone !== undefined) user.phone = d.phone as any;
    if (d.location !== undefined) user.location = d.location as any;
    if (d.githubUrl !== undefined) (user as any).githubUrl = d.githubUrl;
    if (d.links !== undefined)
      (user as any).links = d.links.map((l) => ({ url: l.url.trim(), label: (l.label || '').trim() }));
    if (d.notifTaskAssigned !== undefined) user.notifTaskAssigned = d.notifTaskAssigned as any;
    if (d.notifTaskDueSoon !== undefined) user.notifTaskDueSoon = d.notifTaskDueSoon as any;
    if (d.notifTaskOverdue !== undefined) user.notifTaskOverdue = d.notifTaskOverdue as any;
    if (d.notifProjectUpdate !== undefined) user.notifProjectUpdate = d.notifProjectUpdate as any;
    // Flipping the daily brief ON earns a welcome email — it doubles as the
    // delivery test (replaces the old "send me a test email" button): if this
    // lands, tomorrow's brief lands. Only on the false -> true transition.
    const digestJustEnabled = d.notifDailyDigest === true && !(user as any).notifDailyDigest;
    if (d.notifDailyDigest !== undefined) (user as any).notifDailyDigest = d.notifDailyDigest;
    if (d.digestHour !== undefined) (user as any).digestHour = d.digestHour;
    if (d.digestMinute !== undefined) (user as any).digestMinute = d.digestMinute;
    if (d.notifyEmail !== undefined) (user as any).notifyEmail = d.notifyEmail.trim();
    if (d.avatarLetter !== undefined) (user as any).avatarLetter = d.avatarLetter.toUpperCase();
    if (d.avatarBg !== undefined) (user as any).avatarBg = d.avatarBg;
    if (d.avatarFont !== undefined) (user as any).avatarFont = d.avatarFont;
    if (d.avatarImage !== undefined) (user as any).avatarImage = d.avatarImage;
    if (d.soundDropEnabled !== undefined) (user as any).soundDropEnabled = d.soundDropEnabled;

    // Apply identity fields only when NOT LDAP-synced
    if (!user.ldapSyncedAt) {
      const identity = ManualIdentityBody.safeParse(body);
      if (identity.success) {
        const id = identity.data;
        if (id.name !== undefined) user.name = id.name as any;
        if (id.department !== undefined) user.department = id.department as any;
        if (id.employeeId !== undefined) user.employeeId = id.employeeId as any;
        if (id.managerName !== undefined) user.managerName = id.managerName as any;
      }
    }

    await user.save();

    if (digestJustEnabled && mailerConfigured()) {
      const to = ((user as any).notifyEmail || '').trim() || (user as any).email || '';
      if (to && !to.endsWith('@pragati.local')) {
        const { renderWelcomeEmail, defaultDigestHour, digestTimeZone } = await import('@/lib/digest');
        const hour = (user as any).digestHour ?? defaultDigestHour();
        const h12 = hour % 12 === 0 ? 12 : hour % 12;
        const minute = (user as any).digestMinute ?? 0;
        const hourLabel = `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'} (${digestTimeZone()})`;
        const { subject, html, text } = renderWelcomeEmail({
          name: (user as any).name || '',
          role: (user as any).role,
          appUrl: appBaseUrl(),
          hourLabel,
        });
        // Fire-and-forget — a mail hiccup must never fail the settings save.
        void sendEmail({ to, toName: (user as any).name, subject, html, text }).catch(() => {});
      }
    }
    // Profile edits (name/title/department/avatar) change how this user is
    // rendered in the admin People directory, so drop its cached copy.
    void bustPeopleDirectoryCache();
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}
