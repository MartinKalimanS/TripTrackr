/**
 * Colour reading for the appearance sweep (feature 005, T562; not a test file): one parser for
 * the colour notations the app writes (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
 * `rgba()`, `transparent`), the colours of a theme as the generated stylesheet holds them, and
 * the set of every colour the token layer can hand to a screen in one theme.
 *
 * A colour in a rendered style is a TOKEN when its red, green and blue are those of a token of
 * the theme being painted (any opacity: `withAlpha(token, n)` is still the token). Anything
 * else is a raw literal.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AndroidBarMetrics, PillMetrics } from '@/components/navigation/tab-metrics';
import { GlobeColors, GlobeStyle } from '@/constants/theme';
import { Palettes, blend, type PaletteName } from '@/theme';
import { CoverGlow, Passport, Scrim, Sky } from '@/theme/scrim';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0 to 1. */
  a: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL =
  /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

/** The colour a string writes, or null when it is not one of the notations above. */
export function parseColour(value: string): Rgba | null {
  const text = value.trim();
  if (text.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = HEX.exec(text);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((d) => d + d).join('') : hex[1];
    const byte = (index: number) => parseInt(digits.slice(index, index + 2), 16);
    return {
      r: byte(0),
      g: byte(2),
      b: byte(4),
      a: digits.length === 8 ? byte(6) / 255 : 1,
    };
  }
  const functional = FUNCTIONAL.exec(text);
  if (functional) {
    const alpha = functional[4];
    return {
      r: Number(functional[1]),
      g: Number(functional[2]),
      b: Number(functional[3]),
      a:
        alpha === undefined
          ? 1
          : alpha.endsWith('%')
            ? Number(alpha.slice(0, -1)) / 100
            : Number(alpha),
    };
  }
  return null;
}

/** The same colour, whatever the notation, to the byte of opacity. */
export function sameColour(left: Rgba, right: Rgba): boolean {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    Math.abs(left.a - right.a) < 1 / 255
  );
}

/** The same red, green and blue, whatever the opacity. */
export function sameRgb(left: Rgba, right: Rgba): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b;
}

const rgbKey = ({ r, g, b }: Rgba) => `${r},${g},${b}`;

/** Every colour string below `value`, however deep. */
function coloursIn(value: unknown): string[] {
  if (typeof value === 'string') return parseColour(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(coloursIn);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).flatMap(coloursIn);
  }
  return [];
}

const GROUNDS = ['canvas', 'surface', 'surfaceSecondary', 'pressed'] as const;

/**
 * The opaque colours a translucent token settles into over a ground: every translucent
 * palette colour (the dark tints) and the two fills the navigation bars draw at a stated
 * opacity (the dark capsule, the Android indicator), each over the paper, the cream and the
 * canvas. Under increased contrast or reduced transparency the adapters hand these over
 * instead of the translucent colour (`components/ui/solid-ground.ts`).
 */
function solidComposites(theme: PaletteName): string[] {
  const palette = Palettes[theme];
  const fills: [string, number][] = [
    [palette.onPhoto, PillMetrics.darkCapsuleAlpha],
    [palette.accent, AndroidBarMetrics.indicatorOpacity.light],
    [palette.accent, AndroidBarMetrics.indicatorOpacity.dark],
  ];
  for (const value of Object.values(palette)) {
    const rgba = parseColour(value);
    if (rgba !== null && rgba.a > 0 && rgba.a < 1) {
      fills.push([`#${value.slice(1, 7)}`, rgba.a]);
    }
  }
  return fills.flatMap(([colour, alpha]) =>
    GROUNDS.map((ground) => blend(colour, palette[ground], alpha)),
  );
}

/**
 * Every colour the token layer owns for `theme`, as red, green and blue: the palette, the
 * sky, the passport card, the cover glow, the scrims and the globe's own palette and style
 * (all token data: `src/theme/palette.data.js`, `src/theme/scrim.ts`, `GlobeColors`), and the
 * solid colours a translucent one comes to (`solidComposites`).
 */
export function tokenRgbOf(theme: PaletteName): ReadonlySet<string> {
  const known = tokenSets.get(theme);
  if (known) return known;
  const scheme = theme.startsWith('dark') ? 'dark' : 'light';
  const sources: unknown[] = [
    Palettes[theme],
    Sky[scheme],
    Passport,
    CoverGlow,
    Scrim,
    GlobeColors[scheme],
    (GlobeStyle as Record<string, unknown>)[scheme],
    solidComposites(theme),
  ];
  const set = new Set(
    sources
      .flatMap(coloursIn)
      .map((text) => parseColour(text))
      .filter((rgba): rgba is Rgba => rgba !== null)
      .map(rgbKey),
  );
  tokenSets.set(theme, set);
  return set;
}

const tokenSets = new Map<PaletteName, ReadonlySet<string>>();

export const isToken = (theme: PaletteName, rgba: Rgba) =>
  tokenRgbOf(theme).has(rgbKey(rgba));

// ------------------------------------------------------------------------------ stylesheet

const THEME_CSS = path.resolve(__dirname, '../../src/theme/generated/theme.css');
let parsed: Record<string, Record<string, string>> | null = null;

function stylesheet(): Record<string, Record<string, string>> {
  if (parsed) return parsed;
  const css = readFileSync(THEME_CSS, 'utf8').replace(/\r\n/g, '\n');
  const themes: Record<string, Record<string, string>> = {};
  for (const block of css.matchAll(/@variant ([\w-]+) \{([\s\S]*?)\n {4}\}/g)) {
    themes[block[1]] = Object.fromEntries(
      [...block[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((line) => [
        line[1],
        line[2].trim(),
      ]),
    );
  }
  parsed = themes;
  return themes;
}

/** `--accent-line` of one theme as the generated stylesheet writes it; '' when absent. */
export function themeColour(theme: PaletteName, token: string): string {
  return stylesheet()[theme]?.[`--${token}`] ?? '';
}
