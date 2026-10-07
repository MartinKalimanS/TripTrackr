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
import path from 'node:path';

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

  test('keeps test files out of the bundle without dropping the defaults', () => {
    const { blockList } = config.resolver;
    expect(blockList.test('/app/src/app/thing.test.tsx')).toBe(true);
    expect(blockList.test('/app/src/app/thing.spec.ts')).toBe(true);
    expect(blockList.test('/app/src/app/thing.tsx')).toBe(false);
  });
});
