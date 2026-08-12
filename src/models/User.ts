import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    // Short login handle, à la Instagram. Required + unique for new accounts;
    // `sparse` allows the column to be added to a database that already has
    // documents without a username, so we can backfill at our leisure
    // (scripts/backfill-usernames.ts). Stored lower-cased and validated by
    // Zod in /lib/validations.ts so it stays case-insensitive and ASCII-safe.
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    // Product roles are admin, lead, and contributor.
    // 'pm'/'employee' are legacy aliases accepted only until migrated.
    role: {
      type: String,
      enum: ['contributor', 'lead', 'admin', 'pm', 'employee', 'master_admin'],
      default: 'contributor',
    },

    // ── Identity fields ─────────────────────────────────────────────────
    // These can be set manually or overwritten by LDAP sync.
    // When ldapSyncedAt is present, the UI shows them as read-only.
    title: { type: String, default: '' },
    department: { type: String, default: '' },
    employeeId: { type: String, default: '' }, // e.g. sAMAccountName / employeeID from AD
    phone: { type: String, default: '' },
    location: { type: String, default: '' }, // office / site
    managerName: { type: String, default: '' }, // display name of manager from AD
    // Soft organisational grouping — used by directory pickers to group and
    // filter people (e.g. by business unit, plant, or company within the
    // group). Free-text so admins can drop people into any grouping they
    // already use in HRIS / AD without us prescribing a taxonomy. NOT a
    // tenant boundary — every user remains visible across the workspace;
    // this is purely a presentation/filter dimension for scaling pickers.
    organisation: { type: String, default: '' },

    // ── LDAP sync metadata ──────────────────────────────────────────────
    // Populated by the future LDAP sync job.
    // LDAP attribute → field mapping (Active Directory / OpenLDAP):
    //   displayName / cn        → name
    //   mail                    → email
    //   title                   → title
    //   department              → department
    //   employeeID / sAMAccountName → employeeId
    //   telephoneNumber         → phone
    //   l (locality)            → location
    //   manager (DN → resolved) → managerName
    //   distinguishedName       → ldapDn
    ldapDn: { type: String, default: '' }, // Distinguished Name
    ldapSyncedAt: { type: Date, default: null }, // null = not yet synced
    ldapAttributes: { type: Schema.Types.Mixed, default: null }, // raw AD attrs for debugging

    // ── First-login flag ────────────────────────────────────────────────
    mustChangePassword: { type: Boolean, default: false },

    // ── Admin recovery key ──────────────────────────────────────────────
    // bcrypt hash of a self-service recovery key the admin generates from
    // their profile. When the admin forgets their password they can type
    // this key into the password field on the login form and get straight
    // in (see src/app/api/auth/login/route.ts). Plaintext is shown exactly
    // once at generation time and never stored. Only meaningful on admins.
    securityKeyHash: { type: String, default: null },

    // ── Session control ─────────────────────────────────────────────────
    // sessionVersion is embedded in every JWT we sign. Bumping it instantly
    // invalidates every token previously issued for this user — used to
    // force-logout a user after an admin edits/locks/resets their account
    // (21 CFR Part 11 §11.10(d): access control stays under our control).
    sessionVersion: { type: Number, default: 0 },
    // activeSessionId is the id of the most recent successful login. A newer
    // login overwrites it, so any older token (carrying a different sid) is
    // rejected on its next request — enforcing one active session per user.
    activeSessionId: { type: String, default: null },

    // ── Brute-force protection ──────────────────────────────────────────
    // After MAX_FAILED_LOGINS consecutive wrong passwords the account is
    // locked until an admin/lead clears it (via /api/users/[id]/unlock
    // or by resetting the password). lockedAt is the timestamp the lock
    // was applied — surfaced on the People page so admin can see *why*
    // a lead can't sign in.
    failedLoginAttempts: { type: Number, default: 0 },
    lockedAt: { type: Date, default: null },

    // ── Account lifecycle (soft deactivation) ───────────────────────────
    // A deactivated account is the *professional* alternative to a hard
    // delete: the record is preserved (tasks stay attributable — ALCOA+
    // "Attributable" & "Enduring"), the person can no longer sign in, and
    // every transition is written to the audit trail with who/when/why
    // (21 CFR Part 11 §11.10(d) + §11.10(e)). Reactivating an account also
    // clears any brute-force lock, so "make active again" is the single
    // gesture an admin needs. Defaults to active so existing rows (which
    // predate this field) are treated as active without a migration.
    active: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: String, default: '' }, // actor display name
    deactivationReason: { type: String, default: '' }, // why, for the record
    reactivatedAt: { type: Date, default: null },

    // ── Quick PIN (device-bound convenience unlock) ─────────────────────
    // A 4-digit PIN that re-unlocks the app on a device that has ALREADY
    // completed a full username+password sign-in (a trusted-device cookie).
    // It is NEVER a substitute for the password on a new device — the first
    // sign-in on any device always requires the full credential, preserving
    // 21 CFR Part 11 §11.10(d) access control. The PIN is bcrypt-hashed,
    // never stored in clear, and locks after too many wrong tries.
    pinHash: { type: String, default: null },
    pinSetAt: { type: Date, default: null },
    pinFailedAttempts: { type: Number, default: 0 },

    // ── Onboarding tour ─────────────────────────────────────────────────
    // Defaults to true so existing users don't see the tour on first
    // login after this change. The register + invite paths explicitly
    // set this to false so a fresh lead sees the tour exactly once.
    hasSeenTour: { type: Boolean, default: true },

    // ── Login history (for deferring blocking onboarding prompts) ───────
    // loginCount lets us defer the Quick-PIN setup modal until the user's
    // SECOND login — first time around they get the password-change flow
    // and the tour; PIN is offered the next time they sign in, when the
    // workflow is already familiar. Counts successful full logins only
    // (PIN unlocks don't increment, by design).
    loginCount: { type: Number, default: 0 },
    // pinPromptDismissedAt: the user dismissed the Set-PIN prompt and we
    // should not block them with it again for some time. We re-offer it
    // gently from a settings nudge instead.
    pinPromptDismissedAt: { type: Date, default: null },

    // ── Notification preferences ────────────────────────────────────────
    notifTaskAssigned: { type: Boolean, default: true },
    notifTaskDueSoon: { type: Boolean, default: true }, // 24h before due
    notifTaskOverdue: { type: Boolean, default: true },
    notifProjectUpdate: { type: Boolean, default: false },

    // ── Daily task-due email digest ─────────────────────────────────────
    // notifyEmail is a REAL, deliverable address. It is distinct from the login
    // `email` above, which for admin-created contributors is a synthetic
    // `username@pragati.local` placeholder (they sign in by username — see
    // /api/users). The admin collects notifyEmail when the account is created
    // and can edit it from People → Edit; users do not self-set it, so the
    // address of record stays admin-controlled and attributable
    // (21 CFR Part 11 §11.10(d)). Contact metadata only — never part of a GxP
    // record or the deterministic triage path.
    notifyEmail: { type: String, default: '', lowercase: true, trim: true },
    // Opt-in switch for the 08:30 (IST) "tasks due today" email. Defaults OFF
    // so no one is emailed until they enable it in their profile — a personal
    // notification preference (like soundDropEnabled), not a controlled record.
    notifDailyDigest: { type: Boolean, default: false },
    // Hour of day (0–23, workspace timezone) the user wants their digest.
    // null = use the workspace default (DIGEST_DEFAULT_HOUR, 8 AM). Honoured by
    // hourly scheduled runs; minute granularity is intentionally not offered
    // (a daily summary doesn't need it, and it keeps the trigger cadence sane).
    digestHour: { type: Number, default: null, min: 0, max: 23 },
    // Minute within the chosen hour (0–59). Scheduled runners may tick more
    // frequently than once an hour; idempotency still guarantees one send/day.
    digestMinute: { type: Number, default: 0, min: 0, max: 59 },
    // Idempotency stamp: the local-day key (YYYY-MM-DD) of the user's last
    // successful digest. Guarantees at-most-once delivery per day regardless of
    // how many triggers fire. Cleared implicitly by the date rolling over.
    lastDigestSentOn: { type: String, default: '' },
    lastBriefPushSentOn: { type: String, default: '' },
    // Capability token for the personal read-only calendar feed
    // (/api/calendar/<token>/agenda.ics). Calendar clients can't send auth
    // cookies, so the URL itself is the secret — random, per-user, rotatable
    // from Settings, revoked by setting null. Grants ONE thing: this user's
    // own open-task agenda. Never grants login.
    icsToken: { type: String, default: null },

    // ── Monogram avatar ─────────────────────────────────────────────────
    // A user-customised letter-on-a-coloured-circle avatar (Google-style),
    // persisted server-side so it propagates everywhere the user's Avatar
    // is rendered — sidebar, account menu, mention chips, comments, lead
    // contributor list, etc. All fields are optional; the Avatar component
    // falls back to the name-derived initials + hash colour when unset.
    avatarLetter: { type: String, default: '' }, // 1–2 chars, uppercase
    avatarBg: { type: String, default: '' }, // CSS colour (hex)
    avatarFont: { type: Number, default: 0 }, // 0..AVATAR_FONTS.length-1
    // Optional uploaded photo — a CLIENT-COMPRESSED data URL (192px square
    // JPEG, ≤ ~60KB enforced on both sides) so profile photos never become a
    // storage problem. Empty string = no photo (monogram renders instead).
    avatarImage: { type: String, default: '' },

    // Audible drop-cue preference. Defaults to true (ships with sound).
    // Synthesised in-browser via Web Audio, so there's no asset to deliver.
    soundDropEnabled: { type: Boolean, default: true },

    // ── Social / public profile ─────────────────────────────────────────
    // Legacy single GitHub field — superseded by `links` below, but kept so
    // existing rows keep rendering. The public profile merges it into the link
    // list when present and not already represented.
    githubUrl: { type: String, default: '' },
    // Generic outbound links the member chooses to show on their public
    // profile — any site, not just GitHub. Each is a URL with an optional
    // label; when the label is empty the profile derives a pretty one (and a
    // brand icon) from the host. Capped small so the profile stays clean.
    links: {
      type: [{ url: { type: String, default: '' }, label: { type: String, default: '' } }],
      default: [],
    },
    // IDs of users this person follows (mutual awareness within workspace).
    following: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // ── Password & PIN reuse prevention ────────────────────────────────
    // Stores the 3 most recently used password bcrypt hashes so the user
    // cannot immediately recycle an old credential (21 CFR Part 11 §11.10(d)).
    // New hash is prepended; array is truncated at 3 entries on each change.
    passwordHistory: { type: [String], default: [] },
    // Same guard for Quick-PIN hashes.
    pinHistory: { type: [String], default: [] },
  },
  { timestamps: true },
);

// Indexes for the cross-user listings (People directory, Teams, admin views)
// that filter on role or active state. Without these, those queries collection-
// scan every user — fine at a handful of rows, but a measurable stall at the
// ~200-user scale this workspace runs at. `email`/`username` already carry
// unique indexes from their field definitions above.
UserSchema.index({ role: 1 });
UserSchema.index({ active: 1 });
// Picker queries sort by name and frequently filter by role/active. A
// compound index on those plus the sort key lets Mongo skip a separate sort
// stage — the difference shows up most on the first open of an assignee
// dropdown (the very thing reported as slow), where there's no cached result
// to fall back on.
UserSchema.index({ active: 1, role: 1, name: 1 });
UserSchema.index({ name: 1 });
UserSchema.index({ avatarBg: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) || mongoose.model<UserDoc>('User', UserSchema);
