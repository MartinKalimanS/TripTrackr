/**
 * @jest-environment node
 *
 * The sky behind the Home globe is the prototype's `--sky` (feature 005, F1 "Map"): the
 * stops and glows of `Sky` (`src/theme/scrim.ts`, drawn by `<Scrim kind="sky" />`) are
 * read back from `tokens.css`, the file the reference pictures were rendered from, so the
 * data cannot drift from the picture. Order of authority: the CSS decides.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Sky } from '@/theme/scrim';

const TOKENS = path.resolve(
  __dirname,
  '../../../../specs/005-sunrise-passport-ui/reference/prototype/tokens.css',
);

/** The value of the `--sky` declaration inside one theme block of the stylesheet. */
function skyDeclaration(css: string, block: RegExp): string {
  const body = block.exec(css)?.[1] ?? '';
  const declaration = /--sky:\s*([^;]+);/.exec(body)?.[1];
  if (!declaration) throw new Error('no --sky in block');
  return declaration;
}

function hex(r: string, g: string, b: string): string {
  const byte = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

/** The `radial-gradient(RX% RY% at CX% CY%, rgba(..) 0%, rgba(..) F%)` layers, as glows. */
function glowsOf(declaration: string) {
  const re =
    /radial-gradient\((\d+)% (\d+)% at (\d+)% (-?\d+)%,\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)\s*0%,\s*rgba\([^)]*\)\s*(\d+)%\)/g;
  return [...declaration.matchAll(re)].map((m) => ({
    colour: hex(m[5], m[6], m[7]),
    alpha: Number(m[8]),
    centre: [Number(m[3]) / 100, Number(m[4]) / 100],
    radius: [Number(m[1]) / 100, Number(m[2]) / 100],
    fadeAt: Number(m[9]) / 100,
  }));
}

/** The stops of the `linear-gradient(180deg, ...)` layer. */
function stopsOf(declaration: string) {
  const list = /linear-gradient\(180deg,([^)]*)\)/.exec(declaration)?.[1] ?? '';
  return [...list.matchAll(/(#[0-9A-Fa-f]{6})\s+(\d+)%/g)].map((m) => ({
    at: Number(m[2]) / 100,
    colour: m[1].toUpperCase(),
  }));
}

const css = readFileSync(TOKENS, 'utf8');
const LIGHT = skyDeclaration(css, /:root\s*\{([\s\S]*?)\n\}/);
const DARK = skyDeclaration(css, /:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('the %s sky is the prototype --sky', (scheme, declaration) => {
  test('the vertical ramp has the prototype stops, in order', () => {
    expect(stopsOf(declaration).length).toBeGreaterThanOrEqual(4);
    expect(Sky[scheme].stops).toEqual(stopsOf(declaration));
  });

  test('the glows have the prototype colour, strength, centre, radii and fade', () => {
    expect(glowsOf(declaration).length).toBeGreaterThan(0);
    expect(Sky[scheme].glows).toEqual(glowsOf(declaration));
  });
});
