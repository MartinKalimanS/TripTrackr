/**
 * @jest-environment node
 *
 * T412 — the Expo config after feature 004 (research D4-07).
 *
 * The display face is embedded at build time by the `expo-font` config plugin
 * (https://docs.expo.dev/versions/v57.0.0/sdk/font.md, "Configuration in app config"),
 * not downloaded or loaded at run time. Only the two weights the type scale uses are
 * embedded: every extra file is app size on a traveller's phone (SC-011).
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

const FONT_FILES = [
  'BricolageGrotesque_600SemiBold.ttf',
  'BricolageGrotesque_700Bold.ttf',
];

/** Every plugin the app config listed before the display face was added. */
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

describe('app.config.ts — the expo-font plugin (004 D4-07)', () => {
  test('has exactly one expo-font entry, so the fonts are not embedded twice', () => {
    expect(expoFontEntries()).toHaveLength(1);
  });

  test('embeds ONLY the semibold and bold files of the display face', () => {
    expect(embeddedFontPaths().map((file) => path.basename(file))).toEqual(FONT_FILES);
  });

  test('passes the file list alone: no per-platform list that could embed more', () => {
    const [entry] = expoFontEntries();
    expect(Array.isArray(entry) ? Object.keys(entry[1] ?? {}) : []).toEqual(['fonts']);
  });

  test('both files exist on disk, resolved from apps/mobile as the plugin does', () => {
    for (const file of embeddedFontPaths()) {
      expect(path.isAbsolute(file)).toBe(false);
      expect(existsSync(path.resolve(MOBILE_ROOT, file))).toBe(true);
    }
  });

  test('both files are real TrueType fonts, not a pointer or an empty placeholder', () => {
    for (const file of embeddedFontPaths()) {
      const bytes = readFileSync(path.resolve(MOBILE_ROOT, file));
      expect(bytes.readUInt32BE(0)).toBe(0x00010000);
      expect(bytes.length).toBeGreaterThan(10_000);
    }
  });

  test('the plugin itself resolves both paths from the project root', async () => {
    const resolved = await resolveFontPaths(embeddedFontPaths(), MOBILE_ROOT);
    expect(resolved.map((file) => path.basename(file))).toEqual(FONT_FILES);
  });

  test('is the @expo-google-fonts package the app depends on, not a copied file', () => {
    for (const file of embeddedFontPaths()) {
      expect(file).toContain('node_modules/@expo-google-fonts/bricolage-grotesque/');
    }
    const manifest = JSON.parse(
      readFileSync(path.join(MOBILE_ROOT, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(manifest.dependencies['@expo-google-fonts/bricolage-grotesque']).toBeDefined();
  });

  test('keeps every other plugin, in order, beside the font plugin', () => {
    const names = (resolvedConfig().plugins ?? []).map((entry) =>
      pluginName(entry as Parameters<typeof pluginName>[0]),
    );
    expect(names.filter((name) => name !== 'expo-font')).toEqual(OTHER_PLUGINS);
  });
});
