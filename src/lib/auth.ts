import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from './db';
import { User } from '@/models/User';

// Product roles:
//   'admin'    — workspace owner / administrator.
//   'lead'     — team lead.
//   'contributor' — individual contributor.
// Legacy rows may still contain 'pm' or 'employee'; normalize at every boundary.
export type Role = 'contributor' | 'lead' | 'admin' | 'master_admin';
// Legacy stored values that should be coerced on read (kept for backward
// compatibility with documents written before the role enum was tightened).
// `master_admin` is the multi-tenant superuser — dormant until the runtime
// flag PRAGATI_MULTI_TENANT=true is set, but recognised everywhere so that
// promoting a user to it doesn't fall back to "contributor".
export type StoredRole = Role | 'pm' | 'employee';

export interface JwtPayload {
  sub: string;
  email: string;
  role: StoredRole;
  name: string;
  title?: string;
  mustChangePassword?: boolean;
  // sv = the user's sessionVersion at sign time. sid = this login's session id.
  // Both are optional so JWTs minted before session control shipped still
  // verify (they simply skip the corresponding check — see validateSession).
  sv?: number;
  sid?: string;
  // Runtime-only (never signed): whether the user has a Quick PIN configured.
  // Populated by validateSession from the DB so the UI can enforce the
  // mandatory-PIN-setup gate without a second round-trip.
  hasPin?: boolean;
  // Runtime-only: full logins completed. Quick-PIN is offered at login ≥ 3
  // so first visit is never password + PIN + tour stacked.
  loginCount?: number;
  // Runtime-only: ISO of when the user dismissed the Quick-PIN prompt, if
  // they chose to set it up later. When present, suppress the modal.
  pinPromptDismissedAt?: string | null;
}

/** A fresh, unguessable session identifier for one login. */
export function newSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function normalizeRole(role?: string | null): Role {
  if (role === 'master_admin') return 'master_admin';
  if (role === 'admin') return 'admin';
  if (role === 'lead' || role === 'pm') return 'lead';
  return 'contributor';
}

// True for team lead/admin roles. Use `isAdmin()` when you specifically want
// to surface admin-only affordances. Master-admin is implicitly above lead.
export function isLead(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'lead' || r === 'admin' || r === 'master_admin';
}

// The 'admin' role is the workspace owner with full visibility across every
// team and project. Master-admin is a strict superset (also includes tenant
// provisioning), so it satisfies admin checks everywhere admin is required.
export function isAdmin(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'master_admin';
}

/** Master admin — the platform operator. Dormant in single-tenant mode but
 *  the role check is wired so future multi-tenant features can gate on it. */
export function isMasterAdmin(role?: string | null): boolean {
  return normalizeRole(role) === 'master_admin';
}

// Any role allowed to mutate shared records (create / edit / delete
// projects, tasks, teams, users). Admin is implicitly included so the
// product owner can use their account for everything.
export function canMutate(role?: string | null): boolean {
  return isAdmin(role) || isLead(role);
}

export function isContributor(role?: string | null): boolean {
  return normalizeRole(role) === 'contributor';
}

// Workspace owner's email — hard-coded so the auto-promote works even when
// the ADMIN_EMAIL env var isn't set on the hosting environment. The env var
// still takes precedence if both are present, but this constant is the
// guaranteed-to-work fallback for the founder account.
// The configured admin email (lower-cased). When this address logs in or
// registers we promote them to role:'admin' automatically.
// MUST be set via ADMIN_EMAIL env var — no hardcoded fallback so no personal
// email is ever committed to the repository.
export function configuredAdminEmail(): string | null {
  const env = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return env || null;
}

// JWT_SECRET is REQUIRED in production. The dev fallback below is only used
// when NODE_ENV !== 'production' AND the env var is unset — anything else
// (preview deploys included) refuses to sign or verify a token. We check at
// first-use rather than at module load so `next build` can still produce an
// artifact on a CI box that doesn't have the secret available.
const DEV_SECRET_FALLBACK = 'dev-secret-change-me';

function getSecret(): string {
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 16) return env;
  if (process.env.NODE_ENV !== 'production') return DEV_SECRET_FALLBACK;
  throw new Error(
    '[SECURITY] JWT_SECRET is not set (or shorter than 16 chars) in production. ' +
      'Refusing to sign/verify auth tokens with an insecure value.',
  );
}

const COOKIE = 'pragati_token';
// The trusted-device cookie. Set ONLY after a full password sign-in; its
// presence (and validity) is what permits a Quick-PIN unlock. It deliberately
// outlives the session token so a user can PIN back in the next working day.
const DEVICE_COOKIE = 'pragati_device';
const DEVICE_TRUST_DAYS = 30;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}

