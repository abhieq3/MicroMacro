import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { blockedNeedsCause, namedBlockedCause } from '../../src/lib/blockedCause';

describe('namedBlockedCause', () => {
  it('trims and treats blank as empty', () => {
    assert.equal(namedBlockedCause('  QA review  '), 'QA review');
    assert.equal(namedBlockedCause('   '), '');
    assert.equal(namedBlockedCause(null), '');
    assert.equal(namedBlockedCause(undefined), '');
  });
});

describe('blockedNeedsCause', () => {
  it('requires a cause only when the status is blocked', () => {
    assert.equal(blockedNeedsCause('blocked', ''), true);
    assert.equal(blockedNeedsCause('blocked', '   '), true);
    assert.equal(blockedNeedsCause('blocked', 'Waiting on QA'), false);
    assert.equal(blockedNeedsCause('todo', ''), false);
    assert.equal(blockedNeedsCause('in_progress', null), false);
  });
});
