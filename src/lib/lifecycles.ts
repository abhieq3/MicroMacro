export type LifecycleKey =
  | 'generic'
  | 'agile_sprint'
  | 'software_release'
  | 'product_launch'
  | 'research'
  | 'csv'
  | 'sop'
  | 'deviation'
  | 'capa'
  | 'deviation_capa'
  | 'change_control'
  | 'software_change'
  | 'audit'
  | 'validation'
  // Personal — generic, non-GxP templates suggested only when the
  // "Personal project" toggle is on. Useful when someone wants to use
  // Pragati for their own goals, study plan, or weekly routine without
  // a regulatory framework attached.
  | 'personal_goal'
  | 'personal_study'
  | 'personal_habit'
  | 'personal_side_project'
  | 'personal_event'
  | 'personal_career'
  | 'personal_job_search'
  | 'personal_fitness'
  | 'personal_finance'
  | 'personal_reading'
  | 'personal_home_move'
  | 'personal_creative'
  | 'personal_wellness'
  | 'personal_declutter'
  | 'personal_network'
  // Life Sciences — additional regulated lifecycles
  | 'regulatory_submission'
  | 'computer_system_retirement'
  | 'incident_management'
  | 'vendor_qualification'
  | 'training_program'
  | 'product_recall'
  | 'discrepancy_qi';

export type LifecycleGroup = 'General' | 'Life Sciences' | 'Personal';

export interface LifecycleTaskTemplate {
  title: string;
  type: 'task' | 'review' | 'approval' | 'test' | 'deviation' | 'capa' | 'audit_finding' | 'data_review';
  qa?: boolean;
  gxp?: boolean;
}

export interface LifecyclePhaseTemplate {
  name: string;
  tasks: LifecycleTaskTemplate[];
}

export interface LifecycleTemplate {
  label: string;
  description: string;
  regulatoryRefs: string;
  group: LifecycleGroup;
  phases: LifecyclePhaseTemplate[];
}

