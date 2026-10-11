/**
 * T451 — SC-001 and FR-038, the executable form of the retirement check in
 * quickstart.md section 9.
 *
 * No screen, shared component or style definition of the application may express (or
 * still be named after) the raised and recessed soft-shadow look of feature 002. The
 * application source is every file under `apps/mobile/src`, tests that sit beside the
 * code included: a primitive that is gone must not survive in a mock or a comment either.
 *
 * What is NOT searched, on purpose: `test/` (its guards name the retired primitives in
 * order to assert that no screen imports them), `specs/002-neumorphic-ui/` (frozen
 * history) and git history, the only places the word may remain.
 *
 * The patterns are the ones the quickstart's `grep -rniE` uses (case-insensitive), plus
 * `depth=`, the retired prop of the old surface components.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../src');

const RETIRED: readonly (readonly [label: string, pattern: RegExp])[] = [
  ['the word "neumorphic" (or neumorph...)', /neumorph/i],
  ['surfaceStyle', /surfaceStyle/i],
  ['PressableSurface', /PressableSurface/i],
  ['elevationProfile', /elevationProfile/i],
  ['the retired `treatment=` prop', /treatment=/i],
  ['the retired `depth=` prop', /depth=/i],
];

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md']);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    if (statSync(entry).isDirectory()) return sourceFiles(entry);
    return TEXT_EXTENSIONS.has(path.extname(entry)) ? [entry] : [];
  });
}

/** `relative/path:line  label  trimmed source line`, one per hit. */
function hitsIn(file: string): string[] {
  const relative = path.relative(SRC, file).split(path.sep).join('/');
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .flatMap((line, index) =>
      RETIRED.filter(([, pattern]) => pattern.test(line)).map(
        ([label]) =>
          `src/${relative}:${index + 1}  ${label}  ${line.trim().slice(0, 100)}`,
      ),
    );
}

describe('the neumorphic look is retired from the application source (SC-001, FR-038)', () => {
  const files = sourceFiles(SRC);

  test('the search covers the real source tree, not an empty one', () => {
    // A path typo would make "no hits" vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((file) => file.endsWith(path.join('theme', 'palette.ts')))).toBe(
      true,
    );
  });

  test('no file under src/ names a retired primitive, prop or look', () => {
    const hits = files.flatMap(hitsIn);
    expect(hits).toEqual([]);
  });

  test.each(RETIRED)(
    'the pattern for %s matches what it is meant to catch',
    (_, pattern) => {
      // The patterns themselves are pinned, so a loosened regex cannot turn the check green.
      const samples: Record<string, string> = {
        '/neumorph/i': 'A Neumorphic card',
        '/surfaceStyle/i': 'surfaceStyle(treatment)',
        '/PressableSurface/i': '<PressableSurface />',
        '/elevationProfile/i': 'const { elevationProfile } = x',
        '/treatment=/i': '<Surface treatment="raised" />',
        '/depth=/i': '<Surface depth=2 />',
      };
      expect(pattern.test(samples[String(pattern)])).toBe(true);
    },
  );
});
