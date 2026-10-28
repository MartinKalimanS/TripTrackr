// Tests of the dependency-audit gate (step S-01). Run with `npm run test:scripts` (node --test).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blockingAdvisories, evaluateAudit } from './audit-gate.mjs';

const GHSA_A = 'GHSA-AAAA-BBBB-CCCC';
const GHSA_B = 'GHSA-DDDD-EEEE-FFFF';

const report = {
  vulnerabilities: {
    lodash: {
      via: [
        {
          source: 1,
          severity: 'high',
          title: 'Prototype pollution',
          url: `https://github.com/advisories/${GHSA_A}`,
        },
        {
          source: 2,
          severity: 'low',
          title: 'Minor',
          url: 'https://github.com/advisories/GHSA-low1-low1-low1',
        },
      ],
    },
    'a-wrapper': { via: ['lodash'] },
    tar: {
      via: [
        {
          source: 3,
          severity: 'critical',
          title: 'Arbitrary write',
          url: `https://github.com/advisories/${GHSA_B}`,
        },
      ],
    },
    shared: {
      via: [
        {
          source: 1,
          severity: 'high',
          title: 'Prototype pollution',
          url: `https://github.com/advisories/${GHSA_A}`,
        },
      ],
    },
  },
};

const NOW = new Date('2026-10-28T12:00:00Z');
const waiver = (id, expires) => ({
  id,
  reason: 'no fix upstream; not reachable',
  expires,
});

test('finds each high and critical advisory once, with every package it touches', () => {
  const found = blockingAdvisories(report);
  assert.deepEqual(found.map((a) => a.id).sort(), [GHSA_A, GHSA_B]);
  assert.deepEqual(found.find((a) => a.id === GHSA_A).packages.sort(), [
    'lodash',
    'shared',
  ]);
});

test('ignores low and moderate advisories and the "via" names of other packages', () => {
  const found = blockingAdvisories({
    vulnerabilities: {
      a: { via: ['b', { source: 9, severity: 'moderate', title: 'x', url: '' }] },
    },
  });
  assert.deepEqual(found, []);
});

test('with no allowlist every blocking advisory fails the gate', () => {
  const verdict = evaluateAudit(report, { entries: [] }, NOW);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.unwaived.length, 2);
});

test('a live waiver lets its advisory through, and only that one', () => {
  const verdict = evaluateAudit(report, { entries: [waiver(GHSA_A, '2026-12-31')] }, NOW);
  assert.deepEqual(
    verdict.unwaived.map((a) => a.id),
    [GHSA_B],
  );
  assert.equal(verdict.ok, false);
});

test('waiving both passes the gate', () => {
  const verdict = evaluateAudit(
    report,
    {
      entries: [waiver(GHSA_A, '2026-12-31'), waiver(GHSA_B.toLowerCase(), '2026-12-31')],
    },
    NOW,
  );
  assert.equal(verdict.ok, true);
});

test('a waiver that expired fails the gate again, naming it', () => {
  const verdict = evaluateAudit(
    report,
    { entries: [waiver(GHSA_A, '2026-10-01'), waiver(GHSA_B, '2026-12-31')] },
    NOW,
  );
  assert.equal(verdict.ok, false);
  assert.match(
    verdict.problems[0],
    new RegExp(`${GHSA_A}: the waiver expired on 2026-10-01`),
  );
  // And the advisory it waived is no longer waived.
  assert.deepEqual(
    verdict.unwaived.map((a) => a.id),
    [GHSA_A],
  );
});

test('a waiver is valid through the whole of its last day', () => {
  const lastDay = new Date('2026-12-31T20:00:00Z');
  const verdict = evaluateAudit(
    report,
    { entries: [waiver(GHSA_A, '2026-12-31'), waiver(GHSA_B, '2026-12-31')] },
    lastDay,
  );
  assert.equal(verdict.ok, true);
});

test('a malformed waiver (no reason, bad date) fails the gate', () => {
  const verdict = evaluateAudit(
    { vulnerabilities: {} },
    {
      entries: [
        { id: GHSA_A, expires: 'soon' },
        { id: GHSA_B, reason: 'x', expires: 'never' },
      ],
    },
    NOW,
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems.length, 2);
});

test('a clean report with no allowlist passes', () => {
  assert.equal(evaluateAudit({ vulnerabilities: {} }, { entries: [] }, NOW).ok, true);
});
