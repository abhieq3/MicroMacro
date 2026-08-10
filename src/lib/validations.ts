// ─── API request validations — single source of truth ─────────────────────────
// Every API route that creates or updates a Project or Task MUST validate its
// incoming body through one of the schemas exported from this file. These
// schemas are also the contract for Informatics-specific fields required by
// 21 CFR Part 11 / GxP audit trails — see CLAUDE.md.
//
// Naming convention:
//   *Create  — POST  bodies (required fields enforced)
//   *Update  — PATCH bodies (everything optional, nullable where the route
//             needs to clear a value)

import { z } from 'zod';

/* ── Shared enums ────────────────────────────────────────────────────────── */

export const PriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const ProjectStatusEnum = z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']);

export const ProjectLifecycleEnum = z.enum([
  'csv',
  'sop',
  'deviation',
  'capa',
  'deviation_capa',
  'change_control',
  'software_change',
  'audit',
  'validation',
  'generic',
  'agile_sprint',
  'software_release',
  'product_launch',
  'research',
  // Personal templates — surfaced only when the user toggles "Personal
  // project". Keep these synced with src/lib/lifecycles.ts.
  'personal_goal',
  'personal_study',
  'personal_habit',
  'personal_side_project',
  'personal_event',
  'personal_career',
  'personal_job_search',
  'personal_fitness',
  'personal_finance',
  'personal_reading',
  'personal_home_move',
  'personal_creative',
  'personal_wellness',
  'personal_declutter',
  'personal_network',
  // Life Sciences — additional regulatory / operational lifecycles
  'regulatory_submission',
  'computer_system_retirement',
  'incident_management',
  'vendor_qualification',
  'training_program',
  'product_recall',
  'discrepancy_qi',
]);

export const GxpImpactEnum = z.enum(['none', 'low', 'medium', 'high']);

export const TaskStatusEnum = z.enum(['todo', 'in_progress', 'review', 'blocked', 'done']);

export const TaskTypeEnum = z.enum([
  'task',
  'review',
  'approval',
  'test',
  'deviation',
  'capa',
  'audit_finding',
  'data_review',
]);

// Informatics-specific enums — kept distinct from generic priorities/statuses
// because they are tied to physical deployment environments and regulatory
// site classifications in pharma manufacturing.
export const ApplicableSiteEnum = z.enum(['val', 'prd', 'val_prd', 'na']);
export const DeployStageEnum = z.enum(['dev', 'int', 'prd', 'na']);

/* ── Helpers ─────────────────────────────────────────────────────────────── */

// ISO-date or empty/null. We accept strings here and let the API route turn
// them into Date objects right before they hit Mongoose, so the schema stays
// JSON-friendly.
const dateString = z.string().refine((s) => s === '' || !Number.isNaN(Date.parse(s)), {
  message: 'Invalid date string (expected ISO-8601)',
});

const optionalObjectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId')
  .optional();

const nullableObjectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId')
  .nullable()
  .optional();