/* ── Trusted-device token ──────────────────────────────────────────────────
   A signed, httpOnly cookie that marks THIS browser as one that has already
   completed a full password login for `sub`. It carries no privileges on its
   own — it only gates whether the PIN-unlock endpoint will even look at a PIN.
   `typ:'device'` keeps it from ever being mistaken for a session token. */
interface DeviceToken {
  sub: string;
  typ: 'device';
  iat?: number;
  exp?: number;
}

export function signDeviceToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'device' }, getSecret(), { expiresIn: `${DEVICE_TRUST_DAYS}d` });
}

export function verifyDeviceToken(token: string): DeviceToken | null {
  try {
    const d = jwt.verify(token, getSecret()) as DeviceToken;
    return d.typ === 'device' ? d : null;
  } catch {
    return null;
  }
}

export function setDeviceCookie(response: NextResponse, userId: string) {
  response.cookies.set(DEVICE_COOKIE, signDeviceToken(userId), {
    ...COOKIE_BASE,
    maxAge: 60 * 60 * 24 * DEVICE_TRUST_DAYS,
  });
}

export function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(DEVICE_COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}

export function getDeviceUserId(req: NextRequest): string | null {
  const tok = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!tok) return null;
  return verifyDeviceToken(tok)?.sub || null;
}

const COOKIE_BASE = {
  httpOnly: true,
  // 'secure' is mandatory in production: the cookie carries the session JWT
  // and would otherwise be sent over plain HTTP if a misconfigured proxy
  // ever served the app without TLS.
  secure: process.env.NODE_ENV === 'production',
  // 'lax' lets top-level navigations carry the cookie (so signing in via a
  // link still works) while blocking cross-site POST/fetch with credentials.
  // That's enough CSRF protection for cookie-only auth — every state-changing
  // route is POST/PATCH/DELETE, which sameSite=lax refuses to attach the
  // cookie to from a foreign origin.
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, {
    ...COOKIE_BASE,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const fromCookie = req.cookies.get(COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const h = req.headers.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/* ── Session micro-cache (scaling lever, default OFF) ─────────────────────
   validateSession is the hottest DB path in the app: one User read per
   authenticated request. At small scale that's free; at large scale it is
   THE read amplifier. SESSION_CACHE_TTL_MS (capped at 60s) enables a small
   per-instance cache of the session-relevant user fields.

   Correctness rules, in order of importance:
     • A cached doc may only ever produce a SUCCESSFUL validation. Any
       failure against cached data (revoked sv, superseded sid, deactivated)
       falls through to a fresh DB read before the request is rejected — so
       the cache can never falsely log someone out (e.g. right after a fresh
       login rotated their activeSessionId).
     • The inverse staleness is the documented tradeoff: a force-logout /
       deactivation can take up to TTL extra to bite on instances holding a
       warm entry. bustSessionCache() removes the entry on the instance that
       performed the mutation, so the common single-region case is instant.
   With the env var unset, behaviour is byte-identical to the strict
   read-every-request path ("denied on its very next request"). */
const SESSION_FIELDS =
  'role mustChangePassword sessionVersion activeSessionId name title email pinHash active loginCount pinPromptDismissedAt';
const sessionCache: Map<string, { doc: any; at: number }> =
  (global as any).__pragatiSessionCache ?? new Map();
(global as any).__pragatiSessionCache = sessionCache;

function sessionCacheTtlMs(): number {
  const v = Number(process.env.SESSION_CACHE_TTL_MS || 0);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 60_000) : 0;
}

/** Drop a user's cached session doc so a mutation made on THIS instance
 *  (force-logout, role change, deactivation) takes effect immediately here. */
export function bustSessionCache(userId: string) {
  sessionCache.delete(String(userId));
}

/** Validate the token payload against one user doc. Returns the enriched
 *  payload, 'deactivated', or null (revoked / superseded / missing). */
function checkSessionAgainst(payload: JwtPayload, u: any): JwtPayload | 'deactivated' | null {
  if (!u) return null;
  if (u.active === false) return 'deactivated';
  if (typeof payload.sv === 'number' && (u.sessionVersion ?? 0) !== payload.sv) return null;
  if (payload.sid && u.activeSessionId && u.activeSessionId !== payload.sid) return null;
  return {
    ...payload,
    role: normalizeRole(u.role),
    name: u.name ?? payload.name,
    title: u.title ?? payload.title,
    email: u.email ?? payload.email,
    mustChangePassword: !!u.mustChangePassword,
    hasPin: !!u.pinHash,
    loginCount: typeof u.loginCount === 'number' ? u.loginCount : 0,
    pinPromptDismissedAt: u.pinPromptDismissedAt ? new Date(u.pinPromptDismissedAt).toISOString() : null,
  };
}

/**
 * Verify a JWT *and* confirm it still represents a live session by checking
 * the database. A token is rejected when:
 *   • the user no longer exists, OR
 *   • its `sv` is behind the user's current sessionVersion (force-logout, e.g.
 *     after an admin edits/locks the account), OR
 *   • its `sid` doesn't match the user's activeSessionId (a newer login
 *     elsewhere superseded this one — one active session per user).
 *
 * Tokens minted before session control shipped carry no `sv`/`sid`; the
 * corresponding check is skipped for them so we don't mass-logout on deploy.
 * The returned payload is enriched with the fresh role + mustChangePassword
 * so a role change or forced reset takes effect without re-login.
 */
export async function validateSession(payload: JwtPayload): Promise<JwtPayload | null> {
  const ttl = sessionCacheTtlMs();

  // Fast path: a fresh cached doc that VALIDATES is good enough. Anything
  // less (stale, missing, or failing) drops to the authoritative read.
  if (ttl > 0) {
    const hit = sessionCache.get(payload.sub);
    if (hit && Date.now() - hit.at < ttl) {
      const res = checkSessionAgainst(payload, hit.doc);
      if (res && res !== 'deactivated') return res;
    }
  }

  await connectDB();
  const user = await User.findById(payload.sub, SESSION_FIELDS).lean();
  if (ttl > 0 && user) {
    // Crude memory bound: a serverless instance serves one workspace's
    // actives; if the map somehow balloons, reset rather than grow forever.
    if (sessionCache.size > 10_000) sessionCache.clear();
    sessionCache.set(payload.sub, { doc: user, at: Date.now() });
  }

  const res = checkSessionAgainst(payload, user as any);
  // A deactivated account is denied on its very next authoritative read, so
  // an admin turning someone off mid-session logs them out everywhere
  // (defence-in-depth alongside the sessionVersion bump on deactivation).
  if (res === 'deactivated') throw new Error('ACCOUNT_DEACTIVATED');
  return res;
}

export async function getCurrentUserFromRequest(
  req: NextRequest,
): Promise<{ user: JwtPayload | null; deactivated?: boolean }> {
  const token = getTokenFromRequest(req);
  if (!token) return { user: null };
  try {
    const user = await validateSession(verifyToken(token));
    return { user };
  } catch (e: any) {
    if (e?.message === 'ACCOUNT_DEACTIVATED') return { user: null, deactivated: true };
    return { user: null };
  }
}

// Server component helper (uses cookies()). Returns the session payload, or
// null. The `deactivated` flag lets the layout distinguish a closed account
// from a plain missing/expired token so it can redirect with the right reason.
export async function getCurrentUserFromCookie(): Promise<JwtPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    return await validateSession(verifyToken(token));
  } catch {
    return null;
  }
}

