/**
 * Unit tests for the project-visibility filter — the query fragment that
 * decides which projects a viewer's queries can ever return.
 *
 * `projectsVisibleFilter` is pure (it only assembles a Mongo filter object),
 * so the two invariants that matter most can be pinned without a database:
 *
 *  1. An unrestricted (admin) scope must still NEVER expose someone else's
 *     personal project — privacy survives workspace.view_all.
 *  2. A restricted (lead/contributor) scope must stay fenced to the viewer's
 *     own teams and ownership.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';

import { getLeadScope, projectsVisibleFilter, NOT_PERSONAL, type LeadScope } from '../../src/lib/leadScope';

const oid = () => new mongoose.Types.ObjectId();

function makeScope(unrestricted: boolean): LeadScope {
  const userOid = oid();
  return { userOid, teamOids: [oid(), oid()], memberOids: [userOid], unrestricted };
}

describe('projectsVisibleFilter', () => {
  it('unrestricted scope sees all shared projects, but personal stays owner-only', () => {
    const scope = makeScope(true);
    const filter = projectsVisibleFilter(scope) as any;

    // Shape: { $or: [ { ownerId: me }, NOT_PERSONAL ] } — no team fence,
    // but anything personal must match ownerId to be visible.
    assert.ok(filter.$or, 'unrestricted filter must be a plain $or');
    assert.equal(filter.$and, undefined, 'unrestricted filter must NOT fence by team');
    assert.deepEqual(filter.$or[0], { ownerId: scope.userOid });
    assert.deepEqual(filter.$or[1], NOT_PERSONAL);
  });

  it('restricted scope is fenced to own teams + own projects', () => {
    const scope = makeScope(false);
    const filter = projectsVisibleFilter(scope) as any;

    assert.ok(filter.$and, 'restricted filter must AND the personal rule with the team fence');
    const [personalRule, teamFence] = filter.$and;
    assert.deepEqual(personalRule.$or[0], { ownerId: scope.userOid });
    assert.deepEqual(personalRule.$or[1], NOT_PERSONAL);
    assert.deepEqual(teamFence.$or, [{ ownerId: scope.userOid }, { teamId: { $in: scope.teamOids } }]);
  });

  it('NOT_PERSONAL excludes both the flag and legacy PRSN- codes', () => {
    assert.deepEqual(NOT_PERSONAL.isPersonal, { $ne: true });
    assert.ok(String(NOT_PERSONAL.code.$not).includes('PRSN-'));
  });
});

describe('getLeadScope — unrestricted is a flag, never an enumeration', () => {
  // The scaling invariant (docs/SCALING.md rule #1): an admin's all-seeing
  // scope must not enumerate the workspace into id arrays that callers would
  // spread into $in clauses. The unrestricted path returns before any DB
  // query, which is also why this is testable without a database — if this
  // test starts needing Mongo, the invariant has been broken.
  it('returns empty id lists + the flag for admin/master_admin, with no DB call', async () => {
    for (const role of ['admin', 'master_admin']) {
      const scope = await getLeadScope(String(oid()), role);
      assert.equal(scope.unrestricted, true, `${role} must be unrestricted`);
      assert.equal(scope.teamOids.length, 0, `${role} must not enumerate teams`);
      assert.deepEqual(
        scope.memberOids.map(String),
        [String(scope.userOid)],
        `${role} memberOids must contain only the viewer`,
      );
    }
  });
});
