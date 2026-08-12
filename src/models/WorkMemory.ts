import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Incremental work memory — one document per (scope, kind, subject).
 *
 * Updated on every real completion so the next project inherits what this
 * team actually did, not a generic prior. Never stores title text or
 * comments; tokens are already-stopped keywords.
 */
const CycleSampleSchema = new Schema(
  {
    taskId: { type: String, required: true },
    days: { type: Number, required: true },
  },
  { _id: false },
);

const WorkMemorySchema = new Schema(
  {
    // Team id, or 'workspace' when the project has no team.
    scopeKey: { type: String, required: true },
    kind: {
      type: String,
      enum: ['assignee', 'token', 'type', 'team', 'meta'],
      required: true,
    },
    subject: { type: String, required: true },
    n: { type: Number, default: 0 },
    datedN: { type: Number, default: 0 },
    lateN: { type: Number, default: 0 },
    cycles: { type: [CycleSampleSchema], default: [] },
    lastAssigneeId: { type: String, default: '' },
    lastCompletedAt: { type: Date },
    seenTaskIds: { type: [String], default: [] },
    seeded: { type: Boolean, default: false },
    lastLearnedAt: { type: Date },
  },
  { timestamps: true },
);

WorkMemorySchema.index({ scopeKey: 1, kind: 1, subject: 1 }, { unique: true });

export type WorkMemoryDoc = InferSchemaType<typeof WorkMemorySchema>;

export const WorkMemory: Model<WorkMemoryDoc> =
  (mongoose.models.WorkMemory as Model<WorkMemoryDoc>) ||
  mongoose.model<WorkMemoryDoc>('WorkMemory', WorkMemorySchema);
