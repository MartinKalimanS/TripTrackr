/**
 * @jest-environment node
 *
 * T412 — the Expo config after feature 004 (research D4-07), extended by feature 005
 * (T504; research D5-06).
 *
 * The type faces are embedded at build time by the `expo-font` config plugin
 * (https://docs.expo.dev/versions/v57.0.0/sdk/font.md, "Configuration in app config"),
 * not downloaded or loaded at run time. Only the weights the type scale uses are
 * embedded, six files in all (Bricolage Grotesque 600 and 700, DM Sans 400, 600 and 700,
 * Instrument Serif Italic 400): every extra file is app size on a traveller's phone
 * (SC-011).
 *
 * The Node environment is deliberate: the config is evaluated by Node, never by the
 * React Native runtime.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  MOBILE_ROOT,
  embeddedFontPaths,
  expoFontEntries,
  pluginName,
  resolveEmbeddedFont,
  resolvedConfig,
} from './expo-font-plugin';

/**
 * The plugin's own path resolver. `expo-font` exports only its entry point, so the file is
 * reached through the package root: a rename in a future expo-font fails here, loudly.
 */
const { resolveFontPaths } = require(
  path.join(
    path.dirname(require.resolve('expo-font/package.json')),
    'plugin/build/utils.js',
  ),
) as { resolveFontPaths: (fonts: string[], projectRoot: string) => Promise<string[]> };

/** The six embedded files, in the order of the config (005 D5-06; 004 embedded the first two). */
const FONT_FILES = [
  'BricolageGrotesque_600SemiBold.ttf',
  'BricolageGrotesque_700Bold.ttf',
  'DMSans_400Regular.ttf',
  'DMSans_600SemiBold.ttf',
  'DMSans_700Bold.ttf',
  'InstrumentSerif_400Regular_Italic.ttf',
];

/** The three @expo-google-fonts packages the files come from. */
const FONT_PACKAGES = ['bricolage-grotesque', 'dm-sans', 'instrument-serif'];

/** Every plugin the app config lists besides `expo-font`. */
const OTHER_PLUGINS = [
  'expo-router',
  'expo-splash-screen',
  'expo-sqlite',
  'expo-secure-store',
  'expo-apple-authentication',
  'expo-camera',
  'expo-image-picker',
  'expo-build-properties',
  'expo-dev-client',
  '@sentry/react-native/expo',
  '@rnmapbox/maps',
];

describe('app.config.ts — the expo-font plugin (004 D4-07, 005 D5-06)', () => {
  test('has exactly one expo-font entry, so the fonts are not embedded twice', () => {
    expect(expoFontEntries()).toHaveLength(1);
  });

  test('embeds exactly the six files of the type scale, in order', () => {
    expect(embeddedFontPaths().map((file) => path.basename(file))).toEqual(FONT_FILES);
  });

  test('has no third Bricolage weight, three DM Sans weights and one Instrument Serif', () => {
    const files = embeddedFontPaths().map((file) => path.basename(file));
    const of = (prefix: string) => files.filter((file) => file.startsWith(prefix));
    expect(of('BricolageGrotesque_')).toEqual([
      'BricolageGrotesque_600SemiBold.ttf',
      'BricolageGrotesque_700Bold.ttf',
    ]);
    expect(of('DMSans_')).toHaveLength(3);
    expect(of('InstrumentSerif_')).toEqual(['InstrumentSerif_400Regular_Italic.ttf']);
    expect(new Set(files).size).toBe(6);
  });

  test('passes the file list alone: no per-platform list that could embed more', () => {
    const [entry] = expoFontEntries();
    expect(Array.isArray(entry) ? Object.keys(entry[1] ?? {}) : []).toEqual(['fonts']);
  });

  test('names each file by package specifier, not by a path into node_modules', () => {
    // `expo-font` resolves an entry that is not a file under the project root as a module
    // from it (`createRequire(projectRoot)`), so the specifier survives whichever way npm
    // hoists the package; a `../../node_modules/...` path would not.
    for (const file of embeddedFontPaths()) {
      expect(file).toMatch(
        /^@expo-google-fonts\/(?:bricolage-grotesque|dm-sans|instrument-serif)\/\d{3}[A-Za-z_]+\/\w+\.ttf$/,
      );
      expect(file).not.toContain('node_modules');
    }
  });

  test('every file exists on disk, resolved from apps/mobile as the plugin does', () => {
    for (const file of embeddedFontPaths()) {
      expect(existsSync(resolveEmbeddedFont(file))).toBe(true);
    }
  });

  test('every file is a real TrueType font, not a pointer or an empty placeholder', () => {
    for (const file of embeddedFontPaths()) {
      const bytes = readFileSync(resolveEmbeddedFont(file));
      expect(bytes.readUInt32BE(0)).toBe(0x00010000);
      expect(bytes.length).toBeGreaterThan(10_000);
    }
  });

  test('the plugin itself resolves every entry from the project root, to the files on disk', async () => {
    const resolved = await resolveFontPaths(embeddedFontPaths(), MOBILE_ROOT);
    expect(resolved.map((file) => path.basename(file))).toEqual(FONT_FILES);
    expect(resolved).toEqual(embeddedFontPaths().map(resolveEmbeddedFont));
  });

  test('each file comes from an @expo-google-fonts package the app depends on, not a copy', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    const used = new Set<string>();
    for (const file of embeddedFontPaths()) {
      const resolved = resolveEmbeddedFont(file).split(path.sep).join('/');
      const [, pkg] = /node_modules\/@expo-google-fonts\/([^/]+)\//.exec(resolved) ?? [];
      expect(pkg).toBeDefined();
      used.add(pkg);
    }
    expect([...used].sort()).toEqual([...FONT_PACKAGES].sort());
    for (const pkg of FONT_PACKAGES) {
      // Exact pins (research D5-19): a font package that moves can rename a family.
      expect(manifest.dependencies[`@expo-google-fonts/${pkg}`]).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    }
  });

  test('keeps every other plugin, in order, beside the font plugin', () => {
    const names = (resolvedConfig().plugins ?? []).map((entry) =>
      pluginName(entry as Parameters<typeof pluginName>[0]),
    );
    expect(names.filter((name) => name !== 'expo-font')).toEqual(OTHER_PLUGINS);
  });
});
