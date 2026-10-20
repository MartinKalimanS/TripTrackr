/**
 * T524 - the production bundle does not import the dev gallery (feature 005; research D5-18;
 * contract C5-13 rule 5). Jest cannot bundle, so the property is held at the source: nothing
 * in `src/` outside the `(dev)` route group and `components/dev` names `components/dev`, the
 * route loads it inside `if (__DEV__)` (which a release bundle folds away with the branch),
 * and the root layout's guard is the literal `__DEV__`.
 *
 * Also held here, because a gallery is where such things creep in: no remote picture (a photo
 * fixture is generated or bundled, never a URL), no debug output, nothing from the native
 * batch outside the adapter folders, and no file over the size limit.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');
const DEV_COMPONENTS = path.join(SRC, 'components', 'dev');
const DEV_ROUTES = path.join(SRC, 'app', '(dev)');

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const isSource = (file: string) => /\.(ts|tsx)$/.test(file);
const isTest = (file: string) => /\.test\.(ts|tsx)$/.test(file);
const inside = (file: string, directory: string) => file.startsWith(directory + path.sep);
const read = (file: string) => fs.readFileSync(file, 'utf8');
/** An import, a dynamic import or a `require` of anything in `components/dev`: not a comment. */
const LOADS_DEV = /(?:\bfrom|\bimport\(|\brequire\()\s*['"][^'"]*components\/dev\b/;
const relative = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

const ALL = walk(SRC).filter(isSource);
const DEV = ALL.filter((file) => inside(file, DEV_COMPONENTS));
const OUTSIDE = ALL.filter(
  (file) => !isTest(file) && !inside(file, DEV_COMPONENTS) && !inside(file, DEV_ROUTES),
);

describe('nothing that ships names the gallery', () => {
  test('there is a gallery to guard', () => {
    expect(DEV.length).toBeGreaterThan(15);
    expect(fs.existsSync(path.join(DEV_ROUTES, 'gallery.tsx'))).toBe(true);
  });

  test('no file under src/ outside (dev) and components/dev imports components/dev', () => {
    const offenders = OUTSIDE.filter((file) => LOADS_DEV.test(read(file)));
    expect(offenders.map(relative)).toEqual([]);
  });

  test('nothing outside them reaches it by a relative path either', () => {
    const offenders = OUTSIDE.filter((file) =>
      /from ['"](\.\.?\/)+(components\/)?dev\//.test(read(file)),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  test('the (dev) group names it only in its route, and only after `if (__DEV__)`', () => {
    const named = walk(DEV_ROUTES).filter((file) => LOADS_DEV.test(read(file)));
    expect(named.map(relative)).toEqual(['app/(dev)/gallery.tsx']);

    const source = read(named[0]!);
    expect(source).not.toMatch(/^import .*components\/dev/m);
    const guard = source.indexOf('if (__DEV__) {');
    const load = source.indexOf("require('@/components/dev/gallery')");
    expect(guard).toBeGreaterThan(-1);
    expect(load).toBeGreaterThan(guard);
    expect(load).toBeLessThan(source.indexOf('\n  }\n', guard));
  });

  test('the root layout admits the group behind a guard that is the literal __DEV__', () => {
    const layout = read(path.join(SRC, 'app', '_layout.tsx'));
    expect(layout).toMatch(
      /<Stack\.Protected guard=\{__DEV__\}>\s*<Stack\.Screen name="\(dev\)" \/>\s*<\/Stack\.Protected>/,
    );
    expect(layout).not.toMatch(LOADS_DEV);
  });

  test('the appearance override the gallery needs holds no dev import and no default value', () => {
    const override = read(path.join(SRC, 'hooks', 'appearance-override.ts'));
    expect(override).not.toMatch(LOADS_DEV);
    expect(override).toMatch(/createContext<AppearanceOverride \| null>\(null\)/);
  });
});

describe('what the gallery may contain', () => {
  test('no remote picture, URL or request: a photograph is generated, never fetched', () => {
    const offenders = DEV.filter((file) =>
      /(https?:\/\/|\bfetch\(|\buri\s*:|expo-image|require\([^)]*\.(png|jpe?g|webp)\))/.test(
        read(file),
      ),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  test('no debug output', () => {
    const offenders = DEV.filter((file) => /\bconsole\.\w+\(/.test(read(file)));
    expect(offenders.map(relative)).toEqual([]);
  });

  test('nothing from the kit or the native batch outside the adapter folders', () => {
    const packages =
      /from ['"](heroui-native|uniwind|phosphor-react-native|expo-glass-effect|react-native-zoom-toolkit|react-native-view-shot)/;
    const offenders = DEV.filter((file) => packages.test(read(file)));
    expect(offenders.map(relative)).toEqual([]);
  });

  test('every file is under the 800-line limit', () => {
    const long = DEV.filter((file) => read(file).split('\n').length >= 800);
    expect(long.map(relative)).toEqual([]);
  });

  test('every UI primitive comes from components/ui or components/navigation', () => {
    const imports = DEV.flatMap((file) =>
      [...read(file).matchAll(/from '(@\/components\/[a-z-]+)\//g)].map(
        (match) => match[1],
      ),
    );
    const folders = new Set(imports);
    for (const folder of folders) {
      expect([
        '@/components/ui',
        '@/components/navigation',
        '@/components/trip',
      ]).toContain(folder);
    }
  });
});
