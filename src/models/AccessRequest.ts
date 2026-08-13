import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';
import { ACCESS_REQUEST_STATUSES } from '@/lib/accessRequest';

/**
 * A stranger asking to be let into the workspace.
 *
 * Public registration is permanently off. This is the only inbound path a
 * person without an account has: they leave a name and a work email, an
 * admin approves with a username + employee ID, and the account is created
 * on that click — same shape as People, without the second form.
 *
 * Not a GxP record. Rows older than 180 days are dropped (TTL) so a public
 * form cannot grow an unbounded PII pile. The audit trail still records
 * approve / dismiss.
 */
const AccessRequestSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, index: true },
    organisation: { type: String, default: '' },
    title: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ACCESS_REQUEST_STATUSES as unknown as string[],
      default: 'pending',
      index: true,
    },
    // Stored for abuse review, never serialized to the client.
    ip: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    // Set only when approve provisions the contributor. Lets the inbox
    // show the login handle after the one-time password card is dismissed.
    provisionedUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    provisionedUsername: { type: String, default: '' },
  },
  { timestamps: true },
);

AccessRequestSchema.index({ email: 1, status: 1, createdAt: -1 });
AccessRequestSchema.index({ status: 1, createdAt: -1 });
// Drop stale requests after 180 days — operational inbox, not an audit log.
AccessRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export type AccessRequestDoc = InferSchemaType<typeof AccessRequestSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AccessRequest: Model<AccessRequestDoc> =
  (mongoose.models.AccessRequest as Model<AccessRequestDoc>) ||
  mongoose.model<AccessRequestDoc>('AccessRequest', AccessRequestSchema);
