import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

/**
 * Recurring activity — a team-level chore that repeats on a configurable
 * cadence (e.g. monthly MES downtime, half-yearly active-user review). The
 * lead defines it once; the system materialises each occurrence as a real
 * Task (so it shows up on the calendar, dashboard and bird's-eye for free),
 * carrying a checklist that resets every cycle.
 *
 * Occurrences are created two ways, both funnelling through generateOccurrence
 * in lib/recurring.ts:
 *   1. On completion of the current occurrence → the next one is spawned.
 *   2. A daily cron safety net → if an active activity has no open occurrence
 *      and the next is due, it's created even when the last was missed.
 */

// A checklist template item. No `type` key here — that's a Mongoose reserved
// word that would collapse the sub-schema to a plain string (see the
// WorkflowTemplate bug); keeping it a real sub-document avoids that trap.
const ChecklistItemSchema = new Schema({ title: { type: String, required: true } }, { _id: false });

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'] as const;

const RecurringActivitySchema = new Schema(
  {
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    // The system project that holds this activity's task occurrences.
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, default: '', maxlength: 5000 },
    checklist: { type: [ChecklistItemSchema], default: [] },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

    // Cadence: every <intervalCount> <intervalUnit>(s). e.g. 1 month, 6 month.
    intervalUnit: { type: String, enum: RECURRENCE_UNITS as unknown as string[], default: 'month' },
    intervalCount: { type: Number, default: 1, min: 1, max: 365 },
    // First occurrence's due date — the anchor the cadence steps from.
    startDate: { type: Date, required: true },
    // Due date of the NEXT occurrence to be created. Advances by one interval
    // each time an occurrence is generated.
    nextDueDate: { type: Date, required: true },
    // How many days before the due date the occurrence task should appear. 0 =
    // create on/after the due date (the cron creates it once due).
    leadTimeDays: { type: Number, default: 0, min: 0, max: 365 },

    active: { type: Boolean, default: true },
    lastOccurrenceTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

RecurringActivitySchema.index({ teamId: 1, active: 1 });
RecurringActivitySchema.index({ active: 1, nextDueDate: 1 });

export type RecurringActivityDoc = InferSchemaType<typeof RecurringActivitySchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RecurringActivity: Model<RecurringActivityDoc> =
  (mongoose.models.RecurringActivity as Model<RecurringActivityDoc>) ||
  mongoose.model<RecurringActivityDoc>('RecurringActivity', RecurringActivitySchema);
