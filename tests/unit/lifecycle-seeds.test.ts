import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LIFECYCLES, lifecycleTaskSeeds } from '../../src/lib/lifecycles';

describe('lifecycleTaskSeeds', () => {
  it('turns the generic lifecycle into the three first-day tasks', () => {
    const seeds = lifecycleTaskSeeds(LIFECYCLES.generic);
    assert.deepEqual(
      seeds.map((s) => s.title),
      ['Kick-off', 'Work item', 'Wrap-up & retrospective'],
    );
    assert.equal(seeds[0]?.taskType, 'task');
    assert.equal(seeds[2]?.taskType, 'review');
    assert.equal(seeds[0]?.phaseIndex, 0);
    assert.equal(seeds[2]?.phaseIndex, 2);
  });

  it('skips blank titles', () => {
    const seeds = lifecycleTaskSeeds({
      phases: [{ name: 'A', tasks: [{ title: '  ', type: 'task' }, { title: 'Real', type: 'approval' }] }],
    });
    assert.deepEqual(seeds, [{ phaseIndex: 0, title: 'Real', taskType: 'approval', position: 1 }]);
  });
});
