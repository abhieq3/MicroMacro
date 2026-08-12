import { Team } from '@/models/Team';
import mongoose from 'mongoose';
import { can } from '@/lib/permissions';

// Scope of records visible to the current viewer.
//
// Leads and contributors use actual team memberships — they see only projects
// where they are the owner or assigned to a team they lead/belong to. Admins
// hold `workspace.view_all` and get an unrestricted scope: every team, every
// shared project, every task. Personal projects remain invisible to everyone
// but their owner (enforced in projectsVisibleFilter), admin included.
export interface LeadScope {
  userOid: mongoose.Types.ObjectId;
  /** Teams in scope. EMPTY when `unrestricted` — an admin's scope is "all",
   *  expressed as a flag, never as an enumerated workspace-sized id list. */
  teamOids: mongoose.Types.ObjectId[];
  /** Union of memberIds across those teams (incl. the viewer). Same rule:
   *  empty-except-self when `unrestricted`. */
  memberOids: mongoose.Types.ObjectId[];
  unrestricted: boolean; // true for workspace.view_all roles (admin/master_admin)
}

export async function getLeadScope(userId: string, role?: string | null): Promise<LeadScope> {
  const userOid = new mongoose.Types.ObjectId(userId);

  // Admins see the whole workspace. Crucially, "the whole workspace" is a
  // FLAG, not a list: enumerating every team/member here and spreading the
  // result into $in clauses would make each admin request O(workspace) — the
  // first thing to fall over as an org grows. Consumers must branch on
  // `unrestricted` (drop the $in entirely) instead of trusting the arrays.
  const unrestricted = can(role, 'workspace.view_all');
  if (unrestricted) {
    return { userOid, teamOids: [], memberOids: [userOid], unrestricted: true };
  }

  // Everyone else sees the teams they lead OR belong to as a member.
  const teams = await Team.find(
    { $or: [{ leadId: userOid }, { memberIds: userOid }] },
    '_id memberIds',
  ).lean();

  const teamOids = teams.map((t) => t._id);

  // Build the member set — include the viewer themselves so their own tasks
  // always surface even before anyone is assigned to their team.
  const memberSet = new Set<string>([String(userOid)]);
  for (const t of teams) {
    for (const m of t.memberIds || []) memberSet.add(String(m));
  }
  const memberOids = [...memberSet].map((id) => new mongoose.Types.ObjectId(id));

  return { userOid, teamOids, memberOids, unrestricted: false };
}

// Matches projects that are NOT someone's private personal to-do list.
// A project is personal if isPersonal === true OR (legacy rows) its code
// starts with "PRSN-". Spread into any raw Project query that an admin or
// other user can see, to keep personal projects out of cross-user rollups.
export const NOT_PERSONAL = {
  // Defence in depth: a project is private if EITHER personal flag is set, or
  // (legacy) its code is PRSN-prefixed. Checking both `isPersonal` and the
  // duplicate `personal` field means the two can never disagree and leak a
  // private project into a cross-user rollup, even if one were edited directly.
  isPersonal: { $ne: true },
  personal: { $ne: true },
  code: { $not: /^PRSN-/ },
} as const;

// Mongo filter that returns true for every project the viewer can see.
// Pass as the first arg to Project.find / countDocuments / aggregate $match.
//
// Personal projects are private to their owner: they're only ever returned
// when the viewer owns them — never to another lead, and never to the admin
// (even though the admin otherwise sees everything).
export function projectsVisibleFilter(scope: LeadScope) {
  const minePersonalOrNotPersonal = {
    $or: [{ ownerId: scope.userOid }, NOT_PERSONAL],
  };
  if (scope.unrestricted) return minePersonalOrNotPersonal;
  return {
    $and: [
      minePersonalOrNotPersonal,
      { $or: [{ ownerId: scope.userOid }, { teamId: { $in: scope.teamOids } }] },
    ],
  };
}
