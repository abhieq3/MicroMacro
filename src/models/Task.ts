import mongoose, { Schema, Model, InferSchemaType } from 'mongoose';

const SubtaskSchema = new Schema(
  {
    title: { type: String, required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['todo', 'in_progress', 'done'], default: 'todo' },
    dueDate: { type: Date },
    completedAt: { type: Date },
    position: { type: Number, default: 0 },
  },
  { _id: true, timestamps: true },
);

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
  },
  { _id: true, timestamps: true },
);

/** Effort log entry — minutes spent on this task. */
const EffortEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    minutes: { type: Number, required: true, min: 1, max: 24 * 60 * 30 },
    note: { type: String, default: '' },
    onDate: { type: String, default: '' },
    source: { type: String, enum: ['manual', 'calendar'], default: 'manual' },
  },
  { _id: true, timestamps: true },
);

const TaskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    phaseId: { type: Schema.Types.ObjectId },
    // Set on occurrences of a team recurring activity. When such a task is
    // completed, the next occurrence is spawned (see lib/recurring.ts).
    recurringActivityId: { type: Schema.Types.ObjectId, ref: 'RecurringActivity', default: null },
    // Manual ordering within a phase (lower = higher up). Lets a lead
    // reshuffle tasks in the by-phase view. Defaults to 0; ties fall back
    // to createdAt so existing tasks keep a stable order.
    position: { type: Number, default: 0 },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'review', 'blocked', 'done'],
      default: 'todo',
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    taskType: {
      type: String,
      enum: ['task', 'review', 'approval', 'test', 'deviation', 'capa', 'audit_finding', 'data_review'],
      default: 'task',
    },
    gxpCritical: { type: Boolean, default: false },
    requiresQaSignoff: { type: Boolean, default: false },
    qaSignoffUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    qaSignoffAt: { type: Date },

    startDate: { type: Date },
    dueDate: { type: Date },
    completedAt: { type: Date },
    estimatedHours: { type: Number },
    actualHours: { type: Number },

    aiTriage: {
      severity: { type: String, enum: ['minor', 'major', 'critical'] },
      severityScore: { type: Number },
      category: { type: String },
      rationale: [{ type: String }],
      suggestedCapa: [{ type: String }],
      similarTaskIds: [{ type: Schema.Types.ObjectId }],
      computedAt: { type: Date },
    },

    // ── Pharma / Change-Control fields ─────────────────────────────────
    // Mirrors the columns teams already track in Excel IDP sheets.
    ccNo: { type: String, default: '' }, // Change Control number, e.g. "CC-2025-042"
    ccTcd: { type: Date }, // CC Target Completion Date
    documentNo: { type: String, default: '' }, // SOP / protocol / doc reference
    applicableSite: {
      type: String,
      enum: ['val', 'prd', 'val_prd', 'na'],
      default: 'na',
    },
    deployStage: {
      type: String,
      enum: ['dev', 'int', 'prd', 'na'],
      default: 'na',
    },
    remarks: { type: String, default: '' },

    // Who the task is currently stuck/waiting on — a person, role, or
    // department (e.g. "QA", "Sachin", "IT Helpdesk"). Free text so a lead
    // can name whoever the bottleneck is. Empty = not waiting on anyone.
    pendingWith: { type: String, default: '' },

    subtasks: { type: [SubtaskSchema], default: [] },
    comments: { type: [CommentSchema], default: [] },
    effortLog: { type: [EffortEntrySchema], default: [] },
    // Private task overlay: a user can track a personal follow-up against a
    // shared project without exposing it to the team board. Only this user sees
    // it in project/task/day surfaces.
    privateToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastActivityAt: { type: Date, default: Date.now },

    // ── Flow Signal: meaningful-activity + waiting state ──────────────────
    // Internal codename only — see CLAUDE.md and src/lib/flow/*.ts. Never
    // surface these field names in the UI. They power the quiet "Quick
    // check / Needs attention" strip on the dashboard + task detail.
    //
    // lastActivityAt above stays the legacy "any update" timestamp (cosmetic
    // edits bump it). lastMeaningfulActivityAt only advances on actual work
    // movement — status change, comment, subtask progress, effort, sign-off,
    // reassign. Editing the title or pushing out a due date must NOT touch
    // it: those are not progress.
    lastMeaningfulActivityAt: { type: Date, default: Date.now },
    // The user's reassurance ("Still moving") is tracked separately from
    // actual recorded movement so the baseline never gets contaminated by
    // self-attestation. Resets the prompt cooldown but is not progress.
    flowHumanConfirmedMovingAt: { type: Date, default: null },

    // Prompt bookkeeping — for cooldowns + de-duping. Bounded enum codes
    // only, never user-authored text.
    flowPromptLastShownAt: { type: Date, default: null },
    flowPromptSnoozedUntil: { type: Date, default: null },
    flowPromptLastReasonCodes: { type: [String], default: [] },

    // Confirmed waiting state — populated only after a *user* (assignee or
    // lead) confirmed the situation through the flow-check endpoint. The
    // dashboard treats this as fact, not inference. Cleared by an explicit
    // resolve.
    flowPendingType: {
      type: String,
      enum: ['approval', 'another_team', 'person', 'other', 'decision', 'help', null],
      default: null,
    },
    // Optional short context provided by the assignee on "Waiting → Other".
    // Bounded length, sanitised on write, never used as ML training text.
    flowPendingDetail: { type: String, default: '' },
    flowPendingSince: { type: Date, default: null },
    flowPendingConfirmedAt: { type: Date, default: null },
    flowPendingConfirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    flowResolvedAt: { type: Date, default: null },
    // Monotonic counter so a stale resolve can't clobber a fresher confirm.
    flowStateVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

