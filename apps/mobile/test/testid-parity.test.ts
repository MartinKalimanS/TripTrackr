/**
 * testID and accessible-name parity guard (feature 004, T414; FR-037, SC-003).
 *
 * The redesign rebuilds every screen's markup but must not rename or drop a
 * `testID` (the Maestro flows and the Jest suites find controls by it) or a
 * static accessible name (assistive-technology output is unchanged, FR-030).
 * `test/fixtures/testid-baseline.json` is the set extracted from the
 * `pre-004-baseline` tag by `scripts/testid-baseline.mjs`; this suite fails
 * when the working tree no longer carries one of its items, unless
 * `testid-parity.allowlist.json` records why.
 *
 * Part 1 pins the extractor itself on inline sources. Part 2 compares the tree.
 *
 * Allowlist schema (`test/testid-parity.allowlist.json`; JSON has no comments, so
 * it is described here). Both lists are required, and an entry is an object:
 *
 *   {
 *     "testIDs": [{ "id": "trip-card-<param>", "reason": "Why it went (task, PR)" }],
 *     "accessibilityLabels": [{ "id": "Plan a trip", "reason": "Why it went" }]
 *   }
 *
 * `id` is an item exactly as the baseline spells it (templates read
 * `trip-card-<param>`); `reason` must say why and point at the `tasks.md` note
 * and Maestro edit that FR-037 requires. An `id` the baseline never had, or one
 * the tree carries again, fails the suite: an exception must not outlive its
 * cause.
 *
 * Regenerating the baseline (only if the extractor itself changes; the tag is
 * the source of truth, never the working tree):
 *
 *   node scripts/testid-baseline.mjs --from pre-004-baseline \
 *     --write test/fixtures/testid-baseline.json
 *
 * The same comparison runs from the shell with
 * `node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json`.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  extractFromSources,
  findMissing,
  formatMissing,
  readWorkingTreeSources,
  validateAllowlist,
} from '../scripts/lib/extract-ids';

type Source = { path: string; text: string };

const tsx = (text: string, file = 'src/components/sample.tsx'): Source => ({
  path: file,
  text,
});

const extract = (...sources: Source[]) => extractFromSources(sources);

describe('extractor: testID forms', () => {
  it('reads a JSX string attribute', () => {
    const { testIDs } = extract(tsx('const a = <View testID="home-screen" />;'));
    expect(testIDs).toEqual(['home-screen']);
  });

  it('reads a string literal and a template without substitutions inside braces', () => {
    const { testIDs } = extract(
      tsx("const a = <View testID={'plain'} />; const b = <View testID={`quoted`} />;"),
    );
    expect(testIDs).toEqual(['plain', 'quoted']);
  });

  it('turns each substitution of a template into <param>', () => {
    const { testIDs } = extract(
      tsx(
        'const a = <View testID={`trip-card-${trip.id}`} />;' +
          'const b = <View testID={`stop-${a.id}-day-${b.day}`} />;' +
          'const c = <View testID={`add-expense-city-${cityKey(option.id)}`} />;',
      ),
    );
    expect(testIDs).toEqual([
      'add-expense-city-<param>',
      'stop-<param>-day-<param>',
      'trip-card-<param>',
    ]);
  });

  it('reads the branches of a conditional and the fallback of ??, not the tests', () => {
    const { testIDs } = extract(
      tsx(
        "const a = <View testID={isError ? 'photos-capture-error' : 'photos-capture-message'} />;" +
          'const b = <View testID={opts.id ?? `tab-${route.name}`} />;' +
          "const c = <View testID={kind === 'secret' ? `a-${x}` : undefined} />;",
      ),
    );
    expect(testIDs).toEqual([
      'a-<param>',
      'photos-capture-error',
      'photos-capture-message',
      'tab-<param>',
    ]);
  });

  it('reads object properties: plain, quoted key, template and conditional', () => {
    const { testIDs } = extract(
      tsx(
        "const a = { testID: 'home-plan-trip', label: 'x' };" +
          "const b = { 'testID': 'quoted-key' };" +
          'const c = { testID: `notes-filter-${target.key}`, other: 1 };' +
          "const d = { testID: ok ? 'yes' : 'no' };",
      ),
    );
    expect(testIDs).toEqual([
      'home-plan-trip',
      'no',
      'notes-filter-<param>',
      'quoted-key',
      'yes',
    ]);
  });

  it('ignores values it cannot see statically', () => {
    const { testIDs } = extract(
      tsx(
        'const a = <View testID={testID} />;' +
          'const b = <View testID={props.testID} />;' +
          'const c = <View testID={build(1)} />;' +
          'const d = { testID, other: 1 };' +
          'type P = { testID: string; other?: number };',
      ),
    );
    expect(testIDs).toEqual([]);
  });

  it('ignores empty ids and templates with no static text', () => {
    const { testIDs } = extract(
      tsx('const a = <View testID="" />; const b = <View testID={`${x}`} />;'),
    );
    expect(testIDs).toEqual([]);
  });

  it('ignores a testID that only appears in a comment or in JSX text', () => {
    const { testIDs } = extract(
      tsx(
        '// testID="in-line-comment"\n' +
          '/* testID: "in-block-comment" */\n' +
          'const a = <Text>It\'s testID="in-text" here</Text>;\n' +
          'const b = <View testID="real" />;',
      ),
    );
    expect(testIDs).toEqual(['real']);
  });

  it('follows a same-file const string or template through an identifier', () => {
    const { testIDs } = extract(
      tsx(
        'function Banner({ notice }) {' +
          '  const base = `conflict-notice-${notice.id}`;' +
          '  const fixed = "banner-fixed";' +
          '  return <>' +
          '    <View testID={base} />' +
          '    <View testID={`${base}-open`} />' +
          '    <View testID={`${fixed}-dismiss`} />' +
          '  </>;' +
          '}',
      ),
    );
    expect(testIDs).toEqual([
      'banner-fixed-dismiss',
      'conflict-notice-<param>',
      'conflict-notice-<param>-open',
    ]);
  });

  it('merges, sorts and de-duplicates across files', () => {
    const { testIDs } = extract(
      tsx('const a = <View testID="b-id" />;', 'src/app/one.tsx'),
      tsx("const a = { testID: 'a-id' }; const b = { testID: 'b-id' };", 'src/b.ts'),
    );
    expect(testIDs).toEqual(['a-id', 'b-id']);
  });
});

