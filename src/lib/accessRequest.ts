/**
 * Access requests — the public conversion path.
 *
 * The workspace is invite-only. A stranger cannot self-register. This module
 * is the contract for "ask to be let in": validate the form, decide what the
 * stranger sees (never a stack trace, never an enumeration leak beyond
 * "you already have an account"), and shape the row the admin reviews.
 *
 * Kept dependency-free of Next / Mongo so unit tests can pin the copy and
 * the schema without spinning up a database.
 */

import { z } from 'zod';

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

export const AccessRequestReviewSchema = z.object({
  status: z.enum(['approved', 'dismissed']),
});

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