/* ── Username ──────────────────────────────────────────────────────────────
   Short Instagram-style handle. Lower-cased, 3-30 chars, ASCII letters /
   digits / underscore / dot. The `.` lets people use "first.last" but the
   first char must be a letter so we can't end up with leading-dot dotfiles
   in any log line, and a trailing dot is rejected for the same reason. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters.')
  .max(30, 'Username must be 30 characters or fewer.')
  .regex(
    /^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/,
    'Use letters, digits, underscores or dots. Must start with a letter.',
  );

/* ── Project schemas ─────────────────────────────────────────────────────── */

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  code: z.string().max(40).optional(),
  // User-defined reference number (e.g. "CC-2025-042"). Stored as ccNo;
  // distinct from the auto-generated `code` system identifier.
  ccNo: z.string().max(60).optional(),
  // User-pickable label describing what the reference number is for THIS
  // project ("CC#", "SOP#", "CAPA#", …) — not every project is a Change
  // Control. Empty renders as the generic "Ref #".
  refLabel: z.string().max(20).optional(),
  description: z.string().max(5000).optional(),
  lifecycle: ProjectLifecycleEnum.default('generic'),
  priority: PriorityEnum.optional(),
  teamId: optionalObjectId,
  ownerId: optionalObjectId,
  // Personal project — private to the creator, carries no team.
  personal: z.boolean().optional(),
  startDate: dateString.optional(),
  dueDate: dateString.optional(),
  // GxP impact is a regulatory classification — explicitly enumerated, never
  // free text. Drives downstream validation effort and approval routing.
  gxpImpact: GxpImpactEnum.optional(),
  // A personal project is a private, owner-only workspace (not a GxP record).
  // It is excluded from every cross-user rollup, team view and audit log, so it
  // carries no compliance weight — explicitly flagged here, never inferred.
  isPersonal: z.boolean().optional(),
  useTemplate: z.boolean().default(true),
  customPhases: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        // A task may be a bare title (legacy/template callers) or a richer
        // object carrying an optional assignee and start/due dates chosen at
        // creation time, so the lead doesn't have to open each task afterwards.
        tasks: z.array(
          z.union([
            z.string().max(300),
            z.object({
              title: z.string().min(1).max(300),
              assigneeId: optionalObjectId,
              startDate: dateString.optional(),
              dueDate: dateString.optional(),
            }),
          ]),
        ),
      }),
    )
    .optional(),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  status: ProjectStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  teamId: nullableObjectId,
  ownerId: nullableObjectId,
  startDate: dateString.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  gxpImpact: GxpImpactEnum.optional(),
  // Project-level reference number — a GxP identifier whose every change
  // must be logged with a before/after record. `refLabel` is the
  // user-pickable name of the reference scheme ("CC#", "SOP#", "CAPA#", …).
  ccNo: z.string().max(60).optional(),
  refLabel: z.string().max(20).optional(),
  // E-signature fields for controlled status changes on shared projects
  // (21 CFR Part 11 §11.10/§11.50). The route re-verifies `password` and
  // records `remarks` (the reason) verbatim in the audit trail. Optional here
  // because non-status edits and personal projects don't require them.
  password: z.string().min(1).optional(),
  remarks: z.string().max(1000).optional(),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;

// Requires PM password re-entry for destructive project deletion (21 CFR 11 audit intent).
export const DeleteProjectSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type DeleteProjectInput = z.infer<typeof DeleteProjectSchema>;

/* ── Team schemas ────────────────────────────────────────────────────────── */

// Teams are scoped to one of three operating functions: keeping the lights
// on (RTB), delivering change (CTB), or a catch-all (General). The legacy
// informatics values are still accepted so existing teams keep validating
// on edit — they're just no longer offered when creating a team.
export const TeamFunctionEnum = z.enum([
  'general',
  'ctb',
  'rtb',
  // legacy — accepted for backward compatibility, not offered in the UI
  'data_integrity',
  'csv_validation',
  'pharmacovigilance',
  'lab_informatics',
  'audit',
  'training',
]);

// Opt-in team capabilities. Partial on purpose — a caller can flip one module
// without resending the others.
export const TeamModulesSchema = z.object({
  qms: z.object({ enabled: z.boolean() }).partial().optional(),
  tickets: z.object({ enabled: z.boolean() }).partial().optional(),
  recurring: z.object({ enabled: z.boolean() }).partial().optional(),
});

// PM-only update. Each field independently optional so callers can patch
// just the bits they need (rename, swap lead, add/remove members).
export const TeamUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  leadId: nullableObjectId,
  memberIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId'))
    .max(200)
    .optional(),
  function: TeamFunctionEnum.optional(),
  modules: TeamModulesSchema.optional(),
});
export type TeamUpdateInput = z.infer<typeof TeamUpdateSchema>;

// Requires PM password re-entry for destructive team deletion (21 CFR 11 audit intent).
export const DeleteTeamSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});
export type DeleteTeamInput = z.infer<typeof DeleteTeamSchema>;

/* ── Recurring activities (team-level scheduled chores) ──────────────────── */

export const RecurrenceUnitEnum = z.enum(['day', 'week', 'month', 'year']);

const ChecklistInput = z
  .array(z.object({ title: z.string().min(1).max(300) }))
  .max(50)
  .default([]);