export async function isDeactivatedFromCookie(): Promise<boolean> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return false;
  try {
    await validateSession(verifyToken(token));
    return false;
  } catch (e: any) {
    return e?.message === 'ACCOUNT_DEACTIVATED';
  }
}

/**
 * Paths a mustChangePassword user may still hit. Everything else is blocked
 * server-side so the force-password modal is not the only gate (a client
 * could otherwise call any API with the temp-password session cookie).
 */
const MUST_CHANGE_PASSWORD_ALLOWLIST = [
  '/api/auth/first-password',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/password',
];

function isAllowedDuringForcedPasswordChange(pathname: string): boolean {
  return MUST_CHANGE_PASSWORD_ALLOWLIST.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}

export async function requireUser(req: NextRequest) {
  const { user, deactivated } = await getCurrentUserFromRequest(req);
  if (!user) {
    return {
      error: NextResponse.json(
        {
          error: deactivated
            ? 'Your account has been deactivated. Please contact your administrator.'
            : 'Authentication required',
          deactivated: !!deactivated,
        },
        { status: 401 },
      ),
      user: null as unknown as JwtPayload,
    };
  }
  // Server-side forced password change — UI modal is convenience; this is law.
  if (user.mustChangePassword) {
    const path = req.nextUrl.pathname;
    if (!isAllowedDuringForcedPasswordChange(path)) {
      return {
        error: NextResponse.json(
          {
            error: 'You must set a new password before continuing.',
            code: 'MUST_CHANGE_PASSWORD',
          },
          { status: 403 },
        ),
        user: null as unknown as JwtPayload,
      };
    }
  }
  return { error: null, user };
}

export async function requireRole(req: NextRequest, ...roles: Role[]) {
  const { user, error } = await requireUser(req);
  if (error) return { user: null as unknown as JwtPayload, error };
  if (!roles.includes(normalizeRole(user.role))) {
    return {
      error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
      user,
    };
  }
  return { user, error: null };
}