describe('extractor: FormActions testIDPrefix', () => {
  const formActions = tsx(
    'export function FormActions({ testIDPrefix }) {' +
      '  return <>' +
      '    <Pressable testID={`${testIDPrefix}-cancel`} />' +
      '    <Pressable testID={`${testIDPrefix}-save`} />' +
      '  </>;' +
      '}',
    'src/components/ui/form-actions.tsx',
  );

  it('derives <prefix>-cancel and <prefix>-save for every call site', () => {
    const { testIDs } = extract(
      formActions,
      tsx(
        'const a = <FormActions testIDPrefix="add-trip" />;',
        'src/app/modal/add-trip.tsx',
      ),
      tsx("const a = <FormActions testIDPrefix={'note-editor'} />;", 'src/n.tsx'),
    );
    expect(testIDs).toEqual([
      'add-trip-cancel',
      'add-trip-save',
      'note-editor-cancel',
      'note-editor-save',
    ]);
  });

  it('does not report the <param>-cancel template itself', () => {
    const { testIDs } = extract(formActions);
    expect(testIDs).toEqual([]);
  });

  it('follows the suffixes the component actually builds', () => {
    const renamed = tsx(
      'export const F = ({ testIDPrefix }) => <P testID={`${testIDPrefix}-dismiss`} />;',
      'src/components/ui/form-actions.tsx',
    );
    const { testIDs } = extract(renamed, tsx('const a = <F testIDPrefix="x" />;'));
    expect(testIDs).toEqual(['x-dismiss']);
  });

  it('derives nothing when no component builds ids from the prefix', () => {
    const { testIDs } = extract(
      tsx('const a = <FormActions testIDPrefix="add-trip" />;'),
    );
    expect(testIDs).toEqual([]);
  });
});

