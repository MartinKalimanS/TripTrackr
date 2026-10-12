/**
 * The generated stylesheet as the tests read it (feature 004, contract C4-1).
 *
 * `src/theme/generated/theme.css` holds one `@variant <theme>` block per palette, and the
 * kit's classes and `useThemeColor` resolve their colours from it. Under Jest a class never
 * resolves, so a suite that must prove "the same colour as the class" reads the variable
 * from this file instead.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { PaletteName } from '@/theme/palette';

const THEME_CSS = path.resolve(__dirname, '../../src/theme/generated/theme.css');

/** `--background` of one theme: what `bg-background` and `useThemeColor('background')` paint. */
export function backgroundVariable(theme: PaletteName): string {
  const css = readFileSync(THEME_CSS, 'utf8').replace(/\r\n/g, '\n');
  const block = new RegExp(`@variant ${theme} \\{([\\s\\S]*?)\\n {4}\\}`).exec(css);
  return /--background:\s*([^;]+);/.exec(block?.[1] ?? '')?.[1]?.trim() ?? '';
}

/**
 * Any variable of one theme, by its name with the dashes (`--accent-text`): what a class
 * such as `text-accent-text` or `useThemeColor('accent-text')` paints. Lower-case hex, as
 * the generator writes it; empty when the theme has no such variable.
 */
export function themeVariable(theme: PaletteName, name: string): string {
  const css = readFileSync(THEME_CSS, 'utf8').replace(/\r\n/g, '\n');
  const start = css.indexOf(`@variant ${theme} {`);
  const block = css.slice(start, css.indexOf('\n    }', start));
  const line = block
    .split('\n')
    .map((text) => text.trim())
    .find((text) => text.startsWith(`${name}:`));
  if (!line) return '';
  const value = line.slice(name.length + 1);
  return value.replace(/;$/, '').trim();
}