TaskSchema.index({ recurringActivityId: 1, status: 1 });
TaskSchema.index({ assigneeId: 1 });
// "My tasks" also surfaces subtasks assigned to the user. Without this the
// { 'subtasks.assigneeId': userId } lookup is a full collection scan; this
// multikey index turns it into an index seek as task history grows.
TaskSchema.index({ 'subtasks.assigneeId': 1 });
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ projectId: 1, position: 1, createdAt: 1 });
TaskSchema.index({ projectId: 1, status: 1 });
TaskSchema.index({ projectId: 1, privateToUserId: 1 });
TaskSchema.index({ privateToUserId: 1, status: 1, dueDate: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ dueDate: 1 });
// Compound indices that match the lead-dashboard aggregations directly —
// open / overdue / done-this-week facets all key off (status, assigneeId)
// or (status, dueDate). With these, Mongo serves the dashboard from
// covering indices instead of full collection scans.
TaskSchema.index({ status: 1, assigneeId: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });
TaskSchema.index({ status: 1, completedAt: -1 });
// Per-person delivery history — the momentum strip, /api/users/me/stats, the
// public-profile impact row and the slip-risk profiles all ask "this
// assignee's done tasks within a completedAt window". This compound serves
// the equality pair + range directly, keeping those per-request reads
// index-only as task history grows.
TaskSchema.index({ assigneeId: 1, status: 1, completedAt: -1 });
// Serves the daily digest / calendar-feed query: a user's open tasks by due
// date (assigneeId equality + status filter + dueDate range), so the digest
// stays index-only as the task collection grows.
TaskSchema.index({ assigneeId: 1, status: 1, dueDate: 1 });
// Covers the dashboard aggregate: match on projectId, group on status/dueDate
TaskSchema.index({ projectId: 1, status: 1, dueDate: 1 });
TaskSchema.index({ projectId: 1, assigneeId: 1, status: 1 });
// Flow Signal — find candidate stalled tasks fast (open, by project / by
// assignee, sorted by how long they've been idle).
TaskSchema.index({ projectId: 1, status: 1, lastMeaningfulActivityAt: 1 });
TaskSchema.index({ assigneeId: 1, status: 1, lastMeaningfulActivityAt: 1 });
// Find unresolved confirmed-waiting tasks for the lead's "Needs attention" list.
TaskSchema.index({ flowPendingType: 1, flowResolvedAt: 1 });

export type TaskDoc = InferSchemaType<typeof TaskSchema> & { _id: mongoose.Types.ObjectId };

export const Task: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) || mongoose.model<TaskDoc>('Task', TaskSchema);