describe('extractor: accessibility labels', () => {
  it('reads string attributes, braced strings and object properties', () => {
    const { accessibilityLabels } = extract(
      tsx(
        'const a = <Pressable accessibilityLabel="Cancel" />;' +
          "const b = <Pressable accessibilityLabel={'Plan a trip'} />;" +
          "const c = { accessibilityLabel: 'Show all' };" +
          "const d = { 'accessibilityLabel': 'Quoted' };",
      ),
    );
    expect(accessibilityLabels).toEqual(['Cancel', 'Plan a trip', 'Quoted', 'Show all']);
  });

  it('normalises templates and reads conditionals like testIDs do', () => {
    const { accessibilityLabels } = extract(
      tsx(
        'const a = <P accessibilityLabel={`Move ${place} up`} />;' +
          "const b = <P accessibilityLabel={shown ? 'Hide summary' : 'Show summary'} />;" +
          "const c = <P accessibilityLabel={`${a}, ${b ? `, ${c}` : ', fallback'}`} />;",
      ),
    );
    expect(accessibilityLabels).toEqual([
      '<param>, <param>',
      'Hide summary',
      'Move <param> up',
      'Show summary',
    ]);
  });

  it('ignores dynamic labels', () => {
    const { accessibilityLabels } = extract(
      tsx(
        'const a = <P accessibilityLabel={label} />;' +
          'const b = <P accessibilityLabel={COPY.retry} />;' +
          'const c = { accessibilityLabel: option.label };' +
          'type T = { accessibilityLabel: string };',
      ),
    );
    expect(accessibilityLabels).toEqual([]);
  });

  it('keeps testIDs and labels in separate lists', () => {
    const result = extract(tsx('const a = <P testID="t" accessibilityLabel="L" />;'));
    expect(result).toEqual({ testIDs: ['t'], accessibilityLabels: ['L'] });
  });
});

describe('extractor: copy constants', () => {
  const copy = tsx(
    'export const GALLERY_COPY = {' +
      "  addLabel: 'Add photos'," +
      "  'close-label': 'Close photo'," +
      '  retry: `Retry ${what}`,' +
      '  count: 3,' +
      '  nested: { deep: "Deep" },' +
      '} as const;' +
      'export const KIND_LABELS: Readonly<Record<Kind, string>> = {' +
      "  boarding: 'Boarding pass', hotel: 'Hotel booking' };",
    'src/features/photos/photo-copy.ts',
  );

  it('resolves NAME.key to a module-level object of strings, even across files', () => {
    const { accessibilityLabels } = extract(
      copy,
      tsx(
        'const a = <P accessibilityLabel={GALLERY_COPY.addLabel} />;' +
          "const b = <P accessibilityLabel={GALLERY_COPY['close-label']} />;" +
          'const c = <P accessibilityLabel={GALLERY_COPY.retry} />;',
      ),
    );
    expect(accessibilityLabels).toEqual(['Add photos', 'Close photo', 'Retry <param>']);
  });

  it('resolves NAME[expression] to every value of the object', () => {
    const { accessibilityLabels } = extract(
      copy,
      tsx('const a = <P accessibilityLabel={KIND_LABELS[kind]} />;'),
    );
    expect(accessibilityLabels).toEqual(['Boarding pass', 'Hotel booking']);
  });

  it('works for testIDs too', () => {
    const ids = tsx("export const IDS = { go: 'home-go' };", 'src/features/ids.ts');
    const { testIDs } = extract(ids, tsx('const a = <P testID={IDS.go} />;'));
    expect(testIDs).toEqual(['home-go']);
  });

  it('ignores what it cannot read: unknown objects, non-strings, nested objects', () => {
    const { accessibilityLabels } = extract(
      copy,
      tsx(
        'const a = <P accessibilityLabel={OTHER.addLabel} />;' +
          'const b = <P accessibilityLabel={GALLERY_COPY.count} />;' +
          'const c = <P accessibilityLabel={GALLERY_COPY.nested.deep} />;' +
          'const d = <P accessibilityLabel={GALLERY_COPY.missing} />;' +
          'function f() { return { accessibilityLabel: props.label }; }',
      ),
    );
    expect(accessibilityLabels).toEqual([]);
  });

  it('does not read objects declared inside a function', () => {
    const { accessibilityLabels } = extract(
      tsx(
        'function f() { const LOCAL = { label: "Local" };' +
          '  return <P accessibilityLabel={LOCAL.label} />; }',
      ),
    );
    expect(accessibilityLabels).toEqual([]);
  });
});

