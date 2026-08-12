/**
 * Work memory — incremental learning from completed tasks.
 *
 * Pins the contract the UI depends on: stay silent until there are enough
 * samples, learn and forget without double-counting, and speak only in
 * counts and medians.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_SAMPLES,
  applyObservation,
  assembleFacts,
  emptyBucket,
  factFromBucket,
  factsFromCompletedTasks,
  keysForObservation,
  medianDays,
  observationFromTask,
  similarFromTokenBuckets,
  tokenize,
} from '../../src/lib/ai/workMemory';

const DAY = 86_400_000;
const NOW = new Date('2026-06-10T12:00:00Z');
const daysAgo = (n: number) => new Date(+NOW - n * DAY).toISOString();

function done(opts: {
  id: string;
  title?: string;
  assigneeId?: string;
  cycle: number;
  lateBy?: number | null;
  taskType?: string;
}) {
  const completed = daysAgo(1);
  const created = daysAgo(1 + opts.cycle);
  const due =
    opts.lateBy == null
      ? undefined
      : new Date(+new Date(completed) - opts.lateBy * DAY).toISOString();
  return {
    _id: opts.id,
    title: opts.title ?? 'SOP review for batch record',
    status: 'done',
    assigneeId: opts.assigneeId ?? 'u1',
    taskType: opts.taskType ?? 'task',
    createdAt: created,
    completedAt: completed,
    dueDate: due,
  };
}

describe('tokenize', () => {
  it('drops stop words and short tokens', () => {
    assert.deepEqual(tokenize('Review the SOP for a new batch'), ['sop', 'batch']);
  });
});

describe('observationFromTask', () => {
  it('skips private tasks and open tasks', () => {
    assert.equal(observationFromTask({ ...done({ id: 'a', cycle: 4 }), privateToUserId: 'x' }), null);
    assert.equal(observationFromTask({ ...done({ id: 'a', cycle: 4 }), status: 'todo', completedAt: null }), null);
  });

  it('records cycle and lateness from ccTcd / dueDate', () => {
    const onTime = observationFromTask(done({ id: 'a', cycle: 5, lateBy: -1 }))!;
    assert.equal(onTime.cycleDays, 5);
    assert.equal(onTime.dated, true);
    assert.equal(onTime.late, false);
    const late = observationFromTask(done({ id: 'b', cycle: 5, lateBy: 2 }))!;
    assert.equal(late.late, true);
  });
});

describe('applyObservation', () => {
  it('learns once per task id and forgets cleanly', () => {
    const obs = observationFromTask(done({ id: 't1', cycle: 4, lateBy: 0 }))!;
    let b = applyObservation(emptyBucket(), obs, 1);
    b = applyObservation(b, obs, 1); // duplicate
    assert.equal(b.n, 1);
    assert.equal(b.cycles.length, 1);
    b = applyObservation(b, obs, -1);
    assert.equal(b.n, 0);
    assert.equal(b.cycles.length, 0);
    assert.equal(b.seenTaskIds.length, 0);
    b = applyObservation(b, obs, -1); // forget twice is a no-op
    assert.equal(b.n, 0);
  });

  it('keeps the last 40 cycles', () => {
    let b = emptyBucket();
    for (let i = 0; i < 45; i++) {
      const obs = observationFromTask(done({ id: `t${i}`, cycle: 3, lateBy: 0 }))!;
      b = applyObservation(b, obs, 1);
    }
    assert.equal(b.n, 45);
    assert.equal(b.cycles.length, 40);
    assert.equal(b.seenTaskIds.length, 80 > 45 ? 45 : 80);
  });
});

describe('keysForObservation', () => {
  it('writes team + assignee + type + title tokens', () => {
    const obs = observationFromTask(done({ id: 't1', cycle: 3, title: 'SOP review batch' }))!;
    const keys = keysForObservation(obs);
    const kinds = new Set(keys.map((k) => k.kind));
    assert.ok(kinds.has('team'));
    assert.ok(kinds.has('assignee'));
    assert.ok(kinds.has('type'));
    assert.ok(kinds.has('token'));
    assert.ok(keys.some((k) => k.kind === 'token' && k.subject === 'sop'));
  });
});

describe('silence contract', () => {
  it('says nothing with fewer than MIN_SAMPLES', () => {
    const tasks = [done({ id: 'a', cycle: 4 }), done({ id: 'b', cycle: 6 })];
    const facts = factsFromCompletedTasks(tasks, { userId: 'u1' });
    assert.equal(facts.you, undefined);
    assert.deepEqual(facts.lines, []);
    assert.equal(MIN_SAMPLES, 3);
  });

  it('speaks after three completions, with a median and on-time count', () => {
    const tasks = [
      done({ id: 'a', cycle: 4, lateBy: 0 }),
      done({ id: 'b', cycle: 6, lateBy: 2 }),
      done({ id: 'c', cycle: 8, lateBy: 0 }),
    ];
    const facts = factsFromCompletedTasks(tasks, { userId: 'u1' });
    assert.ok(facts.you);
    assert.equal(facts.you!.medianDays, 6);
    assert.equal(facts.you!.samples, 3);
    assert.match(facts.you!.line, /~6 days/);
    assert.match(facts.you!.line, /2 of 3 dated tasks on time/);
    assert.ok(facts.lines.length >= 1);
  });
});

describe('similarFromTokenBuckets', () => {
  it('matches overlapping title tokens and names the last finisher', () => {
    const history = [
      done({ id: 'a', cycle: 5, title: 'SOP review batch record', assigneeId: 'priya' }),
      done({ id: 'b', cycle: 7, title: 'SOP review cleaning', assigneeId: 'priya' }),
      done({ id: 'c', cycle: 3, title: 'SOP update batch', assigneeId: 'arun' }),
    ];
    const facts = factsFromCompletedTasks(history, {
      title: 'SOP review for new batch',
      nameById: new Map([
        ['priya', 'Priya'],
        ['arun', 'Arun'],
      ]),
    });
    assert.ok(facts.similar);
    assert.match(facts.similar!.line, /Work like this usually takes/);
    assert.match(facts.similar!.line, /last finished by/);
  });
});

describe('medianDays', () => {
  it('returns null on empty and at least 1 on a real sample', () => {
    assert.equal(medianDays([]), null);
    assert.equal(medianDays([{ taskId: 'a', days: 0 }]), 1);
    assert.equal(
      medianDays([
        { taskId: 'a', days: 2 },
        { taskId: 'b', days: 8 },
      ]),
      5,
    );
  });
});

describe('factFromBucket', () => {
  it('stays silent without a usable cycle sample', () => {
    const b = emptyBucket();
    b.n = 5;
    assert.equal(factFromBucket('you', b), null);
  });
});

describe('assembleFacts', () => {
  it('orders you → similar → team and drops empties', () => {
    const bucket = applyObservation(
      applyObservation(
        applyObservation(emptyBucket(), observationFromTask(done({ id: 'a', cycle: 4 }))!, 1),
        observationFromTask(done({ id: 'b', cycle: 4 }))!,
        1,
      ),
      observationFromTask(done({ id: 'c', cycle: 4 }))!,
      1,
    );
    const facts = assembleFacts({ you: bucket, team: bucket, similar: bucket, similarWho: 'Priya' });
    assert.equal(facts.lines.length, 3);
    assert.match(facts.lines[0], /^You usually/);
    assert.match(facts.lines[1], /^Work like this/);
    assert.match(facts.lines[2], /^Completed work here/);
  });
});
