/**
 * Access requests — the public conversion path.
 *
 * The workspace is invite-only. A stranger cannot self-register. This module
 * is the contract for "ask to be let in": validate the form, decide what the
 * stranger sees (never a stack trace, never an enumeration leak beyond
 * "you already have an account"), and shape the row the admin reviews —
 * including the username + employee ID that turn approve into an account.
 *
 * Kept dependency-free of Next / Mongo so unit tests can pin the copy and
 * the schema without spinning up a database.
 */

import { z } from 'zod';
import { UsernameSchema } from '@/lib/validations';

export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'dismissed'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const AccessRequestCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a work email').max(200),
  organisation: z.string().trim().max(120, 'Organisation is too long').optional().default(''),
  title: z.string().trim().max(80, 'Title is too long').optional().default(''),
  note: z.string().trim().max(1000, 'Keep the note under 1,000 characters').optional().default(''),
  // Honeypot — hidden from humans. Bots that fill it get a fake success.
  website: z.string().max(200).optional().default(''),
});

export type AccessRequestCreate = z.infer<typeof AccessRequestCreateSchema>;

/**
 * Approve provisions the account (username + employee ID, same as People).
 * Dismiss only closes the inbox row.
 */
export const AccessRequestReviewSchema = z.union([
  z.object({
    status: z.literal('approved'),
    username: UsernameSchema,
    employeeId: z.string().trim().min(1, 'Employee ID is required').max(40),
  }),
  z.object({
    status: z.literal('dismissed'),
  }),
]);

/**
 * Login handle from a work email. `priya.sharma@co.com` → `priya.sharma`.
 * Always a valid UsernameSchema value so the approve form can prefill it.
 */
export function suggestedUsername(email: string): string {
  const local = (email.split('@')[0] || '').toLowerCase();
  let s = local.replace(/[^a-z0-9_.]/g, '').replace(/^\.+/, '').replace(/\.+$/, '');
  if (!/^[a-z]/.test(s)) s = `u${s}`;
  if (s.length > 30) s = s.slice(0, 30).replace(/\.+$/, '');
  if (!/[a-z0-9_]$/.test(s)) s = s.replace(/[^a-z0-9_]+$/, '');
  if (s.length < 3) s = `${s}xxx`.slice(0, 3);
  if (!/^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/.test(s)) return 'user';
  return s;
}

export function isHoneypot(website?: string | null): boolean {
  return !!(website && website.trim());
}

export type PublicSubmitKind = 'created' | 'already_pending' | 'already_member' | 'spam';

/** Calm next-step copy. Same shape for every public outcome so the form
 *  never has to special-case a status code to render success. */
export function publicSubmitResult(kind: PublicSubmitKind): {
  ok: true;
  kind: PublicSubmitKind;
  message: string;
} {
  switch (kind) {
    case 'already_member':
      return {
        ok: true,
        kind,
        message: 'You already have an account. Sign in with your username.',
      };
    case 'already_pending':
      return {
        ok: true,
        kind,
        message: 'We already have your request. An admin will review it.',
      };
    case 'spam':
    case 'created':
    default:
      return {
        ok: true,
        kind: kind === 'spam' ? 'created' : kind,
        message: "Request received. We'll review it and get back to you.",
      };
  }
}

export function serializeAccessRequest(doc: {
  _id: unknown;
  name: string;
  email: string;
  organisation?: string;
  title?: string;
  note?: string;
  // Mongoose infers the enum as `string`; narrow at the edge.
  status: AccessRequestStatus | string;
  createdAt?: Date;
  reviewedAt?: Date | null;
  reviewedByName?: string;
  provisionedUserId?: unknown;
  provisionedUsername?: string;
}): {
  id: string;
  name: string;
  email: string;
  organisation: string;
  title: string;
  note: string;
  status: AccessRequestStatus;
  createdAt: Date | undefined;
  reviewedAt: Date | null;
  reviewedByName: string;
  provisionedUserId: string | null;
  provisionedUsername: string;
} {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    organisation: doc.organisation || '',
    title: doc.title || '',
    note: doc.note || '',
    status: (ACCESS_REQUEST_STATUSES.includes(doc.status as AccessRequestStatus)
      ? doc.status
      : 'pending') as AccessRequestStatus,
    createdAt: doc.createdAt,
    reviewedAt: doc.reviewedAt || null,
    reviewedByName: doc.reviewedByName || '',
    provisionedUserId: doc.provisionedUserId ? String(doc.provisionedUserId) : null,
    provisionedUsername: doc.provisionedUsername || '',
  };
}

export function adminNotifyCopy(req: { name: string; email: string; organisation?: string }): {
  title: string;
  body: string;
} {
  const org = req.organisation?.trim();
  return {
    title: 'Access request',
    body: org
      ? `${req.name} (${req.email}) at ${org} asked for access.`
      : `${req.name} (${req.email}) asked for access.`,
  };
}
