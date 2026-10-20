/**
 * Shared by `app-config.test.ts` and `test/theme/global-css.test.ts`: what the `expo-font`
 * config plugin embeds (feature 004, research D4-07), and the names inside those files.
 *
 * The family name a font answers to is NOT the same on the two platforms
 * (https://docs.expo.dev/versions/v57.0.0/sdk/font.md, "Configurable properties"):
 * on Android the file name without its extension is the family name, on iOS the name is
 * read from the font file itself. `fontNames` reads the `name` table so a test can state
 * both without a device.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

import createConfig from '../../app.config';

export const MOBILE_ROOT = path.resolve(__dirname, '..', '..');

type PluginEntry = string | [string] | [string, Record<string, unknown>];

/** The resolved Expo config, as `expo config` evaluates the dynamic `app.config.ts`. */
export function resolvedConfig(): ExpoConfig {
  return createConfig({ config: {} } as ConfigContext);
}

export function pluginName(entry: PluginEntry): string {
  return typeof entry === 'string' ? entry : entry[0];
}

/** Every `expo-font` plugin entry in the config (a duplicate would embed twice). */
export function expoFontEntries(config = resolvedConfig()): PluginEntry[] {
  return ((config.plugins ?? []) as PluginEntry[]).filter(
    (entry) => pluginName(entry) === 'expo-font',
  );
}

/** The `fonts` paths of the single `expo-font` entry, exactly as written in the config. */
export function embeddedFontPaths(config = resolvedConfig()): string[] {
  const [entry] = expoFontEntries(config);
  const props = Array.isArray(entry) ? entry[1] : undefined;
  return (props?.fonts as string[] | undefined) ?? [];
}

/**
 * The file a `fonts` entry names, found the way the plugin finds it: its own
 * `resolveFontPaths` tries the entry against the project root and, if nothing is there,
 * resolves it as a module from the project (`createRequire(projectRoot)`), so a package
 * specifier survives any hoisting layout of `node_modules`.
 */
export function resolveEmbeddedFont(entry: string): string {
  const fromRoot = path.resolve(MOBILE_ROOT, entry);
  try {
    readFileSync(fromRoot);
    return fromRoot;
  } catch {
    return createRequire(path.join(MOBILE_ROOT, 'package.json')).resolve(entry);
  }
}

/** The `name` table records a platform can answer to, keyed by OpenType name id. */
export interface FontNames {
  /** id 1: the legacy family, which a static weight file prefixes with its weight. */
  family: string;
  /** id 6: the PostScript name, which iOS resolves a `fontFamily` against. */
  postScript: string;
}

function readNameTable(font: Buffer): Map<number, string> {
  const tables = font.readUInt16BE(4);
  let offset = -1;
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    if (font.toString('latin1', record, record + 4) === 'name') {
      offset = font.readUInt32BE(record + 8);
    }
  }
  if (offset < 0) throw new Error('font has no name table');
  const count = font.readUInt16BE(offset + 2);
  const strings = offset + font.readUInt16BE(offset + 4);
  const names = new Map<number, string>();
  for (let i = 0; i < count; i += 1) {
    const record = offset + 6 + i * 12;
    const platform = font.readUInt16BE(record);
    // Windows (3) and Unicode (0) records are UTF-16BE; keep the first of each id.
    if (platform !== 3 && platform !== 0) continue;
    const id = font.readUInt16BE(record + 6);
    const length = font.readUInt16BE(record + 8);
    const start = strings + font.readUInt16BE(record + 10);
    if (!names.has(id)) {
      names.set(
        id,
        Buffer.from(font.subarray(start, start + length))
          .swap16()
          .toString('utf16le'),
      );
    }
  }
  return names;
}

export function fontNames(file: string): FontNames {
  const names = readNameTable(readFileSync(file));
  return { family: names.get(1) ?? '', postScript: names.get(6) ?? '' };
}

/** The file name without its extension: Android's family name for a plugin-embedded font. */
export function androidFamilyName(file: string): string {
  return path.parse(file).name;
}
