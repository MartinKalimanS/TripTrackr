/**
 * The Atlas palette values and the Atlas-only treatments that feature 005 retires (FR-083,
 * SC-001, contract C5-1 (b)) — the search lists and the scanner the guards share.
 *
 * `atlas-values.test.ts` searches `src/` for the hex literals below; `no-neumorphism.test.ts`
 * searches it for the treatments. Both walk the same tree: every text file under
 * `apps/mobile/src`, tests that sit beside the code included.
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const SRC = path.resolve(__dirname, '../../src');

/**
 * Every hex literal of feature 004's palette (`palette.data.js` before T514, four themes) and
 * its two globe tones that Sunrise dropped, upper case. `#7A4800` is the one Atlas value that
 * is also a Sunrise value (the light-contrast `amberLine`), so it is NOT listed: the guard
 * must never flag the look it protects. A value the Sunrise palette adopts later is deleted
 * from this list (the test "shares no value with the Sunrise look" says so).
 */
export const ATLAS_PALETTE_VALUES: readonly string[] = Object.freeze([
  // light
  '#F5F2EB', // canvas
  '#FEFDFB', // surface, overlay, the label on a fill
  '#EFEBE2', // surfaceSecondary
  '#E8E4DA', // surfaceTertiary
  '#E4DFD3', // separator
  '#111B2866', // backdrop
  '#111B28', // ink
  '#4F5966', // muted
  '#505A67', // placeholder
  '#2456C7', // the cobalt accent: accent, link, focus, statusActive, the globe active arc
  '#7E8792', // border
  '#A61816', // danger
  '#006336', // success
  '#7F4A00', // warning, statusPlanningInk
  '#9A5B00', // statusPlanning, the globe planning arc
  '#515761', // statusPast
  '#6140B0', // pending
  // dark
  '#091018',
  '#141B25',
  '#1C2530',
  '#212A37',
  '#222B37',
  '#04080E99',
  '#F4F1EC',
  '#A3ACB8',
  '#7FA8FF', // the dark accent
  '#6B7583',
  '#F7857D',
  '#65C98C',
  '#F2B45C',
  '#A1AAB5',
  '#B9A4F5',
  // light-contrast
  '#FAF8F3',
  '#FEFEFC',
  '#F2EFE8',
  '#EAE6DD',
  '#BDB6A8',
  '#0A111B99',
  '#0A111B',
  '#353D48',
  '#13347D',
  '#4A525C',
  '#710E0D',
  '#004224',
  '#533200',
  '#343A44',
  '#3F277F',
  // dark-contrast
  '#05090E',
  '#0D131B',
  '#151D27',
  '#1B2531',
  '#364150',
  '#02050AB3',
  '#FBFAF7',
  '#C6CDD6',
  '#BFD4FF',
  '#FFC5BF',
  '#95E5B4',
  '#FFD08A',
  '#FFC978',
  '#CED4DC',
  '#D9CDFB',
  // the globe's past arc tones
  '#6B7482',
  '#8C96A5',
]);

/** A literal followed by no further hex digit, so `#111B28` does not match `#111B28AB`. */
export function atlasLiteralPattern(value: string): RegExp {
  return new RegExp(`${value}(?![0-9A-Fa-f])`, 'i');
}

const LITERAL_PATTERNS = ATLAS_PALETTE_VALUES.map(
  (value) => [value, atlasLiteralPattern(value)] as const,
);

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.md']);

/** Every text file under `directory`, recursively. */
export function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    if (statSync(entry).isDirectory()) return sourceFiles(entry);
    return TEXT_EXTENSIONS.has(path.extname(entry)) ? [entry] : [];
  });
}

/** `file:line  #LITERAL  trimmed source line`, one per Atlas literal found in `text`. */
export function literalHitsIn(file: string, text?: string): string[] {
  const relative = file.startsWith('src/')
    ? file
    : `src/${path.relative(SRC, file).split(path.sep).join('/')}`;
  const source = text ?? readFileSync(file, 'utf8');
  return source
    .split(/\r?\n/)
    .flatMap((line, index) =>
      LITERAL_PATTERNS.filter(([, pattern]) => pattern.test(line)).map(
        ([value]) => `${relative}:${index + 1}  ${value}  ${line.trim().slice(0, 100)}`,
      ),
    );
}

export interface AtlasTreatment {
  label: string;
  pattern: RegExp;
  /** A line the pattern is meant to catch: the pattern itself is pinned by a test. */
  sample: string;
  /**
   * The most lines under `src/` that may match: the count T564 found, never raised. A
   * ratchet: a NEW use of an Atlas-only treatment fails the build, and a removal never does
   * (lower the number when you remove one). `ATLAS_RETIREMENT=1` ignores it and demands zero.
   */
  ceiling: number;
}

/**
 * The Atlas-only treatments of FR-083 and what is left of each after T564: the 004 shape
 * tables (`AtlasRadius` and `AtlasSpacing`, gone since their readers moved to `Radii` and
 * `Space`: the ceiling is zero, a regression guard), the flat tab strip's selection mark (none
 * left: the ceiling is zero, a regression guard) and the two 004 text roles that have no Sunrise name
 * (`largeTitle` and `numeric`, still read by `Text` itself, `date-field` and the photo viewer).
 */
export const ATLAS_TREATMENTS: readonly AtlasTreatment[] = Object.freeze([
  {
    label: 'the Atlas radius and spacing tables (Radii and Space are the Sunrise ones)',
    pattern: /\bAtlas(?:Radius|Spacing)(?:Name)?\b/,
    sample: 'borderRadius: AtlasRadius.lg',
    ceiling: 0,
  },
  {
    label: "the flat tab strip's selection mark (the Sunrise tab bar is a floating pill)",
    pattern: /\bmark(?:Width|Height)\b/,
    sample: 'width: TabMetrics.markWidth,',
    ceiling: 0,
  },
  {
    label:
      'the 004 text roles largeTitle and numeric (Sunrise: variant="display" and "numeral")',
    pattern: /\btype="(?:largeTitle|numeric)"/,
    sample: '<Text type="largeTitle">',
    ceiling: 21,
  },
]);

/** `file:line  label  trimmed source line` for every match of `treatment` under `files`. */
export function treatmentHitsIn(
  treatment: AtlasTreatment,
  file: string,
  text?: string,
): string[] {
  const relative = `src/${path.relative(SRC, file).split(path.sep).join('/')}`;
  const source = text ?? readFileSync(file, 'utf8');
  return source
    .split(/\r?\n/)
    .flatMap((line, index) =>
      treatment.pattern.test(line)
        ? [`${relative}:${index + 1}  ${line.trim().slice(0, 100)}`]
        : [],
    );
}
