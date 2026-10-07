/**
 * @jest-environment node
 *
 * T402 — the Metro configuration after Uniwind (research D4-02, "Items to
 * verify empirically" 1).
 *
 * Uniwind's own guidance is that `withUniwindConfig` must be the OUTERMOST
 * wrapper: it replaces `transformerPath` and `resolver.resolveRequest`, so a
 * wrapper applied after it would silently drop the className transform. Sentry's
 * wrapper (Debug ID serializer), the `.sql` migrations and the test-file block
 * list were here first and must survive it.
 *
 * The Node environment is deliberate: Metro's configuration is evaluated by
 * Node, never by the React Native runtime.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { PaletteNames } from '@/theme/palette';

type MetroConfigUnderTest = {
  transformerPath: string;
  transformer: { uniwind?: { cssEntryFile?: string; extraThemes?: string[] } };
  serializer: { customSerializer?: unknown };
  resolver: {
    sourceExts: string[];
    assetExts: string[];
    blockList: RegExp;
    resolveRequest: unknown;
  };
};

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const TYPINGS_FILE = path.join(MOBILE_ROOT, 'src', 'uniwind-types.d.ts');

/** The block list Sentry's Expo wrapper (Expo's defaults included) starts from. */
function defaultBlockList(): RegExp[] {
  const { getSentryExpoConfig } = require('@sentry/react-native/metro') as {
    getSentryExpoConfig: (root: string) => { resolver: { blockList: RegExp | RegExp[] } };
  };
  return ([] as RegExp[]).concat(getSentryExpoConfig(MOBILE_ROOT).resolver.blockList);
}

function loadConfig(): MetroConfigUnderTest {
  // Uniwind resolves `cssEntryFile` against the working directory, as Metro
  // does when launched from `apps/mobile`.
  const previous = process.cwd();
  process.chdir(MOBILE_ROOT);
  try {
    jest.resetModules();
    return require('../../metro.config.js') as MetroConfigUnderTest;
  } finally {
    process.chdir(previous);
  }
}

describe('metro.config.js with Uniwind (T402)', () => {
  // Metro's wrapper regenerates `src/uniwind-types.d.ts` when it transforms; merely
  // evaluating the config must not, or every Jest run would dirty a committed file.
  const typingsBefore = {
    text: readFileSync(TYPINGS_FILE, 'utf8'),
    modified: statSync(TYPINGS_FILE).mtimeMs,
  };
  const config = loadConfig();

  test('Uniwind is applied last: its transformer and resolver own the config', () => {
    expect(config.transformerPath).toMatch(/uniwind[\\/]dist[\\/]metro[\\/]transformer/);
    expect(typeof config.resolver.resolveRequest).toBe('function');
    expect(config.transformer.uniwind).toBeDefined();
  });

  test('points at the CSS entry file under src, which is also the class-scan root', () => {
    expect(config.transformer.uniwind?.cssEntryFile).toBe('./src/global.css');
    expect(config.resolver.sourceExts).toContain('css');
    expect(config.resolver.assetExts).not.toContain('css');
  });

  test('registers the two increased-contrast themes (research D4-05)', () => {
    expect(config.transformer.uniwind?.extraThemes).toEqual([
      'light-contrast',
      'dark-contrast',
    ]);
  });

  test('keeps the Sentry Debug ID serializer (FR-073)', () => {
    expect(typeof config.serializer.customSerializer).toBe('function');
  });

  test('keeps .sql as a source extension for Drizzle migrations', () => {
    expect(config.resolver.sourceExts).toContain('sql');
  });

  test('keeps test files out of the bundle', () => {
    const { blockList } = config.resolver;
    expect(blockList.test('/app/src/app/thing.test.tsx')).toBe(true);
    expect(blockList.test('/app/src/app/thing.spec.ts')).toBe(true);
    expect(blockList.test('/app/src/app/thing.tsx')).toBe(false);
  });

  describe('the Sentry and Expo default block list survives the merge', () => {
    // One path per default pattern, built with this platform's separator because Expo's
    // patterns are written for it. If Expo adds or changes a pattern, the first test
    // below fails and says which sample to add.
    const BLOCKED_BY_DEFAULT = [
      path.join('ios', 'Pods'),
      path.join('android', 'app', 'build'),
      path.join('android', '.gradle'),
      path.join('.expo', 'types'),
      path.join('src', '__tests__', 'a.ts'),
    ];

    test('every default pattern is represented by a sample the defaults block', () => {
      const defaults = defaultBlockList();
      expect(defaults.length).toBeGreaterThan(0);
      for (const sample of BLOCKED_BY_DEFAULT) {
        expect({ sample, blocked: defaults.some((re) => re.test(sample)) }).toEqual({
          sample,
          blocked: true,
        });
      }
      for (const pattern of defaults) {
        expect({
          pattern: String(pattern),
          covered: BLOCKED_BY_DEFAULT.some((s) => pattern.test(s)),
        }).toEqual({
          pattern: String(pattern),
          covered: true,
        });
      }
    });

    test.each(BLOCKED_BY_DEFAULT)('still blocks %s', (sample) => {
      expect(config.resolver.blockList.test(sample)).toBe(true);
    });

    test('blocks nothing more than the defaults and test files', () => {
      expect(config.resolver.blockList.test(path.join('src', 'app', 'thing.tsx'))).toBe(
        false,
      );
      expect(
        config.resolver.blockList.test(path.join('src', 'theme', 'palette.ts')),
      ).toBe(false);
    });
  });

  describe('src/uniwind-types.d.ts, the typings Metro generates and Git keeps', () => {
    const typings = readFileSync(TYPINGS_FILE, 'utf8');
    const listed = [
      ...(/themes:\s*readonly\s*\[([^\]]*)\]/.exec(typings)?.[1] ?? '').matchAll(
        /'([^']+)'/g,
      ),
    ].map((match) => match[1]);

    test('lists light and dark, then the same themes as extraThemes, in that order', () => {
      expect(listed).toEqual([
        'light',
        'dark',
        ...(config.transformer.uniwind?.extraThemes ?? []),
      ]);
    });

    test('lists exactly the palette themes, so setTheme accepts every themeName', () => {
      expect(listed).toEqual([...PaletteNames]);
    });

    test('is not rewritten by evaluating the Metro config under Jest', () => {
      expect(readFileSync(TYPINGS_FILE, 'utf8')).toBe(typingsBefore.text);
      expect(statSync(TYPINGS_FILE).mtimeMs).toBe(typingsBefore.modified);
    });
  });
});
