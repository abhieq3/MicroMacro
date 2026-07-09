/**
 * Initial / reset credentials for provisioned accounts.
 *
 * First principle: a password must not be computable from public org data
 * (name + employee ID). Predictable defaults turn every directory leak into
 * a login attempt surface — even with lockout, that is unacceptable for a
 * workspace that holds delivery and quality records.
 *
 * Default: random temporary password (`Pragati-…`), shown once to the admin.
 * Always pair with `mustChangePassword: true` so the user picks their own
 * on first sign-in (server-enforced in `requireUser`).
 *
 * Escape hatch for air-gapped / verbal-only rollouts that truly cannot show
 * a one-time secret: set `PRAGATI_PREDICTABLE_DEFAULT_PASSWORD=1`. That
 * restores the legacy `FirstName@employeeId` scheme. Prefer the random path.
 */

import crypto from 'crypto';

/** Env latch for the legacy FirstName@employeeId convention. Off by default. */
export function predictableDefaultPasswordsEnabled(): boolean {
  const v = (process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Legacy convention: `FirstName@employeeId` (e.g. "Abhi Patel" + "29218" →
 * "Abhi@29218"). Only used when the predictable-password latch is on AND an
 * employee ID is present. Prefer `generateTempPassword` / `issueInitialPassword`.
 */
export function defaultPassword(name: string, employeeId: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'User';
  return `${first}@${(employeeId || '').trim()}`;
}

/**
 * Whether a meaningful legacy default password can be built. Without an
 * employee ID the default would collapse to "First@" — too weak to hand out.
 * Also false when the predictable latch is off (random temps only).
 */
export function canUseDefaultPassword(employeeId: string | null | undefined): boolean {
  if (!predictableDefaultPasswordsEnabled()) return false;
  return !!(employeeId && employeeId.trim());
}

/**
 * Cryptographically random temporary password. Ambiguous glyphs (0/O, 1/l/I)
 * are excluded so verbal / chat handoff stays unambiguous.
 */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const rand = crypto.randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[rand[i]! % chars.length];
  return `Pragati-${s}`;
}

export type IssuedPassword = {
  /** Plaintext to show the admin once — never store or log. */
  password: string;
  /** True only when the legacy FirstName@employeeId scheme was used. */
  isDefault: boolean;
  scheme: 'random' | 'predictable';
};

/**
 * Single source of truth for create + reset + bulk import.
 * Random by default; predictable only with the env latch + employee ID.
 */
export function issueInitialPassword(name: string, employeeId?: string | null): IssuedPassword {
  if (canUseDefaultPassword(employeeId)) {
    return {
      password: defaultPassword(name, employeeId!.trim()),
      isDefault: true,
      scheme: 'predictable',
    };
  }
  return {
    password: generateTempPassword(),
    isDefault: false,
    scheme: 'random',
  };
}
