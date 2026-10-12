/**
 * T518 - the icon registry over Phosphor (feature 005; research D5-07; contract C5-14).
 *
 * `icon-registry.ts` imports about sixty icons by deep path and names them with the keys a
 * screen passes to `Icon`. The package barrel re-exports 1,500 icons, so the registry may
 * never import it (Jest refuses the bare specifier with a reason; Metro would bundle every
 * icon). A key is an app word (`'chevron-left'`), never a Phosphor name.
 */
import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';

import { glyphId, type GlyphWeight } from '../../../test/helpers/icons';
import { DIRECTIONAL_ICONS, ICONS, ICON_KEYS, isIconKey } from './icon-registry';

const SOURCE = fs.readFileSync(path.join(__dirname, 'icon-registry.ts'), 'utf8');

describe('the registry - D5-07', () => {
  test('holds about sixty icons', () => {
    expect(ICON_KEYS.length).toBeGreaterThanOrEqual(55);
    expect(ICON_KEYS.length).toBeLessThanOrEqual(70);
  });

  test('a key is a lower-case word, joined by hyphens', () => {
    for (const key of ICON_KEYS) expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  test('every key is a different Phosphor component', () => {
    const components = ICON_KEYS.map((key) => ICONS[key]);
    expect(new Set(components).size).toBe(ICON_KEYS.length);
    for (const component of components) expect(typeof component).toBe('function');
  });

  test('imports each icon by its deep path and never the barrel', () => {
    // The one mention of the package root is a type, which is erased before Jest or Metro
    // see it (`import type`); every other import is an icon's deep path.
    const code = SOURCE.replace(/^import type [^;]+ from 'phosphor-react-native';$/m, '');
    const specifiers = [...code.matchAll(/from\s+'(phosphor-react-native[^']*)'/g)].map(
      (match) => match[1],
    );
    // One import per key, and not one of them the package root.
    expect(specifiers).toHaveLength(ICON_KEYS.length);
    for (const specifier of specifiers) {
      expect(specifier).toMatch(/^phosphor-react-native\/src\/icons\/[A-Za-z]+$/);
    }
    expect(code).not.toMatch(/require\(\s*'phosphor-react-native'/);
  });

  test('isIconKey tells a key from any other string', () => {
    expect(isIconKey('globe')).toBe(true);
    expect(isIconKey('globe.europe.africa')).toBe(false);
    expect(isIconKey('toString')).toBe(false);
    expect(isIconKey({ ios: 'plus', android: 'add' })).toBe(false);
    expect(isIconKey(undefined)).toBe(false);
  });
});

describe('the platform symbols are gone - D5-07', () => {
  const SRC = path.join(__dirname, '..', '..');

  function sourcesBelow(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourcesBelow(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  test('no source file imports expo-symbols (the dependency stays installed: the fallback)', () => {
    const importing = sourcesBelow(SRC).filter((file) =>
      /from\s+'expo-symbols'|require\(\s*'expo-symbols'/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(importing).toEqual([]);
  });

  test('no icon is named for a platform any more (the feature 004 form)', () => {
    const named = sourcesBelow(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /\bios:\s*'[a-z.]+',\s*android:/.test(fs.readFileSync(file, 'utf8')),
      );
    expect(named).toEqual([]);
  });
});

describe('the vocabulary the screens need - D5-07', () => {
  /**
   * The prototype's inline icon set, as far as a screen uses it, and the legacy symbol of
   * feature 004 each key replaced: each must be a key, or the screen has no glyph for it.
   */
  const NEEDED = [
    // tab bar, headers, row cues
    'globe',
    'suitcase',
    'user',
    'user-circle',
    'chevron-left',
    'chevron-right',
    'chevron-up',
    'chevron-down',
    'arrow-left',
    'arrow-right',
    // actions
    'plus',
    'minus',
    'x',
    'check',
    'search',
    'pencil',
    'trash',
    'share',
    'ellipsis',
    'refresh',
    'undo',
    'download',
    'locate',
    'log-out',
    'settings',
    'grip',
    'stop-circle',
    // status and feedback
    'check-circle',
    'alert',
    'warning',
    'info',
    'question',
    'clock',
    'calendar',
    'lock',
    'shield-check',
    'eye-off',
    // sync and network
    'cloud-upload',
    'cloud-check',
    'cloud-off',
    'sync',
    'wifi',
    'wifi-off',
    // content
    'image',
    'images',
    'camera',
    'note',
    'file-text',
    'wallet',
    'map',
    'map-pin',
    'route',
    'stamp',
    'tag',
    'mail',
    'sparkle',
    // categories and transport
    'plane',
    'car',
    'tram',
    'bed',
    'fork-knife',
    'ticket',
    'shopping-bag',
  ];

  test.each(NEEDED)('has %s', (key) => {
    expect(ICON_KEYS).toContain(key);
  });

  test('has nothing nobody asked for', () => {
    expect([...ICON_KEYS].sort()).toEqual([...NEEDED].sort());
  });
});

describe('direction glyphs - mirrored when the layout is reversed', () => {
  test('are exactly the ones that point somewhere along the reading line', () => {
    expect([...DIRECTIONAL_ICONS].sort()).toEqual([
      'arrow-left',
      'arrow-right',
      'chevron-left',
      'chevron-right',
      'log-out',
      'undo',
    ]);
  });

  test('are registry keys', () => {
    for (const key of DIRECTIONAL_ICONS) expect(ICON_KEYS).toContain(key);
  });
});

describe('every key draws in the three weights of C5-8', () => {
  const WEIGHTS: GlyphWeight[] = ['regular', 'fill', 'duotone'];

  test.each(ICON_KEYS.map((key) => [key]))('%s', async (key) => {
    const Glyph = ICONS[key];
    for (const weight of WEIGHTS) {
      await render(<Glyph weight={weight} size={24} color="#000000" />);
      expect(screen.getAllByTestId(glyphId(key, weight)).length).toBeGreaterThan(0);
    }
  });
});
