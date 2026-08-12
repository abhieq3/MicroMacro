// helpers to turn Mongoose docs into plain JSON-safe shapes

type Any = Record<string, any>;

function id(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v.toString) return v.toString();
  return undefined;
}

/**
 * Normalise any date-ish value to an ISO string (or null).
 *
 * This is critical for the server-rendered pages: when a serialized payload is
 * handed to a Client Component as a prop, React's Flight serialization
 * PRESERVES `Date` instances as real `Date` objects — unlike `JSON.stringify`
 * (the API path), which turns them into strings. Client code that does
 * `value.slice(0, 10)` on what it assumes is a string then throws
 * "slice is not a function" and crashes the page into the error boundary.
 * Forcing strings here keeps the SSR-seed and the API refetch byte-identical.
 */
export function date(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

export function u(user: any) {
  if (!user) return null;
  return {
    id: id(user._id),
    email: user.email,
    username: user.username || null,
    name: user.name,
    role: user.role === 'pm' ? 'lead' : user.role === 'employee' ? 'contributor' : user.role,
    employeeId: user.employeeId || '',
    // Directory facets — surfaced so people-pickers can group/filter by them
    // as the workspace grows. Empty strings mean "ungrouped" and the picker
    // bundles them under a fall-back heading.
    title: user.title || '',
    department: user.department || '',
    organisation: user.organisation || '',
    location: user.location || '',
    // Lock state — surfaced on the People page so admin/lead can see
    // who can't sign in and click Unlock. Not credential data.
    lockedAt: date(user.lockedAt),
    failedLoginAttempts: user.failedLoginAttempts || 0,
    // Account lifecycle. `active` defaults to true for legacy rows that
    // predate the field (undefined !== false). The deactivation metadata
    // gives the People page a professional record of who turned the
    // account off, when, and why.
    active: user.active !== false,
    deactivatedAt: date(user.deactivatedAt),
    deactivatedBy: user.deactivatedBy || '',
    deactivationReason: user.deactivationReason || '',
    reactivatedAt: date(user.reactivatedAt),
    // Monogram avatar — empty strings/0 mean "no override, use the
    // legacy name-derived initials + hashed gradient".
    avatarLetter: user.avatarLetter || '',
    avatarBg: user.avatarBg || '',
    avatarImage: user.avatarImage || '',
    avatarFont: typeof user.avatarFont === 'number' ? user.avatarFont : 0,
    soundDropEnabled: user.soundDropEnabled !== false,
    githubUrl: user.githubUrl || '',
    links: (user.links || [])
      .map((l: any) => ({ url: String(l?.url || ''), label: String(l?.label || '') }))
      .filter((l: any) => l.url),
    following: (user.following || []).map((id: any) => String(id)),
    // Real notification address (distinct from the synthetic login `email`) and
    // the per-user opt-in for the daily task-due digest. Surfaced so the
    // profile page can show where the digest goes and the People → Edit modal
    // can pre-fill the field. As sensitive as `email`, which is already exposed
    // here, so no broader leak than today's directory payload.
    notifyEmail: user.notifyEmail || '',
    notifDailyDigest: !!user.notifDailyDigest,
    digestHour: typeof user.digestHour === 'number' ? user.digestHour : null,
    digestMinute: typeof user.digestMinute === 'number' ? user.digestMinute : 0,
  };
}

export function team(t: any, extras: Any = {}) {
  if (!t) return null;
  return {
    id: id(t._id),
    name: t.name,
    description: t.description,
    leadId: id(t.leadId),
    function: t.function,
    memberIds: (t.memberIds || []).map((m: any) => id(m)),
    modules: {
      qms: { enabled: !!t.modules?.qms?.enabled },
      tickets: { enabled: !!t.modules?.tickets?.enabled },
      recurring: { enabled: !!t.modules?.recurring?.enabled },
    },
    ...extras,
  };
}

export function project(p: any, extras: Any = {}) {
  if (!p) return null;
  return {
    id: id(p._id),
    code: p.code,
    name: p.name,
    description: p.description,
    lifecycle: p.lifecycle,
    status: p.status,
    priority: p.priority,
    teamId: id(p.teamId),
    ownerId: id(p.ownerId),
    startDate: date(p.startDate),
    dueDate: date(p.dueDate),
    completedAt: date(p.completedAt),
    gxpImpact: p.gxpImpact,
    regulatoryRefs: p.regulatoryRefs,
    phases: (p.phases || []).map((ph: any) => ({
      id: id(ph._id),
      name: ph.name,
      position: ph.position,
    })),
    archived: !!p.archived,
    archivedAt: date(p.archivedAt),
    archivedBy: id(p.archivedBy),
    isPersonal: !!(p.isPersonal || p.personal),
    personal: !!(p.isPersonal || p.personal),
    ccNo: p.ccNo || '',
    refLabel: p.refLabel || '',
    createdAt: date(p.createdAt),
    ...extras,
  };
}

export function subtask(s: any) {
  return {
    id: id(s._id),
    title: s.title,
    assigneeId: id(s.assigneeId),
    status: s.status,
    dueDate: date(s.dueDate),
    completedAt: date(s.completedAt),
    position: s.position,
  };
}

export function comment(c: any) {
  return {
    id: id(c._id),
    userId: id(c.userId),
    body: c.body,
    createdAt: date(c.createdAt),
    updatedAt: date(c.updatedAt),
  };
}

export function task(t: any, extras: Any = {}) {
  if (!t) return null;
  return {
    id: id(t._id),
    projectId: id(t.projectId),
    phaseId: id(t.phaseId),
    title: t.title,
    description: t.description,
    assigneeId: id(t.assigneeId),
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    gxpCritical: !!t.gxpCritical,
    requiresQaSignoff: !!t.requiresQaSignoff,
    qaSignoffUserId: id(t.qaSignoffUserId),
    qaSignoffAt: date(t.qaSignoffAt),
    startDate: date(t.startDate),
    dueDate: date(t.dueDate),
    completedAt: date(t.completedAt),
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours,
    // Pharma fields
    ccNo: t.ccNo || '',
    ccTcd: date(t.ccTcd),
    documentNo: t.documentNo || '',
    applicableSite: t.applicableSite || 'na',
    deployStage: t.deployStage || 'na',
    remarks: t.remarks || '',
    pendingWith: t.pendingWith || '',
    privateToUserId: id(t.privateToUserId),
    isPrivate: !!t.privateToUserId,
    aiTriage: t.aiTriage
      ? {
          severity: t.aiTriage.severity,
          severityScore: t.aiTriage.severityScore,
          category: t.aiTriage.category,
          rationale: t.aiTriage.rationale,
          suggestedCapa: t.aiTriage.suggestedCapa,
          similarTaskIds: (t.aiTriage.similarTaskIds || []).map((x: any) => id(x)),
          computedAt: date(t.aiTriage.computedAt),
        }
      : null,
    subtasks: (t.subtasks || []).map(subtask),
    comments: (t.comments || []).map(comment),
    effortLog: (t.effortLog || []).map((e: any) => ({
      id: id(e._id),
      userId: id(e.userId),
      minutes: e.minutes,
      note: e.note || '',
      onDate: e.onDate || '',
      source: e.source || 'manual',
      createdAt: date(e.createdAt),
    })),
    effortMins: (t.effortLog || []).reduce((s: number, e: any) => s + (e.minutes || 0), 0),
    lastActivityAt: date(t.lastActivityAt || t.updatedAt || t.createdAt),
    // Flow Signal — confirmed waiting state. Only the *confirmed* fields are
    // exposed to the client; raw prompt-history fields (cooldowns, last-shown
    // reason codes) stay server-side per the spec's privacy contract.
    flowPendingType: t.flowPendingType || null,
    flowPendingDetail: t.flowPendingDetail || '',
    flowPendingConfirmedAt: date(t.flowPendingConfirmedAt),
    flowPendingConfirmedByUserId: id(t.flowPendingConfirmedByUserId),
    flowResolvedAt: date(t.flowResolvedAt),
    position: t.position ?? 0,
    createdAt: date(t.createdAt),
    updatedAt: date(t.updatedAt),
    ...extras,
  };
}
