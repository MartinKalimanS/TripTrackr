/**
 * The scan behind the fixed-height ratchet (feature 005, T561; FR-074; SC-007; not a test
 * file): every place the application source pins a SIZE that text could outgrow at a large
 * text scale. Pure over source text, so `fixed-heights.test.ts` pins it on small inputs and
 * then runs it over the tree.
 *
 * Three kinds of site:
 *
 * - `height`: a `height:` style property (not `minHeight`, `maxHeight` or `lineHeight`, and not
 *   a `height: number` type member);
 * - `class`: a Tailwind-style `h-<n>`, `h-[<n>px]` or `size-<n>` class;
 * - `noScaling`: `allowFontScaling={false}`, a text that ignores the system text size.
 *
 * Comment lines are skipped, so prose about a height never counts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export type FixedSizeKind = 'height' | 'class' | 'noScaling';

export interface FixedSizeSite {
  line: number;
  kind: FixedSizeKind;
  text: string;
}

const HEIGHT = /(?<![A-Za-z])height\s*:(?!\s*(?:number|string|undefined)\b)/;
const CLASS = /(?<![\w-])(?:h|size)-(?:\[[^\]\s]+\]|\d+(?:\.\d+)?|px)(?![\w-])/;
const NO_SCALING = /allowFontScaling=\{false\}/;

function isComment(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  );
}

function kindsOf(code: string): FixedSizeKind[] {
  const kinds: FixedSizeKind[] = [];
  if (HEIGHT.test(code)) kinds.push('height');
  if (CLASS.test(code)) kinds.push('class');
  if (NO_SCALING.test(code)) kinds.push('noScaling');
  return kinds;
}

/** The fixed-size sites of one source text, in line order (a line with two kinds counts twice). */
export function fixedSizesIn(source: string): FixedSizeSite[] {
  return source.split(/\r?\n/).flatMap((raw, index) => {
    const trimmed = raw.trim();
    if (isComment(trimmed)) return [];
    const code = trimmed.replace(/\s\/\/.*$/, '');
    return kindsOf(code).map((kind) => ({ line: index + 1, kind, text: trimmed }));
  });
}

const SRC = path.resolve(__dirname, '../../src');
const EXTENSIONS = new Set(['.ts', '.tsx']);

/**
 * What the sweep reads: the screens and the components (where a style is drawn), not the
 * tests nor the dev gallery (never shipped to a traveller). Hooks, features and theme files
 * hold arithmetic, and the style that uses it sits in a component the scan does read.
 */
function isScanned(relative: string): boolean {
  return (
    EXTENSIONS.has(path.extname(relative)) &&
    (relative.startsWith('src/components/') || relative.startsWith('src/app/')) &&
    !/\.test\.tsx?$/.test(relative) &&
    !relative.includes('__tests__/') &&
    !relative.startsWith('src/components/dev/') &&
    !relative.startsWith('src/app/(dev)/')
  );
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    return statSync(entry).isDirectory() ? filesUnder(entry) : [entry];
  });
}

/** Every scanned source file (repository-relative, forward slashes) with its sites. */
export function fixedSizesInTree(): Map<string, FixedSizeSite[]> {
  const root = path.resolve(SRC, '..');
  const found = new Map<string, FixedSizeSite[]>();
  for (const file of filesUnder(SRC)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (!isScanned(relative)) continue;
    const sites = fixedSizesIn(readFileSync(file, 'utf8'));
    if (sites.length > 0) found.set(relative, sites);
  }
  return found;
}
