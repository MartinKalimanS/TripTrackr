/**
 * The comparison half of the parity guard, pinned on small inputs (feature 004,
 * T414): what counts as missing, what an allowlist entry must say, what binds the
 * baseline to its tag and when the unresolved count has drifted. The extractor
 * itself is in `testid-extractor.test.ts`, the tree in `testid-parity.test.ts`.
 */
import {
  BASELINE_REF,
  compareUnresolved,
  findMissing,
  formatMissing,
  validateAllowlist,
  validateBaseline,
} from '../scripts/lib/extract-ids';

describe('findMissing and formatMissing', () => {
  const baseline = {
    testIDs: ['a', 'b', 'c-<param>'],
    accessibilityLabels: ['Back', 'Cancel'],
  };
  const noAllowlist = { testIDs: [], accessibilityLabels: [] };

  it('reports nothing when the tree has every item (extras are fine)', () => {
    const current = {
      testIDs: ['a', 'b', 'c-<param>', 'new'],
      accessibilityLabels: ['Back', 'Cancel', 'Extra'],
    };
    expect(findMissing(baseline, current, noAllowlist)).toEqual({
      testIDs: [],
      accessibilityLabels: [],
    });
  });

  it('names every missing id and label', () => {
    const current = { testIDs: ['a'], accessibilityLabels: ['Back'] };
    const missing = findMissing(baseline, current, noAllowlist);
    expect(missing).toEqual({
      testIDs: ['b', 'c-<param>'],
      accessibilityLabels: ['Cancel'],
    });
    const message = formatMissing(missing);
    expect(message).toContain('testID');
    expect(message).toContain('- b');
    expect(message).toContain('- c-<param>');
    expect(message).toContain('accessibility label');
    expect(message).toContain('- Cancel');
    expect(message).toContain('testid-parity.allowlist.json');
  });

  it('lets the allowlist excuse an id, by id and not by reason', () => {
    const current = { testIDs: ['a'], accessibilityLabels: ['Back', 'Cancel'] };
    const allowlist = {
      testIDs: [{ id: 'b', reason: 'Replaced by c-<param> in T432' }],
      accessibilityLabels: [],
    };
    expect(findMissing(baseline, current, allowlist)).toEqual({
      testIDs: ['c-<param>'],
      accessibilityLabels: [],
    });
  });

  it('prints nothing when nothing is missing', () => {
    expect(formatMissing({ testIDs: [], accessibilityLabels: [] })).toBe('');
  });
});

describe('validateAllowlist', () => {
  const baseline = { testIDs: ['a'], accessibilityLabels: ['Back'] };
  const current = { testIDs: [], accessibilityLabels: [] };

  it('accepts the empty allowlist', () => {
    expect(
      validateAllowlist({ testIDs: [], accessibilityLabels: [] }, baseline, current),
    ).toEqual([]);
  });

  it('accepts an entry with a reason for an id that is gone', () => {
    const allowlist = {
      testIDs: [{ id: 'a', reason: 'Removed with the old picker (T440)' }],
      accessibilityLabels: [],
    };
    expect(validateAllowlist(allowlist, baseline, current)).toEqual([]);
  });

  it.each([
    ['a bare string', { testIDs: ['a'], accessibilityLabels: [] }],
    ['an empty reason', { testIDs: [{ id: 'a', reason: ' ' }], accessibilityLabels: [] }],
    ['a missing reason', { testIDs: [{ id: 'a' }], accessibilityLabels: [] }],
    ['a missing list', { testIDs: [] }],
  ])('rejects %s', (_name, allowlist) => {
    expect(validateAllowlist(allowlist, baseline, current)).not.toEqual([]);
  });

  it('rejects an id that was never in the baseline (a typo excuses nothing)', () => {
    const allowlist = {
      testIDs: [{ id: 'typo', reason: 'Gone in T440' }],
      accessibilityLabels: [],
    };
    expect(validateAllowlist(allowlist, baseline, current).join('\n')).toContain('typo');
  });

  it('rejects an entry whose id is back in the tree (delete it)', () => {
    const allowlist = {
      testIDs: [{ id: 'a', reason: 'Temporary until T440' }],
      accessibilityLabels: [],
    };
    const restored = { testIDs: ['a'], accessibilityLabels: [] };
    expect(validateAllowlist(allowlist, baseline, restored).join('\n')).toContain('a');
  });
});

