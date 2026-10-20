/**
 * The testID / accessible-name extractor, pinned on inline sources (feature 004,
 * T414). The tree itself is compared in `testid-parity.test.ts`.
 */
import { analyseSources, extractFromSources } from '../scripts/lib/extract-ids';

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

describe('extractor: aria-label and *TestID names', () => {
  it('reads aria-label into the same list as accessibilityLabel', () => {
    const { accessibilityLabels, testIDs } = extract(
      tsx(
        'const a = <P aria-label="Close" accessibilityLabel="Close" />;' +
          "const b = { 'aria-label': 'Open' };" +
          'const c = <P aria-label={`Move ${place}`} />;',
      ),
    );
    expect(accessibilityLabels).toEqual(['Close', 'Move <param>', 'Open']);
    expect(testIDs).toEqual([]);
  });

  it('reads a property whose name ends in TestID as a testID', () => {
    const { testIDs } = extract(
      tsx(
        "const a = { tabBarButtonTestID: 'tab-home' };" +
          'const b = <Screen options={{ tabBarButtonTestID: `tab-${name}` }} />;' +
          'const c = <Card headerTestID="card-header" />;' +
          "const d = { 'footerTestID': 'card-footer' };",
      ),
    );
    expect(testIDs).toEqual(['card-footer', 'card-header', 'tab-<param>', 'tab-home']);
  });

  it.each(['testIDs', 'myTestIdentifier', 'fooTestid', 'TestIDPrefixed', 'testidx'])(
    'does not mistake %s for one',
    (name) => {
      const { testIDs } = extract(tsx(`const a = { ${name}: 'nope' };`));
      expect(testIDs).toEqual([]);
    },
  );

  it('still derives FormActions suffixes from any TestID-named prop', () => {
    const { testIDs } = extract(
      tsx(
        'export const F = ({ testIDPrefix }) => <P rowTestID={`${testIDPrefix}-row`} />;',
        'src/components/ui/form-actions.tsx',
      ),
      tsx('const a = <F testIDPrefix="x" />;'),
    );
    expect(testIDs).toEqual(['x-row']);
  });
});

describe('extractor: lexical scope of same-file constants', () => {
  it('gives each function its own const when two reuse a name', () => {
    const { testIDs } = extract(
      tsx(
        'function A() { const base = "a-card"; return <V testID={`${base}-open`} />; }' +
          'function B() { const base = "b-card"; return <V testID={`${base}-open`} />; }',
      ),
    );
    expect(testIDs).toEqual(['a-card-open', 'b-card-open']);
  });

  it('reads a module-level const from inside a function and a nested closure', () => {
    const { testIDs } = extract(
      tsx(
        'const ROOT = "shell";' +
          'function A() { return list.map(() => <V testID={`${ROOT}-row`} />); }',
      ),
    );
    expect(testIDs).toEqual(['shell-row']);
  });

  it('lets an inner const shadow an outer one, including in a block', () => {
    const { testIDs } = extract(
      tsx(
        'const base = "outer";' +
          'function A() { const base = "inner"; return <V testID={base} />; }' +
          'function B() { if (ok) { const base = "block"; log(<V testID={base} />); }' +
          '  return <V testID={base} />; }',
      ),
    );
    expect(testIDs).toEqual(['block', 'inner', 'outer']);
  });

  it('does not read a module const through a parameter that shadows it', () => {
    const { testIDs, accessibilityLabels } = extract(
      tsx(
        'const label = "Module";' +
          'function A({ label }) { return <P accessibilityLabel={label} testID={`${label}-id`} />; }' +
          'function B(label) { return <P accessibilityLabel={label} />; }' +
          'function C() { return <P accessibilityLabel={label} />; }',
      ),
    );
    expect(accessibilityLabels).toEqual(['Module']);
    expect(testIDs).toEqual(['<param>-id']);
  });

  it('keeps a prop and a const of the same name apart (offline-maps)', () => {
    const { testIDs } = extract(
      tsx(
        'function Row({ testID }) { return <V testID={testID} />; }' +
          'function Status({ id }) { const testID = `status-${id}`; return <E testID={testID} />; }',
      ),
    );
    expect(testIDs).toEqual(['status-<param>']);
  });

  it('reads a shorthand property through the same lookup', () => {
    const { testIDs } = extract(
      tsx(
        'const testID = "home-go";' +
          'const a = { testID, other: 1 };' +
          'function f(testID) { return { testID }; }',
      ),
    );
    expect(testIDs).toEqual(['home-go']);
  });

  it('does not treat an import, a function or a let as a string const', () => {
    const { testIDs } = extract(
      tsx(
        "import { fromElsewhere } from './elsewhere';" +
          'let mutable = "changes";' +
          'function helper() { return "x"; }' +
          'const a = <V testID={fromElsewhere} />;' +
          'const b = <V testID={mutable} />;' +
          'const c = <V testID={helper} />;',
      ),
    );
    expect(testIDs).toEqual([]);
  });

  it('does not read a copy table through a local that shadows its name', () => {
    const { accessibilityLabels } = extract(
      tsx("export const COPY = { retry: 'Try again' };", 'src/features/copy.ts'),
      tsx(
        'import { COPY } from "@/features/copy";' +
          'const a = <P accessibilityLabel={COPY.retry} />;' +
          'function f(COPY) { return <P accessibilityLabel={COPY.retry} />; }',
      ),
    );
    expect(accessibilityLabels).toEqual(['Try again']);
  });
});

describe('extractor: unresolved occurrences', () => {
  const code = [
    'const a = <View testID={testID} />;',
    'const b = <View testID="ok" />;',
    'const c = <View testID={props.id} />;',
    'const d = <View accessibilityLabel={label} />;',
    'const e = <View accessibilityLabel="Fine" />;',
    'const f = <View testID={`${x}`} />;',
    'const g = <F testIDPrefix={prefix} />;',
    "const h = <View testID={ok ? 'a' : other} />;",
    'const i = <View aria-label={spoken} />;',
    'const j = <View testID />;',
  ].join('\n');

  it('lists every id-bearing attribute whose value it could not read', () => {
    const { unresolved } = analyseSources([tsx(code)]);
    expect(unresolved.testIDs.map((o) => [o.line, o.name, o.text])).toEqual([
      [1, 'testID', 'testID'],
      [3, 'testID', 'props.id'],
      [6, 'testID', '`${x}`'],
      [7, 'testIDPrefix', 'prefix'],
    ]);
    expect(unresolved.accessibilityLabels.map((o) => [o.line, o.name, o.text])).toEqual([
      [4, 'accessibilityLabel', 'label'],
      [9, 'aria-label', 'spoken'],
    ]);
    expect(unresolved.testIDs[0].path).toBe('src/components/sample.tsx');
  });

  it('counts nothing for tests and declaration files', () => {
    const { unresolved } = analyseSources([
      tsx(code, 'src/components/x.test.tsx'),
      tsx(code, 'src/types.d.ts'),
    ]);
    expect(unresolved).toEqual({ testIDs: [], accessibilityLabels: [] });
  });

  it('leaves the id lists exactly as extractFromSources reports them', () => {
    expect(analyseSources([tsx(code)]).ids).toEqual(extractFromSources([tsx(code)]));
  });
});