export const ScheduleKindEnum = z.enum(['interval', 'monthly_weekday']);
/** 0=Sun … 6=Sat */
export const WeekdayEnum = z.number().int().min(0).max(6);
/** 1–4 = first…fourth; -1 = last of that weekday in the month */
export const WeekdayOrdinalEnum = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(-1),
]);

export const RecurringActivityCreateSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    checklist: ChecklistInput,
    assigneeId: optionalObjectId,
    priority: PriorityEnum.optional(),
    scheduleKind: ScheduleKindEnum.default('interval'),
    intervalUnit: RecurrenceUnitEnum.default('month'),
    intervalCount: z.number().int().min(1).max(365).default(1),
    weekday: WeekdayEnum.optional(),
    weekdayOrdinal: WeekdayOrdinalEnum.optional(),
    startDate: dateString,
    leadTimeDays: z.number().int().min(0).max(365).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scheduleKind === 'monthly_weekday') {
      if (v.weekday === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pick a weekday', path: ['weekday'] });
      }
      if (v.weekdayOrdinal === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Pick which occurrence (1st / 2nd / last…)',
          path: ['weekdayOrdinal'],
        });
      }
    }
  });
export type RecurringActivityCreateInput = z.infer<typeof RecurringActivityCreateSchema>;

export const RecurringActivityUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  checklist: z.array(z.object({ title: z.string().min(1).max(300) })).max(50).optional(),
  assigneeId: nullableObjectId,
  priority: PriorityEnum.optional(),
  scheduleKind: ScheduleKindEnum.optional(),
  intervalUnit: RecurrenceUnitEnum.optional(),
  intervalCount: z.number().int().min(1).max(365).optional(),
  weekday: WeekdayEnum.nullable().optional(),
  weekdayOrdinal: WeekdayOrdinalEnum.nullable().optional(),
  // Repointing the anchor also resets the next-due cursor (handled in route).
  startDate: dateString.optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  active: z.boolean().optional(),
});
export type RecurringActivityUpdateInput = z.infer<typeof RecurringActivityUpdateSchema>;

/* ── Task schemas ────────────────────────────────────────────────────────── */

export const TaskCreateSchema = z.object({
  projectId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid project ObjectId'),
  phaseId: optionalObjectId,
  title: z.string().min(1, 'Task title is required').max(300),
  description: z.string().max(10_000).optional(),
  assigneeId: optionalObjectId,
  priority: PriorityEnum.optional(),
  taskType: TaskTypeEnum.optional(),

  // GxP / sign-off flags — explicit booleans, never coerced. A task that
  // requires QA sign-off MUST be flagged here so the audit trail and the
  // e-signature ceremony are wired in correctly (21 CFR 11.50, 11.70).
  gxpCritical: z.boolean().optional(),
  requiresQaSignoff: z.boolean().optional(),

  startDate: dateString.optional(),
  dueDate: dateString.optional(),
  estimatedHours: z.number().nonnegative().max(10_000).optional(),

  // ─── Informatics / Change-Control fields ─────────────────────────────
  // These mirror what QA teams already record in Change Control IDP sheets;
  // they must stay explicit on every Task payload so the system can rebuild
  // an audit trail joinable back to source CC documentation.
  ccNo: z.string().max(60).optional(), // e.g. "CC-2025-042"
  ccTcd: dateString.optional(), // CC Target Completion Date
  documentNo: z.string().max(120).optional(), // SOP / protocol reference
  applicableSite: ApplicableSiteEnum.optional(), // val / prd / val_prd / na
  deployStage: DeployStageEnum.optional(), // dev / int / prd / na
  remarks: z.string().max(5000).optional(),
  privateToMe: z.boolean().optional(),
});
export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;