describe('compareUnresolved', () => {
  const occurrence = (line: number, name = 'testID') => ({
    path: 'src/x.tsx',
    line,
    name,
    text: 'testID',
  });
  const found = {
    testIDs: [occurrence(3), occurrence(9)],
    accessibilityLabels: [occurrence(5, 'accessibilityLabel')],
  };

  it('says nothing when the stored counts are right', () => {
    expect(compareUnresolved({ testIDs: 2, accessibilityLabels: 1 }, found)).toBe('');
  });

  it('names the occurrences when the number grew', () => {
    const message = compareUnresolved({ testIDs: 1, accessibilityLabels: 1 }, found);
    expect(message).toContain('testIDs');
    expect(message).toContain('1 stored, 2 found');
    expect(message).toContain('src/x.tsx:3');
    expect(message).toContain('src/x.tsx:9');
    expect(message).toContain('testid-unresolved-count.json');
  });

  it('asks for a lower stored number when it shrank', () => {
    const message = compareUnresolved({ testIDs: 2, accessibilityLabels: 4 }, found);
    expect(message).toContain('accessibility labels');
    expect(message).toContain('4 stored, 1 found');
    expect(message).toContain('lower');
  });
});

describe('validateAllowlist: a reason that can be audited', () => {
  const baseline = { testIDs: ['a', 'b'], accessibilityLabels: ['Back'] };
  const current = { testIDs: [], accessibilityLabels: [] };
  const problemsFor = (allowlist: unknown) =>
    validateAllowlist(allowlist, baseline, current).join('\n');

  it('wants a task id in the reason', () => {
    const none = { testIDs: [{ id: 'a', reason: 'Replaced by the new picker' }] };
    expect(problemsFor({ ...none, accessibilityLabels: [] })).toContain('task id');
    const bad = { testIDs: [{ id: 'a', reason: 'See T12 and t4321' }] };
    expect(problemsFor({ ...bad, accessibilityLabels: [] })).toContain('task id');
    const ok = { testIDs: [{ id: 'a', reason: 'Dropped with the old picker, T440' }] };
    expect(problemsFor({ ...ok, accessibilityLabels: [] })).toBe('');
  });

  it('rejects the same id twice in one list', () => {
    const allowlist = {
      testIDs: [
        { id: 'a', reason: 'T440 first' },
        { id: 'a', reason: 'T441 again' },
      ],
      accessibilityLabels: [],
    };
    expect(problemsFor(allowlist)).toContain('listed twice');
  });

  it('allows one id in each list', () => {
    const shared = { testIDs: ['Back'], accessibilityLabels: ['Back'] };
    const allowlist = {
      testIDs: [{ id: 'Back', reason: 'T440 one' }],
      accessibilityLabels: [{ id: 'Back', reason: 'T440 two' }],
    };
    expect(validateAllowlist(allowlist, shared, current)).toEqual([]);
  });

  it('rejects an unknown key at the top level and in an entry', () => {
    const top = { testIDs: [], accessibilityLabels: [], notes: [] };
    expect(problemsFor(top)).toContain('"notes"');
    const entry = {
      testIDs: [{ id: 'a', reason: 'T440 gone', until: '2026-01-01' }],
      accessibilityLabels: [],
    };
    expect(problemsFor(entry)).toContain('"until"');
  });

  it.each([null, 'text', 3, []])('rejects %j as the whole allowlist', (allowlist) => {
    expect(problemsFor(allowlist)).not.toBe('');
  });
});

describe('validateBaseline: bound to the tag', () => {
  const sha = 'a'.repeat(40);
  const lists = { testIDs: ['a', 'b'], accessibilityLabels: ['Back'] };
  const good = { source: { ref: BASELINE_REF, sha }, ...lists };

  it('names the tag the baseline must come from', () => {
    expect(BASELINE_REF).toBe('pre-004-baseline');
  });

  it('accepts a baseline taken from the tag', () => {
    expect(validateBaseline(good)).toEqual([]);
  });

  it.each([
    ['no source', { ...lists }],
    ['another ref', { ...good, source: { ref: 'main', sha } }],
    ['a short sha', { ...good, source: { ref: BASELINE_REF, sha: 'abc1234' } }],
    [
      'an upper-case sha',
      { ...good, source: { ref: BASELINE_REF, sha: 'A'.repeat(40) } },
    ],
    ['a non-hex sha', { ...good, source: { ref: BASELINE_REF, sha: 'g'.repeat(40) } }],
    ['a sha with a suffix', { ...good, source: { ref: BASELINE_REF, sha: `${sha}0` } }],
    ['an unsorted list', { ...good, testIDs: ['b', 'a'] }],
    ['a duplicate', { ...good, accessibilityLabels: ['Back', 'Back'] }],
    ['a non-string item', { ...good, testIDs: ['a', 3] }],
    ['an unknown key', { ...good, extra: true }],
    ['not an object', 'text'],
  ])('rejects %s', (_name, baseline) => {
    expect(validateBaseline(baseline)).not.toEqual([]);
  });
});