describe('extractor: which files count', () => {
  const body = "const a = { testID: 'x', accessibilityLabel: 'Y' };";
  const empty = { testIDs: [], accessibilityLabels: [] };

  it.each([
    'src/components/trip/note-card.test.tsx',
    'src/lib/format.test.ts',
    'src/components/__tests__/x.tsx',
    'src/types/global.d.ts',
    'src/assets/readme.md',
    'src/components/x.js',
    'test/components/x.tsx',
  ])('skips %s', (file) => {
    expect(extract(tsx(body, file))).toEqual(empty);
  });

  it.each(['src/components/x.tsx', 'src/lib/x.ts', 'src/app/(tabs)/index.tsx'])(
    'reads %s',
    (file) => {
      expect(extract(tsx(body, file))).toEqual({
        testIDs: ['x'],
        accessibilityLabels: ['Y'],
      });
    },
  );

  it('accepts Windows separators in a path', () => {
    const skipped = extract(tsx(body, 'src\\components\\x.test.tsx'));
    expect(skipped).toEqual(empty);
  });
});

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
      testIDs: [{ id: 'typo', reason: 'because' }],
      accessibilityLabels: [],
    };
    expect(validateAllowlist(allowlist, baseline, current).join('\n')).toContain('typo');
  });

  it('rejects an entry whose id is back in the tree (delete it)', () => {
    const allowlist = {
      testIDs: [{ id: 'a', reason: 'temporary' }],
      accessibilityLabels: [],
    };
    const restored = { testIDs: ['a'], accessibilityLabels: [] };
    expect(validateAllowlist(allowlist, baseline, restored).join('\n')).toContain('a');
  });
});

describe('parity with the pre-004 baseline', () => {
  const root = path.resolve(__dirname, '..');
  const readJson = (file: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

  const baseline = readJson('test/fixtures/testid-baseline.json') as {
    testIDs: string[];
    accessibilityLabels: string[];
  };
  const allowlist = readJson('test/testid-parity.allowlist.json') as {
    testIDs: { id: string; reason: string }[];
    accessibilityLabels: { id: string; reason: string }[];
  };
  const current = extractFromSources(readWorkingTreeSources(root));

  it('has a baseline that is sorted, unique and not trivially small', () => {
    for (const list of [baseline.testIDs, baseline.accessibilityLabels]) {
      expect([...new Set(list)].sort()).toEqual(list);
    }
    expect(baseline.testIDs.length).toBeGreaterThan(100);
    expect(baseline.accessibilityLabels.length).toBeGreaterThan(30);
  });

  it('sees the ids the Maestro flows and the tab bar rely on', () => {
    expect(current.testIDs).toEqual(
      expect.arrayContaining([
        'tab-bar',
        'tab-<param>',
        'tab-mark-<param>',
        'trip-card-<param>',
        'add-trip-cancel',
        'add-trip-save',
        'home-screen',
      ]),
    );
  });

  it('keeps the allowlist honest', () => {
    expect(validateAllowlist(allowlist, baseline, current)).toEqual([]);
  });

  it('still carries every baseline testID and accessible name', () => {
    const missing = findMissing(baseline, current, allowlist);
    const message = formatMissing(missing);
    if (message) throw new Error(message);
  });
});