export const LIFECYCLES: Record<LifecycleKey, LifecycleTemplate> = {
  generic: {
    label: 'Generic project',
    description: 'A flexible, freeform project with no predefined lifecycle.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      { name: 'Planning', tasks: [{ title: 'Kick-off', type: 'task' }] },
      { name: 'Execution', tasks: [{ title: 'Work item', type: 'task' }] },
      { name: 'Closure', tasks: [{ title: 'Wrap-up & retrospective', type: 'review' }] },
    ],
  },

  agile_sprint: {
    label: 'Agile Sprint',
    description: 'Time-boxed iteration with planning, execution, review, and retrospective.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Sprint Planning',
        tasks: [
          { title: 'Backlog refinement & story pointing', type: 'review' },
          { title: 'Sprint goal definition', type: 'task' },
          { title: 'Capacity planning', type: 'task' },
        ],
      },
      {
        name: 'Development',
        tasks: [
          { title: 'Daily standups', type: 'task' },
          { title: 'Feature development', type: 'task' },
          { title: 'Code review', type: 'review' },
          { title: 'Unit & integration tests', type: 'test' },
        ],
      },
      {
        name: 'Review & Release',
        tasks: [
          { title: 'Sprint demo / review', type: 'review' },
          { title: 'QA acceptance testing', type: 'test' },
          { title: 'Deploy to staging', type: 'task' },
          { title: 'Stakeholder sign-off', type: 'approval' },
        ],
      },
      {
        name: 'Retrospective',
        tasks: [
          { title: 'Team retrospective', type: 'review' },
          { title: 'Action items log', type: 'task' },
        ],
      },
    ],
  },

  software_release: {
    label: 'Software Release',
    description: 'End-to-end release cycle from scoping through post-launch monitoring.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Scoping & Design',
        tasks: [
          { title: 'Requirements documentation', type: 'task' },
          { title: 'Technical design review', type: 'review' },
          { title: 'Architecture sign-off', type: 'approval' },
        ],
      },
      {
        name: 'Build',
        tasks: [
          { title: 'Feature development', type: 'task' },
          { title: 'Code reviews', type: 'review' },
          { title: 'Security review', type: 'review' },
        ],
      },
      {
        name: 'Testing',
        tasks: [
          { title: 'Unit test coverage review', type: 'test' },
          { title: 'Integration / E2E tests', type: 'test' },
          { title: 'Performance & load testing', type: 'test' },
          { title: 'UAT sign-off', type: 'approval' },
        ],
      },
      {
        name: 'Release',
        tasks: [
          { title: 'Deploy to production', type: 'task' },
          { title: 'Smoke tests post-deploy', type: 'test' },
          { title: 'Release notes published', type: 'task' },
        ],
      },
      {
        name: 'Post-Launch',
        tasks: [
          { title: 'Monitor error rates & SLOs', type: 'task' },
          { title: 'Post-launch retrospective', type: 'review' },
        ],
      },
    ],
  },

  product_launch: {
    label: 'Product Launch',
    description: 'Cross-functional launch lifecycle from strategy through go-live.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Strategy',
        tasks: [
          { title: 'Market research & positioning', type: 'review' },
          { title: 'Launch brief approval', type: 'approval' },
          { title: 'Success metrics defined (OKRs)', type: 'task' },
        ],
      },
      {
        name: 'Build & Content',
        tasks: [
          { title: 'Landing page / product page', type: 'task' },
          { title: 'Marketing collateral', type: 'task' },
          { title: 'Demo / onboarding flow', type: 'task' },
        ],
      },
      {
        name: 'Pre-Launch',
        tasks: [
          { title: 'Internal beta test', type: 'test' },
          { title: 'Sales enablement materials', type: 'task' },
          { title: 'Press / communications review', type: 'review' },
          { title: 'Leadership launch approval', type: 'approval' },
        ],
      },
      {
        name: 'Launch',
        tasks: [
          { title: 'Go-live execution', type: 'task' },
          { title: 'Social / email announcements', type: 'task' },
        ],
      },
      {
        name: 'Post-Launch',
        tasks: [
          { title: 'KPI review — week 1', type: 'data_review' },
          { title: 'Feedback synthesis', type: 'review' },
          { title: 'Launch retrospective', type: 'review' },
        ],
      },
    ],
  },

  research: {
    label: 'Research Project',
    description: 'Structured research lifecycle from question through published findings.',
    regulatoryRefs: '',
    group: 'General',
    phases: [
      {
        name: 'Scoping',
        tasks: [
          { title: 'Research question & hypothesis', type: 'task' },
          { title: 'Literature review', type: 'review' },
          { title: 'Methodology design', type: 'task' },
        ],
      },
      {
        name: 'Data Collection',
        tasks: [
          { title: 'Data collection execution', type: 'task' },
          { title: 'Data quality check', type: 'data_review' },
        ],
      },
      {
        name: 'Analysis',
        tasks: [
          { title: 'Statistical / qualitative analysis', type: 'task' },
          { title: 'Peer review of analysis', type: 'review' },
        ],
      },
      {
        name: 'Reporting',
        tasks: [
          { title: 'Draft report / paper', type: 'task' },
          { title: 'Internal review', type: 'review' },
          { title: 'Stakeholder sign-off', type: 'approval' },
        ],
      },
    ],
  },

  csv: {
    label: 'Computer System Validation (CSV / GAMP 5)',
    description:
      'Validation lifecycle for GxP computerized systems, aligned with GAMP 5 and 21 CFR Part 11 / EU Annex 11.',
    regulatoryRefs: '21 CFR Part 11, EU Annex 11, GAMP 5',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Planning & Risk Assessment',
        tasks: [
          { title: 'Draft Validation Plan (VP)', type: 'task', qa: true, gxp: true },
          { title: 'System Risk Assessment (GAMP category)', type: 'review', qa: true, gxp: true },
          { title: 'Data integrity requirements (ALCOA+)', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Specification (URS / FS / DS)',
        tasks: [
          { title: 'User Requirements Specification (URS)', type: 'task', qa: true, gxp: true },
          { title: 'Functional / Design Specification', type: 'task', qa: true, gxp: true },
          { title: 'Traceability matrix draft', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Build & Configuration',
        tasks: [
          { title: 'Install / Configure system in QA environment', type: 'task', gxp: true },
          { title: 'Supplier / Vendor Audit documentation', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Qualification (IQ / OQ / PQ)',
        tasks: [
          { title: 'Installation Qualification (IQ)', type: 'test', qa: true, gxp: true },
          { title: 'Operational Qualification (OQ)', type: 'test', qa: true, gxp: true },
          { title: 'Performance Qualification (PQ)', type: 'test', qa: true, gxp: true },
        ],
      },
      {
        name: 'Release & Go-Live',
        tasks: [
          { title: 'Validation Summary Report (VSR)', type: 'approval', qa: true, gxp: true },
          { title: 'QA release approval', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Periodic Review',
        tasks: [{ title: 'Annual periodic review', type: 'review', qa: true, gxp: true }],
      },
    ],
  },

  sop: {
    label: 'Standard Operating Procedure (SOP)',
    description: 'Authoring, review, approval, training and periodic review of SOPs.',
    regulatoryRefs: '21 CFR 211, ICH Q10',
    group: 'Life Sciences',
    phases: [
      { name: 'Authoring', tasks: [{ title: 'Draft SOP', type: 'task', gxp: true }] },
      {
        name: 'Review',
        tasks: [
          { title: 'SME review', type: 'review', gxp: true },
          { title: 'QA review', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Approval',
        tasks: [
          { title: 'Department head approval', type: 'approval', gxp: true },
          { title: 'QA Head approval & effective date', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Training',
        tasks: [{ title: 'Execute training & record attendance', type: 'task', qa: true, gxp: true }],
      },
      { name: 'Periodic Review', tasks: [{ title: 'Biennial review', type: 'review', qa: true, gxp: true }] },
    ],
  },

  deviation_capa: {
    label: 'Deviation / CAPA',
    description: 'Deviation investigation and corrective/preventive action lifecycle.',
    regulatoryRefs: 'ICH Q10, 21 CFR 211.192',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Identification & Containment',
        tasks: [
          { title: 'Log deviation with initial description', type: 'deviation', qa: true, gxp: true },
          { title: 'Immediate containment actions', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Investigation & RCA',
        tasks: [
          { title: 'Classify deviation (minor / major / critical)', type: 'task', qa: true, gxp: true },
          { title: 'Root cause analysis', type: 'review', qa: true, gxp: true },
          { title: 'Impact assessment on product & systems', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'CAPA Definition',
        tasks: [
          { title: 'Define corrective actions', type: 'capa', qa: true, gxp: true },
          { title: 'Define preventive actions', type: 'capa', qa: true, gxp: true },
          { title: 'Effectiveness check plan', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Execution & Closure',
        tasks: [
          { title: 'Execute CAPAs & track evidence', type: 'task', qa: true, gxp: true },
          { title: 'Effectiveness check', type: 'review', qa: true, gxp: true },
          { title: 'QA closure & sign-off', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  change_control: {
    label: 'Change Control',
    description: 'Controlled evaluation, approval and implementation of changes to GxP systems.',
    regulatoryRefs: 'ICH Q10, EU GMP Annex 15',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Proposal',
        tasks: [
          { title: 'Submit change request', type: 'task', gxp: true },
          { title: 'Preliminary classification', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Impact Assessment',
        tasks: [{ title: 'Cross-functional impact assessment', type: 'review', qa: true, gxp: true }],
      },
      {
        name: 'Approval',
        tasks: [{ title: 'Change Control Board approval', type: 'approval', qa: true, gxp: true }],
      },
      {
        name: 'Implementation',
        tasks: [
          { title: 'Execute approved actions', type: 'task', gxp: true },
          { title: 'Update documentation & training', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Verification & Closure',
        tasks: [
          { title: 'Post-implementation verification & QA closure', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  audit: {
    label: 'Audit / Inspection readiness',
    description: 'Internal audit or regulatory inspection preparation, execution and follow-up.',
    regulatoryRefs: '21 CFR 211, EU GMP Ch. 9',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Preparation',
        tasks: [
          { title: 'Audit plan & scope', type: 'task', qa: true, gxp: true },
          { title: 'Pre-audit document review', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Execution',
        tasks: [
          { title: 'Opening meeting', type: 'task', qa: true },
          { title: 'On-site / remote audit walkthrough', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Findings & CAPA',
        tasks: [
          { title: 'Record audit findings', type: 'audit_finding', qa: true, gxp: true },
          { title: 'Assign CAPAs', type: 'capa', qa: true, gxp: true },
        ],
      },
      {
        name: 'Follow-up',
        tasks: [{ title: 'CAPA completion & final report sign-off', type: 'approval', qa: true, gxp: true }],
      },
    ],
  },

  validation: {
    label: 'Process / Method Validation',
    description: 'Analytical method or manufacturing process validation lifecycle.',
    regulatoryRefs: 'ICH Q2(R1), ICH Q7',
    group: 'Life Sciences',
    phases: [
      { name: 'VMP', tasks: [{ title: 'Draft Validation Master Plan', type: 'task', qa: true, gxp: true }] },
      {
        name: 'Protocol',
        tasks: [
          { title: 'Author protocol', type: 'task', qa: true, gxp: true },
          { title: 'QA approve protocol', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Execution',
        tasks: [
          { title: 'Execute validation runs', type: 'test', qa: true, gxp: true },
          { title: 'Record raw data & deviations', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Report',
        tasks: [
          { title: 'Validation report', type: 'task', qa: true, gxp: true },
          { title: 'QA approve report', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  deviation: {
    label: 'Deviation',
    description:
      'Manage deviations from approved procedures, specifications, or plans — from detection through QA closure.',
    regulatoryRefs: '21 CFR 211.192, ICH Q10',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Detection & Logging',
        tasks: [
          {
            title: 'Log deviation with initial description & timestamp',
            type: 'deviation',
            qa: true,
            gxp: true,
          },
          { title: 'Immediate containment / quarantine actions', type: 'task', qa: true, gxp: true },
          { title: 'Notify affected stakeholders', type: 'task', qa: true },
        ],
      },
      {
        name: 'Classification & Triage',
        tasks: [
          { title: 'Classify severity (minor / major / critical)', type: 'task', qa: true, gxp: true },
          { title: 'Assign investigator & timeline', type: 'task', qa: true },
          { title: 'Preliminary regulatory reportability check', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Investigation & RCA',
        tasks: [
          { title: 'Root cause analysis (5-Why, fishbone, etc.)', type: 'review', qa: true, gxp: true },
          { title: 'Impact assessment on product / batch / system', type: 'review', qa: true, gxp: true },
          { title: 'Review comparable deviations / trend data', type: 'data_review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Closure',
        tasks: [
          { title: 'Disposition decision (accept / reject / rework)', type: 'approval', qa: true, gxp: true },
          { title: 'Raise CAPA if required', type: 'capa', qa: true, gxp: true },
          { title: 'QA review & sign-off', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  capa: {
    label: 'CAPA',
    description:
      'Corrective and Preventive Action lifecycle — from root cause definition through effectiveness verification.',
    regulatoryRefs: 'ICH Q10, 21 CFR 820.100',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Initiation',
        tasks: [
          {
            title: 'Define problem statement and source (deviation / audit / complaint)',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Risk rank the CAPA (minor / major / critical)', type: 'review', qa: true, gxp: true },
          { title: 'Assign CAPA owner & target dates', type: 'task', qa: true },
        ],
      },
      {
        name: 'Corrective Actions',
        tasks: [
          { title: 'Define corrective actions (fix the known issue)', type: 'capa', qa: true, gxp: true },
          { title: 'Execute corrective actions & collect evidence', type: 'task', qa: true, gxp: true },
          { title: 'Update SOPs / procedures as needed', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Preventive Actions',
        tasks: [
          { title: 'Define preventive actions (stop recurrence)', type: 'capa', qa: true, gxp: true },
          { title: 'Training / awareness update', type: 'task', qa: true },
          { title: 'System or process control improvements', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Effectiveness Review',
        tasks: [
          { title: 'Effectiveness check plan execution', type: 'review', qa: true, gxp: true },
          {
            title: 'Trending analysis (confirm recurrence eliminated)',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          { title: 'QA final sign-off & closure', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  software_change: {
    label: 'Software Change (QI)',
    description:
      'Lifecycle for adding features or changes to existing quality informatics software — change control, validation, and GxP sign-off.',
    regulatoryRefs: '21 CFR Part 11, GAMP 5, EU Annex 11',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Change Request',
        tasks: [
          { title: 'Document change request with business justification', type: 'task', gxp: true },
          { title: 'Impact assessment on validated state', type: 'review', qa: true, gxp: true },
          { title: 'Risk classification (minor / major change)', type: 'review', qa: true, gxp: true },
          { title: 'Change Control Board approval', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Design & Specification',
        tasks: [
          {
            title: 'Update / create User Requirements Specification (URS)',
            type: 'task',
            qa: true,
            gxp: true,
          },
          {
            title: 'Technical design document / impact on existing specs',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Traceability matrix update', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Development',
        tasks: [
          { title: 'Code / configure changes in non-production environment', type: 'task', gxp: true },
          { title: 'Code review & peer testing', type: 'review', gxp: true },
          { title: 'Unit tests for changed components', type: 'test', gxp: true },
        ],
      },
      {
        name: 'Validation & Testing',
        tasks: [
          { title: 'Draft / update validation test scripts (OQ / PQ)', type: 'task', qa: true, gxp: true },
          { title: 'Execute validation testing in QA environment', type: 'test', qa: true, gxp: true },
          { title: 'Resolve defects & re-test', type: 'test', qa: true, gxp: true },
          { title: 'UAT by process owner', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'GxP Sign-off & Deployment',
        tasks: [
          { title: 'Validation Summary Report for change', type: 'approval', qa: true, gxp: true },
          {
            title: 'QA Head sign-off & re-validated state confirmation',
            type: 'approval',
            qa: true,
            gxp: true,
          },
          { title: 'Deploy to production with change ticket reference', type: 'task', gxp: true },
          { title: 'Training records updated for impacted users', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Post-Implementation Review',
        tasks: [
          { title: 'Monitor system behaviour post-deployment (1–4 weeks)', type: 'task', gxp: true },
          { title: 'Confirm no new deviations or data integrity gaps', type: 'review', qa: true, gxp: true },
          { title: 'Close change control record', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  /* ── Personal templates ────────────────────────────────────────────────
     Ready-made workflows for someone using Pragati for their own goals,
     not a regulated process. Surfaced only when the "Personal project"
     toggle is on. They are intentionally light — no GxP fields, no
     approvals — so the user can move fast. */
  personal_goal: {
    label: 'Personal Goal',
    description: 'Break a personal ambition into a clear plan with milestones and reflection.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Define',
        tasks: [
          { title: 'Write the goal in one sentence', type: 'task' },
          { title: 'Why it matters to me', type: 'task' },
          { title: 'Define what "done" looks like', type: 'task' },
        ],
      },
      {
        name: 'Plan',
        tasks: [
          { title: 'Break the goal into milestones', type: 'task' },
          { title: 'Schedule weekly time blocks', type: 'task' },
          { title: 'Identify obstacles & how to handle', type: 'task' },
        ],
      },
      {
        name: 'Do',
        tasks: [
          { title: 'Execute milestone 1', type: 'task' },
          { title: 'Execute milestone 2', type: 'task' },
          { title: 'Weekly check-in with myself', type: 'review' },
        ],
      },
      {
        name: 'Reflect',
        tasks: [
          { title: 'What worked', type: 'review' },
          { title: 'What I would do differently', type: 'review' },
          { title: 'Next goal to chase', type: 'task' },
        ],
      },
    ],
  },

  personal_study: {
    label: 'Study Plan',
    description: 'Learn a new subject, course or certification with a steady pace.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Setup',
        tasks: [
          { title: 'Pick the syllabus / book / course', type: 'task' },
          { title: 'Set a target completion date', type: 'task' },
          { title: 'Gather study materials & tools', type: 'task' },
        ],
      },
      {
        name: 'Learn',
        tasks: [
          { title: 'Week 1 — fundamentals', type: 'task' },
          { title: 'Week 2 — core concepts', type: 'task' },
          { title: 'Week 3 — advanced topics', type: 'task' },
          { title: 'Practice problems / exercises', type: 'task' },
        ],
      },
      {
        name: 'Apply',
        tasks: [
          { title: 'Build a small project to apply it', type: 'task' },
          { title: 'Teach it to someone (Feynman test)', type: 'task' },
        ],
      },
      {
        name: 'Assess',
        tasks: [
          { title: 'Mock test / quiz', type: 'test' },
          { title: 'Final exam or certification', type: 'approval' },
        ],
      },
    ],
  },

  personal_habit: {
    label: 'Habit Tracker',
    description: 'Build a daily habit and track consistency over a month.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Commit',
        tasks: [
          { title: 'Name the habit clearly', type: 'task' },
          { title: 'Pick the cue and reward', type: 'task' },
          { title: 'Set the daily time / trigger', type: 'task' },
        ],
      },
      {
        name: 'Week 1',
        tasks: [
          { title: 'Day 1–7 — show up no matter what', type: 'task' },
          { title: 'Reflect on what was hard', type: 'review' },
        ],
      },
      {
        name: 'Week 2–3',
        tasks: [
          { title: 'Day 8–21 — keep the streak alive', type: 'task' },
          { title: 'Mid-point reflection', type: 'review' },
        ],
      },
      {
        name: 'Week 4',
        tasks: [
          { title: 'Day 22–30 — lock it in', type: 'task' },
          { title: 'Decide what comes next', type: 'task' },
        ],
      },
    ],
  },

  personal_side_project: {
    label: 'Side Project',
    description: 'Take a personal build from idea to shipped, on your own time.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Idea',
        tasks: [
          { title: 'Write the elevator pitch', type: 'task' },
          { title: 'Who is it for, what problem', type: 'task' },
          { title: 'List the must-have features', type: 'task' },
        ],
      },
      {
        name: 'Build',
        tasks: [
          { title: 'Set up the project / repo', type: 'task' },
          { title: 'Build feature 1', type: 'task' },
          { title: 'Build feature 2', type: 'task' },
          { title: 'Polish & remove rough edges', type: 'task' },
        ],
      },
      {
        name: 'Ship',
        tasks: [
          { title: 'Test on a real user (you count)', type: 'test' },
          { title: 'Publish / deploy', type: 'task' },
          { title: 'Tell the world (post / share)', type: 'task' },
        ],
      },
      {
        name: 'Iterate',
        tasks: [
          { title: 'Gather feedback', type: 'review' },
          { title: 'Decide: keep building or move on', type: 'task' },
        ],
      },
    ],
  },

  personal_event: {
    label: 'Event / Trip Planner',
    description: 'Plan a personal event, trip or get-together without missing the details.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Plan',
        tasks: [
          { title: 'Pick the date & destination', type: 'task' },
          { title: 'Set a budget', type: 'task' },
          { title: 'List who is involved', type: 'task' },
        ],
      },
      {
        name: 'Book',
        tasks: [
          { title: 'Bookings — travel / venue', type: 'task' },
          { title: 'Bookings — stay', type: 'task' },
          { title: 'Confirm dates with everyone', type: 'approval' },
        ],
      },
      {
        name: 'Prep',
        tasks: [
          { title: 'Pack the essentials', type: 'task' },
          { title: 'Itinerary / schedule', type: 'task' },
          { title: 'Last-minute confirmations', type: 'task' },
        ],
      },
      {
        name: 'Wrap',
        tasks: [
          { title: 'Settle expenses', type: 'task' },
          { title: 'Save photos & notes', type: 'task' },
        ],
      },
    ],
  },

  personal_career: {
    label: 'Career Growth',
    description: 'A deliberate plan to grow in your role — skills, visibility, and the next step up.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Reflect',
        tasks: [
          { title: 'Where am I now — strengths & gaps', type: 'review' },
          { title: 'Define the role/level I want next', type: 'task' },
          { title: 'Ask for honest feedback from 3 people', type: 'task' },
        ],
      },
      {
        name: 'Plan',
        tasks: [
          { title: 'Pick 3 skills to build this year', type: 'task' },
          { title: 'Find a mentor or sponsor', type: 'task' },
          { title: 'Set measurable milestones per quarter', type: 'task' },
        ],
      },
      {
        name: 'Grow',
        tasks: [
          { title: 'Take on a stretch project', type: 'task' },
          { title: 'Build skill 1', type: 'task' },
          { title: 'Build skill 2', type: 'task' },
          { title: 'Share my work publicly', type: 'task' },
        ],
      },
      {
        name: 'Advance',
        tasks: [
          { title: 'Update CV / profile with wins', type: 'task' },
          { title: 'Have the growth conversation', type: 'approval' },
          { title: 'Set the next goal', type: 'review' },
        ],
      },
    ],
  },

  personal_job_search: {
    label: 'Job Search',
    description: 'Run your job hunt like a pipeline — from target list to signed offer.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Prepare',
        tasks: [
          { title: 'Clarify what I want (role, comp, location)', type: 'task' },
          { title: 'Refresh CV & cover letter', type: 'task' },
          { title: 'Update LinkedIn / portfolio', type: 'task' },
          { title: 'Build a target company list', type: 'task' },
        ],
      },
      {
        name: 'Apply',
        tasks: [
          { title: 'Tailor & send applications', type: 'task' },
          { title: 'Reach out to referrals', type: 'task' },
          { title: 'Track every application', type: 'task' },
        ],
      },
      {
        name: 'Interview',
        tasks: [
          { title: 'Prep common questions & stories', type: 'task' },
          { title: 'Practice mock interviews', type: 'review' },
          { title: 'Research each company before calls', type: 'task' },
        ],
      },
      {
        name: 'Decide',
        tasks: [
          { title: 'Compare offers', type: 'review' },
          { title: 'Negotiate', type: 'task' },
          { title: 'Accept & resign gracefully', type: 'approval' },
        ],
      },
    ],
  },

  personal_fitness: {
    label: 'Fitness Plan',
    description: 'Get fitter with a structured, sustainable plan instead of a crash effort.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Baseline',
        tasks: [
          { title: 'Set a specific, measurable goal', type: 'task' },
          { title: 'Record current stats / photos', type: 'task' },
          { title: 'Book a check-up if needed', type: 'task' },
        ],
      },
      {
        name: 'Build',
        tasks: [
          { title: 'Pick a workout routine', type: 'task' },
          { title: 'Plan weekly meals', type: 'task' },
          { title: 'Set a sleep schedule', type: 'task' },
        ],
      },
      {
        name: 'Sustain',
        tasks: [
          { title: 'Week 1–4 — consistency', type: 'task' },
          { title: 'Week 5–8 — progressive overload', type: 'task' },
          { title: 'Weekly progress check-in', type: 'review' },
        ],
      },
      {
        name: 'Review',
        tasks: [
          { title: 'Measure against the goal', type: 'review' },
          { title: 'Set the next phase', type: 'task' },
        ],
      },
    ],
  },

  personal_finance: {
    label: 'Financial Goal',
    description: 'Plan a savings, debt-payoff or investment goal and stay on track.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Assess',
        tasks: [
          { title: 'List income, expenses & debts', type: 'task' },
          { title: 'Define the goal & target amount', type: 'task' },
          { title: 'Set the deadline', type: 'task' },
        ],
      },
      {
        name: 'Plan',
        tasks: [
          { title: 'Build a monthly budget', type: 'task' },
          { title: 'Automate savings / payments', type: 'task' },
          { title: 'Cut one recurring cost', type: 'task' },
        ],
      },
      {
        name: 'Execute',
        tasks: [
          { title: 'Month 1 — track every rupee', type: 'task' },
          { title: 'Month 2 — adjust the budget', type: 'task' },
          { title: 'Monthly net-worth check-in', type: 'review' },
        ],
      },
      {
        name: 'Review',
        tasks: [
          { title: 'Hit the target', type: 'approval' },
          { title: 'Set the next financial goal', type: 'task' },
        ],
      },
    ],
  },

  personal_reading: {
    label: 'Reading Challenge',
    description: 'Read more with a simple list-build, read, and reflect loop.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Curate',
        tasks: [
          { title: 'Set a target (e.g. 12 books / year)', type: 'task' },
          { title: 'Build the reading list', type: 'task' },
          { title: 'Schedule daily reading time', type: 'task' },
        ],
      },
      {
        name: 'Read',
        tasks: [
          { title: 'Book 1', type: 'task' },
          { title: 'Book 2', type: 'task' },
          { title: 'Book 3', type: 'task' },
        ],
      },
      {
        name: 'Reflect',
        tasks: [
          { title: 'Note key takeaways per book', type: 'review' },
          { title: 'Share recommendations', type: 'task' },
        ],
      },
    ],
  },

  personal_home_move: {
    label: 'Home Move',
    description: 'Move house without the chaos — pack, switch, and settle in order.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Plan',
        tasks: [
          { title: 'Set the moving date & budget', type: 'task' },
          { title: 'Get quotes from movers', type: 'task' },
          { title: 'Declutter before packing', type: 'task' },
        ],
      },
      {
        name: 'Pack',
        tasks: [
          { title: 'Pack room by room', type: 'task' },
          { title: 'Label every box', type: 'task' },
          { title: 'Keep an essentials bag', type: 'task' },
        ],
      },
      {
        name: 'Switch',
        tasks: [
          { title: 'Transfer utilities & internet', type: 'task' },
          { title: 'Update address everywhere', type: 'task' },
          { title: 'Redirect mail', type: 'task' },
        ],
      },
      {
        name: 'Settle',
        tasks: [
          { title: 'Unpack the essentials first', type: 'task' },
          { title: 'Deep clean & set up', type: 'task' },
          { title: 'Meet the neighbours', type: 'task' },
        ],
      },
    ],
  },

  personal_creative: {
    label: 'Creative Project',
    description: 'Finish that book, blog, album or art series — idea to published.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Ideate',
        tasks: [
          { title: 'Capture the core idea', type: 'task' },
          { title: 'Define the audience & format', type: 'task' },
          { title: 'Outline the whole thing', type: 'task' },
        ],
      },
      {
        name: 'Create',
        tasks: [
          { title: 'Draft part 1', type: 'task' },
          { title: 'Draft part 2', type: 'task' },
          { title: 'Draft part 3', type: 'task' },
        ],
      },
      {
        name: 'Refine',
        tasks: [
          { title: 'Self-edit & revise', type: 'review' },
          { title: 'Get feedback from a trusted few', type: 'review' },
          { title: 'Final polish', type: 'task' },
        ],
      },
      {
        name: 'Ship',
        tasks: [
          { title: 'Publish / release', type: 'approval' },
          { title: 'Share & promote', type: 'task' },
        ],
      },
    ],
  },

  personal_wellness: {
    label: 'Wellness & Mindfulness',
    description: 'Build a calmer, healthier routine — sleep, mindfulness and balance.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Notice',
        tasks: [
          { title: 'Identify my main stressors', type: 'review' },
          { title: 'Set one wellbeing intention', type: 'task' },
        ],
      },
      {
        name: 'Build',
        tasks: [
          { title: 'Start a 10-min daily mindfulness habit', type: 'task' },
          { title: 'Set a wind-down & sleep routine', type: 'task' },
          { title: 'Plan screen-free time', type: 'task' },
        ],
      },
      {
        name: 'Practice',
        tasks: [
          { title: 'Week 1–2 — show up daily', type: 'task' },
          { title: 'Week 3–4 — deepen the practice', type: 'task' },
          { title: 'Weekly mood check-in', type: 'review' },
        ],
      },
      {
        name: 'Reflect',
        tasks: [
          { title: 'What changed for me', type: 'review' },
          { title: 'Keep what works', type: 'task' },
        ],
      },
    ],
  },

  personal_declutter: {
    label: 'Declutter & Organise',
    description: 'Clear the clutter, room by room, and build systems that keep it tidy.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Plan',
        tasks: [
          { title: 'List every space to tackle', type: 'task' },
          { title: 'Set keep / donate / bin rules', type: 'task' },
        ],
      },
      {
        name: 'Clear',
        tasks: [
          { title: 'Declutter — bedroom', type: 'task' },
          { title: 'Declutter — kitchen', type: 'task' },
          { title: 'Declutter — wardrobe', type: 'task' },
          { title: 'Declutter — digital files', type: 'task' },
        ],
      },
      {
        name: 'Organise',
        tasks: [
          { title: 'Set a home for everything', type: 'task' },
          { title: 'Donate / sell / recycle', type: 'task' },
        ],
      },
      {
        name: 'Maintain',
        tasks: [
          { title: 'Adopt a one-in-one-out rule', type: 'task' },
          { title: 'Schedule a monthly reset', type: 'task' },
        ],
      },
    ],
  },

  personal_network: {
    label: 'Build Relationships',
    description: 'Grow your network and nurture relationships with intent, not chance.',
    regulatoryRefs: '',
    group: 'Personal',
    phases: [
      {
        name: 'Map',
        tasks: [
          { title: 'List people I want to stay close to', type: 'task' },
          { title: 'Identify new connections to make', type: 'task' },
        ],
      },
      {
        name: 'Reach out',
        tasks: [
          { title: 'Reconnect with 5 old contacts', type: 'task' },
          { title: 'Attend an event / community', type: 'task' },
          { title: 'Offer help before asking', type: 'task' },
        ],
      },
      {
        name: 'Nurture',
        tasks: [
          { title: 'Schedule regular check-ins', type: 'task' },
          { title: 'Remember the important dates', type: 'task' },
          { title: 'Follow up on conversations', type: 'review' },
        ],
      },
    ],
  },

  /* ── Additional Life Sciences lifecycles ────────────────────────────────── */

  regulatory_submission: {
    label: 'Regulatory Submission',
    description:
      'End-to-end lifecycle for preparing and filing a regulatory dossier through to agency approval.',
    regulatoryRefs: 'ICH M4 (CTD), 21 CFR Parts 312/314, EU CTR',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Planning',
        tasks: [
          { title: 'Define submission type & target agency', type: 'task', qa: true, gxp: true },
          { title: 'Draft submission project plan & timeline', type: 'task', qa: true, gxp: true },
          { title: 'Assign authors and reviewers per module', type: 'task', qa: true },
          { title: 'Regulatory intelligence review', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Dossier Preparation',
        tasks: [
          {
            title: 'Compile Module 1 — Regional administrative information',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Compile Module 2 — Summaries & overviews', type: 'task', qa: true, gxp: true },
          { title: 'Compile Module 3 — Quality (CMC)', type: 'task', qa: true, gxp: true },
          { title: 'Compile Modules 4 & 5 — Non-clinical & Clinical', type: 'task', qa: true, gxp: true },
          {
            title: 'Data integrity check across all modules (ALCOA+)',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
        ],
      },
      {
        name: 'Internal Review',
        tasks: [
          {
            title: 'Cross-functional dossier review (QA, Medical, Regulatory)',
            type: 'review',
            qa: true,
            gxp: true,
          },
          { title: 'Resolve review comments & gap closure', type: 'task', qa: true, gxp: true },
          { title: 'QA sign-off on submission package', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Regulatory Filing',
        tasks: [
          { title: 'Publish & format dossier (eCTD / paper)', type: 'task', qa: true, gxp: true },
          { title: 'Agency submission & acknowledgement receipt', type: 'task', qa: true, gxp: true },
          { title: 'Log submission in tracking system', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Response Management',
        tasks: [
          { title: 'Track agency questions & clock stops', type: 'task', qa: true, gxp: true },
          { title: 'Prepare & review responses to agency queries', type: 'review', qa: true, gxp: true },
          { title: 'QA approval of responses before submission', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Approval',
        tasks: [
          { title: 'Receive & review agency approval letter / label', type: 'review', qa: true, gxp: true },
          { title: 'Update submission tracker & notify stakeholders', type: 'task', qa: true },
          { title: 'Archive approved dossier (GxP records)', type: 'task', qa: true, gxp: true },
        ],
      },
    ],
  },

  computer_system_retirement: {
    label: 'System Retirement',
    description:
      'Controlled decommissioning of a validated GxP computerized system — data migration through final closure.',
    regulatoryRefs: 'GAMP 5, EU Annex 11 §17, 21 CFR Part 11',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Feasibility',
        tasks: [
          { title: 'Retirement rationale & business case', type: 'task', qa: true, gxp: true },
          { title: 'Inventory of GxP data & records held in system', type: 'task', qa: true, gxp: true },
          { title: 'Regulatory data retention requirements review', type: 'review', qa: true, gxp: true },
          { title: 'Impact assessment on validated state', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Data Migration Plan',
        tasks: [
          { title: 'Data migration / archival strategy document', type: 'task', qa: true, gxp: true },
          { title: 'QA review & approval of migration plan', type: 'approval', qa: true, gxp: true },
          { title: 'Data migration qualification protocol (OQ / PQ)', type: 'task', qa: true, gxp: true },
          { title: 'Execute data migration test run in non-prod', type: 'test', qa: true, gxp: true },
        ],
      },
      {
        name: 'Cutover Planning',
        tasks: [
          { title: 'Define cutover date & communication plan', type: 'task', qa: true, gxp: true },
          { title: 'Update SOPs to remove references to retiring system', type: 'task', qa: true, gxp: true },
          { title: 'Training on replacement system / process', type: 'task', qa: true },
          { title: 'Change Control Board approval to retire', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Go-Live',
        tasks: [
          { title: 'Execute production data migration', type: 'task', qa: true, gxp: true },
          {
            title: 'Verify data completeness & integrity post-migration',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          { title: 'Disable / decommission system access', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Hypercare',
        tasks: [
          { title: 'Monitor for data retrieval issues (30 days)', type: 'task', qa: true, gxp: true },
          { title: 'Address post-migration findings', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Closure',
        tasks: [
          { title: 'Retirement summary report', type: 'approval', qa: true, gxp: true },
          {
            title: 'QA closure sign-off & archive retirement documentation',
            type: 'approval',
            qa: true,
            gxp: true,
          },
          { title: 'Update validated systems inventory', type: 'task', qa: true, gxp: true },
        ],
      },
    ],
  },

  incident_management: {
    label: 'Incident Management',
    description:
      'Structured GxP incident response — from detection and triage through root cause, CAPA, and closure review.',
    regulatoryRefs: 'ICH Q10, 21 CFR 211.192, EU GMP Chapter 3',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Detection & Triage',
        tasks: [
          {
            title: 'Log incident with timestamp, description & reporter',
            type: 'deviation',
            qa: true,
            gxp: true,
          },
          { title: 'Initial severity triage (minor / major / critical)', type: 'task', qa: true, gxp: true },
          { title: 'Notify QA and relevant stakeholders', type: 'task', qa: true, gxp: true },
          { title: 'Preliminary regulatory reportability assessment', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Investigation',
        tasks: [
          { title: 'Assign incident owner & target closure date', type: 'task', qa: true },
          { title: 'Gather evidence & timeline reconstruction', type: 'task', qa: true, gxp: true },
          { title: 'Impact assessment on product, batch or system', type: 'review', qa: true, gxp: true },
          { title: 'Review trend data & comparable incidents', type: 'data_review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Root Cause Analysis',
        tasks: [
          { title: 'Root cause analysis (5-Why / Ishikawa)', type: 'review', qa: true, gxp: true },
          { title: 'Confirm root cause with supporting evidence', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Containment',
        tasks: [
          { title: 'Implement immediate containment actions', type: 'task', qa: true, gxp: true },
          { title: 'Quarantine affected material / data if applicable', type: 'task', qa: true, gxp: true },
          { title: 'Document containment evidence', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'CAPA Implementation',
        tasks: [
          { title: 'Define corrective actions & assign owners', type: 'capa', qa: true, gxp: true },
          { title: 'Define preventive actions', type: 'capa', qa: true, gxp: true },
          { title: 'Execute CAPAs & collect evidence', type: 'task', qa: true, gxp: true },
          { title: 'Update SOPs / training as required', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Closure & Review',
        tasks: [
          { title: 'Effectiveness check of implemented CAPAs', type: 'review', qa: true, gxp: true },
          { title: 'QA closure approval & sign-off', type: 'approval', qa: true, gxp: true },
          { title: 'Regulatory reporting (if required)', type: 'task', qa: true, gxp: true },
          { title: 'Add to incident trend register', type: 'task', qa: true, gxp: true },
        ],
      },
    ],
  },

  vendor_qualification: {
    label: 'Vendor Qualification',
    description:
      'Qualify a supplier or service provider for GxP use — from requisition through approved supplier list.',
    regulatoryRefs: 'ICH Q10, EU GMP Chapter 7, 21 CFR 211.68 / 211.84',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Requisition',
        tasks: [
          {
            title: 'Define vendor requirements & criticality classification',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Identify candidate vendors & request documentation', type: 'task', qa: true },
          {
            title: 'Preliminary desk-based assessment (ISO certs, references)',
            type: 'review',
            qa: true,
            gxp: true,
          },
        ],
      },
      {
        name: 'Audit Planning',
        tasks: [
          { title: 'Draft audit plan & questionnaire', type: 'task', qa: true, gxp: true },
          { title: 'QA review & approval of audit plan', type: 'approval', qa: true, gxp: true },
          { title: 'Schedule on-site / remote audit with vendor', type: 'task', qa: true },
        ],
      },
      {
        name: 'On-site Audit',
        tasks: [
          { title: 'Opening meeting & facility walkthrough', type: 'task', qa: true, gxp: true },
          { title: 'Review QMS documentation & SOPs', type: 'review', qa: true, gxp: true },
          { title: 'Record audit findings & observations', type: 'audit_finding', qa: true, gxp: true },
          { title: 'Closing meeting — share preliminary findings', type: 'task', qa: true },
        ],
      },
      {
        name: 'Gap Assessment',
        tasks: [
          {
            title: 'Classify findings (critical / major / minor / observation)',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Request vendor CAPA responses', type: 'capa', qa: true, gxp: true },
          { title: 'Review & accept vendor CAPA commitments', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Qualification Report',
        tasks: [
          { title: 'Draft vendor qualification report', type: 'task', qa: true, gxp: true },
          { title: 'QA review of qualification report', type: 'review', qa: true, gxp: true },
        ],
      },
      {
        name: 'Approval',
        tasks: [
          {
            title: 'QA approval to qualify / conditionally qualify / reject',
            type: 'approval',
            qa: true,
            gxp: true,
          },
          { title: 'Add to Approved Supplier List (ASL)', type: 'task', qa: true, gxp: true },
          { title: 'Set re-qualification frequency', type: 'task', qa: true, gxp: true },
        ],
      },
    ],
  },

  training_program: {
    label: 'Training Program',
    description:
      'Design, deliver and evaluate a GxP training program — from needs assessment through effectiveness review.',
    regulatoryRefs: '21 CFR Part 211.68, ICH Q10, EU GMP Annex 2',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Needs Assessment',
        tasks: [
          { title: 'Identify training gap / regulatory requirement', type: 'task', qa: true, gxp: true },
          { title: 'Define target audience & learning objectives', type: 'task', qa: true },
          { title: 'Select delivery format (ILT / eLearning / OJT)', type: 'task', qa: true },
          { title: 'QA approval of training scope', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Content Development',
        tasks: [
          { title: 'Develop training materials & knowledge checks', type: 'task', qa: true, gxp: true },
          { title: 'SME review of content accuracy', type: 'review', qa: true, gxp: true },
          { title: 'QA review of training package', type: 'review', qa: true, gxp: true },
          { title: 'QA approval of final training materials', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Pilot Delivery',
        tasks: [
          { title: 'Run pilot session with representative audience', type: 'test', qa: true },
          { title: 'Collect pilot feedback', type: 'data_review', qa: true },
          { title: 'Incorporate feedback & update materials', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Evaluation',
        tasks: [
          { title: 'Assess trainee knowledge (pre/post quiz, practical)', type: 'test', qa: true, gxp: true },
          { title: 'Record attendance & completion in training system', type: 'task', qa: true, gxp: true },
          { title: 'Escalate incomplete trainees to line managers', type: 'task', qa: true },
        ],
      },
      {
        name: 'Rollout',
        tasks: [
          { title: 'Deliver to full target audience', type: 'task', qa: true, gxp: true },
          { title: 'Archive signed training records (21 CFR Part 11)', type: 'task', qa: true, gxp: true },
          { title: 'Update training matrix / SOP cross-reference', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Effectiveness Review',
        tasks: [
          { title: 'Effectiveness check (3–6 months post-training)', type: 'review', qa: true, gxp: true },
          {
            title: 'Review deviation / error trends linked to training area',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          { title: 'QA closure sign-off', type: 'approval', qa: true, gxp: true },
        ],
      },
    ],
  },

  product_recall: {
    label: 'Product Recall',
    description:
      'Regulated product recall lifecycle — from alert and agency notification through root cause and prevention.',
    regulatoryRefs: '21 CFR Part 7, EU GMP Chapter 8, ICH Q10',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Alert & Assessment',
        tasks: [
          {
            title: 'Receive & log recall trigger (complaint / field signal / internal test)',
            type: 'deviation',
            qa: true,
            gxp: true,
          },
          { title: 'Assemble recall committee (QA, RA, Medical, Legal, Ops)', type: 'task', qa: true },
          { title: 'Classify recall class (I / II / III) and scope', type: 'task', qa: true, gxp: true },
          {
            title: 'Identify affected lots / batches / distribution scope',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
        ],
      },
      {
        name: 'Regulatory Notification',
        tasks: [
          {
            title: 'Notify competent authority within required timeframe',
            type: 'task',
            qa: true,
            gxp: true,
          },
          {
            title: 'Prepare & submit press release / public notification (if required)',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Confirm regulatory receipt & obtain case reference', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Customer Notification',
        tasks: [
          {
            title: 'Issue recall letters to distributors / pharmacies / hospitals',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Track acknowledgement receipts from recipients', type: 'task', qa: true, gxp: true },
          { title: 'Set up recall hotline / FAQ for customer queries', type: 'task', qa: true },
        ],
      },
      {
        name: 'Recovery Coordination',
        tasks: [
          { title: 'Coordinate product retrieval from the field', type: 'task', qa: true, gxp: true },
          {
            title: 'Track returned inventory & reconciliation (% recovered)',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          {
            title: 'Quarantine & destruction / disposition of recalled product',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Submit interim progress report to authority', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Root Cause',
        tasks: [
          { title: 'Root cause analysis of underlying defect', type: 'review', qa: true, gxp: true },
          { title: 'Impact assessment on remaining in-market product', type: 'review', qa: true, gxp: true },
          { title: 'Define CAPAs to prevent recurrence', type: 'capa', qa: true, gxp: true },
        ],
      },
      {
        name: 'Prevention & Closure',
        tasks: [
          { title: 'Implement CAPAs & update SOPs / controls', type: 'task', qa: true, gxp: true },
          {
            title: 'Submit final recall effectiveness report to authority',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'QA closure sign-off & archive recall file', type: 'approval', qa: true, gxp: true },
          { title: 'Lessons-learned briefing to leadership', type: 'review', qa: true },
        ],
      },
    ],
  },

  discrepancy_qi: {
    label: 'Discrepancy',
    description:
      'End-to-end handling of a discrepancy — from detection and root cause through CAPA, remediation, and closure.',
    regulatoryRefs: '21 CFR Part 11, GAMP 5, ALCOA+',
    group: 'Life Sciences',
    phases: [
      {
        name: 'Detection & Logging',
        tasks: [
          {
            title: 'Log discrepancy with system, date, and observed vs expected behaviour',
            type: 'deviation',
            qa: true,
            gxp: true,
          },
          {
            title: 'Assign severity (critical / major / minor) and initial risk score',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Notify QA and system owner within SLA', type: 'task', qa: true, gxp: true },
          {
            title: 'Preserve system state — screenshots, log extracts, audit trail export',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
        ],
      },
      {
        name: 'Containment',
        tasks: [
          {
            title: 'Assess whether affected records are reliable or must be quarantined',
            type: 'review',
            qa: true,
            gxp: true,
          },
          {
            title: 'Quarantine or flag impacted data / transactions if required',
            type: 'task',
            qa: true,
            gxp: true,
          },
          { title: 'Determine if regulatory reporting is triggered', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'Root Cause Investigation',
        tasks: [
          { title: 'Reproduce issue in non-production environment', type: 'test', qa: true, gxp: true },
          { title: 'Root cause analysis (5-Why / Ishikawa)', type: 'review', qa: true, gxp: true },
          {
            title: 'Review validation documentation for gap (URS / FRS / test scripts)',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          { title: 'Determine if other systems or modules are affected', type: 'task', qa: true, gxp: true },
        ],
      },
      {
        name: 'CAPA Definition',
        tasks: [
          { title: 'Define corrective action (fix the root cause)', type: 'capa', qa: true, gxp: true },
          { title: 'Define preventive action (stop recurrence)', type: 'capa', qa: true, gxp: true },
          { title: 'Update risk register and control measures', type: 'task', qa: true, gxp: true },
          { title: 'QA review and approval of CAPA plan', type: 'approval', qa: true, gxp: true },
        ],
      },
      {
        name: 'Remediation & Testing',
        tasks: [
          { title: 'Implement fix / configuration change in dev / staging', type: 'task', gxp: true },
          {
            title: 'Execute regression test scripts covering affected functionality',
            type: 'test',
            qa: true,
            gxp: true,
          },
          { title: 'Re-test discrepancy scenario to confirm resolution', type: 'test', qa: true, gxp: true },
          {
            title: 'Update validation documentation (test summary, traceability matrix)',
            type: 'task',
            qa: true,
            gxp: true,
          },
        ],
      },
      {
        name: 'GxP Closure',
        tasks: [
          {
            title: 'Verify corrected data integrity in production audit trail',
            type: 'data_review',
            qa: true,
            gxp: true,
          },
          { title: 'QA sign-off with e-signature and justification', type: 'approval', qa: true, gxp: true },
          {
            title: 'Close discrepancy record with final disposition statement',
            type: 'task',
            qa: true,
            gxp: true,
          },
          {
            title: 'File in controlled document system; notify stakeholders',
            type: 'task',
            qa: true,
            gxp: true,
          },
        ],
      },
    ],
  },
};

export function listLifecycles() {
  return Object.entries(LIFECYCLES).map(([key, v]) => ({
    key: key as LifecycleKey,
    label: v.label,
    description: v.description,
    regulatoryRefs: v.regulatoryRefs,
    group: v.group,
    phaseCount: v.phases.length,
    taskCount: v.phases.reduce((a, p) => a + p.tasks.length, 0),
  }));
}
