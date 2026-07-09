/**
 * Unit tests for initial-password issuance.
 *
 * Default path: random temps (not computable from org directory data).
 * Legacy path: FirstName@employeeId only when env latch is on.
 */

import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import {
  defaultPassword,
  canUseDefaultPassword,
  generateTempPassword,
  issueInitialPassword,
  predictableDefaultPasswordsEnabled,
} from '../../src/lib/defaultPassword';

describe('defaultPassword (legacy builder)', () => {
  it('builds FirstName@employeeId from a full name', () => {
    assert.equal(defaultPassword('Abhi Patel', '29218'), 'Abhi@29218');
  });

  it('uses only the first whitespace-delimited token of the name', () => {
    assert.equal(defaultPassword('  Mary Jane Watson ', 'E7'), 'Mary@E7');
  });

  it('trims the employee ID', () => {
    assert.equal(defaultPassword('Sam', '  42  '), 'Sam@42');
  });

  it('falls back to "User" when the name is empty', () => {
    assert.equal(defaultPassword('', '100'), 'User@100');
    assert.equal(defaultPassword('   ', '100'), 'User@100');
  });
});

describe('generateTempPassword', () => {
  it('returns a Pragati-prefixed random string', () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    assert.match(a, /^Pragati-[A-Za-z0-9]{10}$/);
    assert.match(b, /^Pragati-[A-Za-z0-9]{10}$/);
    assert.notEqual(a, b);
  });

  it('avoids ambiguous glyphs 0 O 1 l I', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateTempPassword();
      assert.doesNotMatch(p.slice('Pragati-'.length), /[0O1lI]/);
    }
  });
});

describe('issueInitialPassword — default (no env latch)', () => {
  const prev = process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD;

  before(() => {
    delete process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD;
  });

  after(() => {
    if (prev === undefined) delete process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD;
    else process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD = prev;
  });

  it('reports predictable latch off', () => {
    assert.equal(predictableDefaultPasswordsEnabled(), false);
  });

  it('never uses the legacy scheme when the latch is off', () => {
    assert.equal(canUseDefaultPassword('29218'), false);
    const issued = issueInitialPassword('Abhi Patel', '29218');
    assert.equal(issued.isDefault, false);
    assert.equal(issued.scheme, 'random');
    assert.match(issued.password, /^Pragati-/);
    assert.notEqual(issued.password, 'Abhi@29218');
  });
});

describe('issueInitialPassword — predictable latch on', () => {
  const prev = process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD;

  before(() => {
    process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD = '1';
  });

  after(() => {
    if (prev === undefined) delete process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD;
    else process.env.PRAGATI_PREDICTABLE_DEFAULT_PASSWORD = prev;
  });

  it('uses FirstName@employeeId when an ID is present', () => {
    assert.equal(canUseDefaultPassword('29218'), true);
    const issued = issueInitialPassword('Abhi Patel', '29218');
    assert.equal(issued.isDefault, true);
    assert.equal(issued.scheme, 'predictable');
    assert.equal(issued.password, 'Abhi@29218');
  });

  it('falls back to random when employee ID is missing', () => {
    assert.equal(canUseDefaultPassword(''), false);
    const issued = issueInitialPassword('Sam', '');
    assert.equal(issued.isDefault, false);
    assert.equal(issued.scheme, 'random');
    assert.match(issued.password, /^Pragati-/);
  });
});
