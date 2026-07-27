/**
 * Unit tests for the project-visibility filter — the query fragment that
 * decides which projects a viewer's queries can ever return.
 *
 * `projectsVisibleFilter` is pure (it only assembles a Mongo filter object),
 * so the invariants that matter most can be pinned without a database:
 *
 *  1. An unrestricted (admin) scope must still NEVER expose someone else's
 *     personal project — privacy survives workspace.view_all.
 *  2. A restricted (lead/contributor) scope must stay fenced to the viewer's
 *     own teams and ownership.
 *  3. Recurring Activities (isSystem) projects ARE visible as normal projects.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import mongoose from 'mongoose';

import {
  getLeadScope,
  projectsVisibleFilter,
  NOT_PERSONAL,
  NOT_SYSTEM,
  type LeadScope,
} from '../../src/lib/leadScope';

const oid = () => new mongoose.Types.ObjectId();

function makeScope(unrestricted: boolean): LeadScope {
  const userOid = oid();
  return { userOid, teamOids: [oid(), oid()], memberOids: [userOid], unrestricted };
}

describe('projectsVisibleFilter', () => {
  it('unrestricted scope sees shared + system projects; personal stays owner-only', () => {
    const scope = makeScope(true);
    const filter = projectsVisibleFilter(scope) as any;

    // Shape: { $or: [owner, NOT_PERSONAL] } — no NOT_SYSTEM gate.
    assert.ok(filter.$or, 'unrestricted filter is owner-or-not-personal');
    assert.deepEqual(filter.$or[0], { ownerId: scope.userOid });
    assert.deepEqual(filter.$or[1], NOT_PERSONAL);
    assert.equal(filter.$and, undefined, 'system projects are not filtered out');
  });

  it('restricted scope is fenced to own teams + own projects (system included)', () => {
    const scope = makeScope(false);
    const filter = projectsVisibleFilter(scope) as any;

    assert.ok(filter.$and, 'restricted filter must AND personal + team fence');
    assert.equal(filter.$and.length, 2);
    const [personalRule, teamFence] = filter.$and;
    assert.deepEqual(personalRule.$or[0], { ownerId: scope.userOid });
    assert.deepEqual(personalRule.$or[1], NOT_PERSONAL);
    assert.deepEqual(teamFence.$or, [{ ownerId: scope.userOid }, { teamId: { $in: scope.teamOids } }]);
    // Ensure NOT_SYSTEM is not in the filter chain.
    assert.ok(
      !JSON.stringify(filter).includes('isSystem'),
      'recurring system projects must be listable',
    );
  });

  it('NOT_PERSONAL excludes both the flag and legacy PRSN- codes', () => {
    assert.deepEqual(NOT_PERSONAL.isPersonal, { $ne: true });
    assert.ok(String(NOT_PERSONAL.code.$not).includes('PRSN-'));
  });

  it('NOT_SYSTEM helper still exists for callers that need plumbing-only queries', () => {
    assert.deepEqual(NOT_SYSTEM, { isSystem: { $ne: true } });
  });
});

describe('getLeadScope — unrestricted is a flag, never an enumeration', () => {
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