export const TaskUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(10_000).optional(),
  assigneeId: nullableObjectId,
  status: TaskStatusEnum.optional(),
  priority: PriorityEnum.optional(),
  taskType: TaskTypeEnum.optional(),

  gxpCritical: z.boolean().optional(),
  requiresQaSignoff: z.boolean().optional(),

  startDate: dateString.nullable().optional(),
  dueDate: dateString.nullable().optional(),
  estimatedHours: z.number().nonnegative().max(10_000).nullable().optional(),
  actualHours: z.number().nonnegative().max(10_000).nullable().optional(),
  phaseId: nullableObjectId,

  // Informatics / Change-Control fields — nullable on update so a record can
  // be cleared if a CC is voided, but the field shape itself stays strict.
  ccNo: z.string().max(60).optional(),
  ccTcd: dateString.nullable().optional(),
  documentNo: z.string().max(120).optional(),
  applicableSite: ApplicableSiteEnum.optional(),
  deployStage: DeployStageEnum.optional(),
  remarks: z.string().max(5000).optional(),
  pendingWith: z.string().max(120).optional(),
  onCriticalPath: z.boolean().optional(),
  /** Predecessor task id (same project), or null to clear. */
  blockedByTaskId: nullableObjectId,
});
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

/* ── Workflow templates (custom, workspace-saved) ───────────────────────── */

const WorkflowTemplateTaskSchema = z.object({
  title: z.string(),
  type: z.string().optional(),
});
export const WorkflowTemplatePhaseSchema = z.object({
  name: z.string(),
  tasks: z.array(WorkflowTemplateTaskSchema).default([]),
});
export const WorkflowTemplateCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  phases: z.array(WorkflowTemplatePhaseSchema).default([]),
});
export const WorkflowTemplateUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  phases: z.array(WorkflowTemplatePhaseSchema).optional(),
});
export type WorkflowTemplateUpdateInput = z.infer<typeof WorkflowTemplateUpdateSchema>;

/* ── Tracker sheets (generic QMS / quality-tracking grid) ────────────────────
   A sheet has configurable columns (`stages`) and a row per tracked item. Stage
   keys are free-form so a team can shape the tracker to its own process. The API
   normalizes stage cells server-side, so the schema is permissive about the
   array itself and only guards the value shapes. */

export const CsvStageStatusEnum = z.enum(['pending', 'in_progress', 'na', 'done']);

const StageDefSchema = z.object({
  key: z.string().min(1).max(60),
  label: z.string().max(80).default(''),
});

const CsvStageCellSchema = z.object({
  key: z.string().min(1).max(60),
  ref: z.string().max(200).default(''),
  // Accept an ISO/date string or null; the route parses it into a Date.
  date: z.string().max(40).nullable().optional(),
  status: CsvStageStatusEnum.default('pending'),
});

const CsvRowSchema = z.object({
  ref: z.string().max(200).default(''),
  name: z.string().max(300).default(''),
  note: z.string().max(200).default(''),
  stages: z.array(CsvStageCellSchema).default([]),
});

export const CsvActivityCreateSchema = z.object({
  teamId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid team id'),
  reference: z.string().min(1).max(120),
  reference2: z.string().max(60).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  stages: z.array(StageDefSchema).max(20).optional(),
  rows: z.array(CsvRowSchema).default([]),
});

export const CsvActivityUpdateSchema = z.object({
  reference: z.string().min(1).max(120).optional(),
  reference2: z.string().max(60).optional(),
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  stages: z.array(StageDefSchema).max(20).optional(),
  rows: z.array(CsvRowSchema).optional(),
});

export type CsvActivityCreateInput = z.infer<typeof CsvActivityCreateSchema>;
export type CsvActivityUpdateInput = z.infer<typeof CsvActivityUpdateSchema>;

/* ── Support tickets (per-team request queue) ───────────────────────────── */

export const TicketStatusEnum = z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']);
export const TicketPriorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);

export const TicketCreateSchema = z.object({
  teamId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid team id'),
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional(),
  requesterName: z.string().max(200).optional(),
  assigneeId: nullableObjectId,
  priority: TicketPriorityEnum.optional(),
  category: z.string().max(120).optional(),
});

export const TicketUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(8000).optional(),
  requesterName: z.string().max(200).optional(),
  assigneeId: nullableObjectId,
  priority: TicketPriorityEnum.optional(),
  status: TicketStatusEnum.optional(),
  category: z.string().max(120).optional(),
  // Optional one-shot comment append on any update.
  comment: z.string().min(1).max(4000).optional(),
});

export type TicketCreateInput = z.infer<typeof TicketCreateSchema>;
export type TicketUpdateInput = z.infer<typeof TicketUpdateSchema>;

