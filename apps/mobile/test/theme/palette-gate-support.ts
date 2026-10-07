/**
 * The pair table of the palette contrast gate — contract C4-3.
 *
 * Each class of the contract is one small function that returns the pairs it measures, so
 * the table can be read, and extended, one class at a time. The keys a pair "covers" are
 * the keys it really measures: coverage is derived from the pairs, never declared, which
 * is what makes the exhaustiveness check in `palette-gate.test.ts` honest.
 *
 * Derived fills (soft chips, hover, pressed) are what the kit computes with
 * `color-mix(in oklab, ...)`; they are composited here in sRGB with `blend`, so those
 * pairs carry the 0.1 tolerance stated in C4-2 on top of their floor.
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */
import { blend, ContrastFloor, contrastRatio } from '@/theme/contrast';
import type { Palette, PaletteName } from '@/theme/palette';

import { PINNED_SOFT_CHIP_EXCEPTIONS } from './gate-exemptions';

export type Key = keyof Palette;

/** Rounding differences between sRGB compositing and the kit's OKLAB mix (C4-2). */
export const BLEND_TOLERANCE = 0.1;
/** The kit's soft chip: `color-mix(in oklab, var(--accent) 15%, transparent)`. */
export const SOFT_ALPHA = 0.15;
/** The kit's derived hover (default, 4%) and pressed (accent and field, 10%) mixes. */
export const HOVER_ALPHA = 0.04;
export const PRESSED_ALPHA = 0.1;

/** Every neutral fill text can sit on. */
export const NEUTRAL_FILLS = [
  'canvas',
  'surface',
  'surfaceSecondary',
  'surfaceTertiary',
  'overlay',
] as const satisfies readonly Key[];

/** Where coloured text, and a soft chip of it, can sit: every neutral fill. */
export const TEXT_GROUNDS = NEUTRAL_FILLS;

/** The neutral fills a focus ring touches. Never the accent: see `FocusRing`. */
export const FOCUS_RING_GROUNDS = [
  'canvas',
  'surface',
  'surfaceSecondary',
] as const satisfies readonly Key[];

const BASE_SURFACES = ['canvas', 'surface'] as const satisfies readonly Key[];

/** Colours the product sets as text. */
export const COLOUR_TEXT = [
  'accent',
  'link',
  'danger',
  'success',
  'warning',
  'statusActive',
  'statusPast',
  'statusPlanningInk',
  'pending',
] as const satisfies readonly Key[];

/** Filled controls and the label that sits on each. */
export const FILLS_WITH_LABEL = [
  ['accent', 'accentInk'],
  ['danger', 'dangerInk'],
  ['success', 'successInk'],
  ['warning', 'warningInk'],
] as const satisfies readonly (readonly [Key, Key])[];

export type PairClass =
  | 'text on neutral fills'
  | 'placeholder on field fill'
  | 'coloured text'
  | 'coloured text on its 15% soft chip'
  | 'label on its filled control'
  | 'text on derived hover and pressed fills'
  | 'large text'
  | 'field border'
  | 'boundary explicit (contrast themes)'
  | 'filled control'
  | 'row cue'
  | 'focus ring'
  | 'status mark';

export interface Pair {
  cls: PairClass;
  label: string;
  /** The ground the foreground sits on: a key, or a key plus its derived mix. */
  ground: string;
  /** Every Palette key this pair measures. Coverage is derived from this. */
  keys: Key[];
  floor: number;
  ratio: number;
}

interface Gate {
  palette: Palette;
  name: PaletteName;
  contrast: boolean;
  textFloor: number;
  largeFloor: number;
}

export function isContrastTheme(name: PaletteName): boolean {
  return name.endsWith('-contrast');
}

function gateFor(palette: Palette, name: PaletteName): Gate {
  const contrast = isContrastTheme(name);
  return {
    palette,
    name,
    contrast,
    textFloor: contrast ? ContrastFloor.increasedContrast : ContrastFloor.normalText,
    largeFloor: contrast ? ContrastFloor.increasedContrast : ContrastFloor.largeText,
  };
}

function plain(gate: Gate, cls: PairClass, fg: Key, bg: Key, floor: number): Pair {
  return {
    cls,
    label: `${fg} on ${bg}`,
    ground: bg,
    keys: [fg, bg],
    floor,
    ratio: contrastRatio(gate.palette[fg], gate.palette[bg]),
  };
}

/** `fg` on `fill` with `mixed` composited over it at `alpha` (a soft, hover or pressed fill). */
function derived(
  gate: Gate,
  cls: PairClass,
  fg: Key,
  mixed: Key,
  fill: Key,
  alpha: number,
): Pair {
  const ground = `${fill} + ${Math.round(alpha * 100)}% ${mixed}`;
  return {
    cls,
    label: `${fg} on ${ground}`,
    ground,
    keys: [fg, mixed, fill],
    floor: gate.textFloor + BLEND_TOLERANCE,
    ratio: contrastRatio(
      gate.palette[fg],
      blend(gate.palette[mixed], gate.palette[fill], alpha),
    ),
  };
}

function textOnNeutralFills(gate: Gate): Pair[] {
  return (['ink', 'muted'] as const).flatMap((text) =>
    NEUTRAL_FILLS.map((fill) =>
      plain(gate, 'text on neutral fills', text, fill, gate.textFloor),
    ),
  );
}

function placeholderOnFieldFill(gate: Gate): Pair[] {
  return [
    plain(
      gate,
      'placeholder on field fill',
      'placeholder',
      'surfaceSecondary',
      gate.textFloor,
    ),
  ];
}

function colouredText(gate: Gate): Pair[] {
  return COLOUR_TEXT.flatMap((colour) =>
    TEXT_GROUNDS.map((ground) =>
      plain(gate, 'coloured text', colour, ground, gate.textFloor),
    ),
  );
}

/** Whether a soft chip of `colour` on `ground` is the pinned exception for this theme. */
export function isPinnedSoftChipException(
  name: PaletteName,
  colour: Key,
  ground: Key,
): boolean {
  return PINNED_SOFT_CHIP_EXCEPTIONS.some(
    (exception) =>
      exception.theme === name &&
      exception.colours.includes(colour) &&
      exception.grounds.includes(ground),
  );
}

/** One soft-chip pair, whether or not it is excepted: the measurement itself. */
export function softChipPair(
  palette: Palette,
  name: PaletteName,
  colour: Key,
  ground: Key,
): Pair {
  return derived(
    gateFor(palette, name),
    'coloured text on its 15% soft chip',
    colour,
    colour,
    ground,
    SOFT_ALPHA,
  );
}

function softChips(gate: Gate): Pair[] {
  return COLOUR_TEXT.flatMap((colour) =>
    TEXT_GROUNDS.filter(
      (ground) => !isPinnedSoftChipException(gate.name, colour, ground),
    ).map((ground) => softChipPair(gate.palette, gate.name, colour, ground)),
  );
}

function labelOnFilledControl(gate: Gate): Pair[] {
  return FILLS_WITH_LABEL.map(([fill, label]) =>
    plain(gate, 'label on its filled control', label, fill, gate.textFloor),
  );
}

function derivedHoverAndPressed(gate: Gate): Pair[] {
  const cls = 'text on derived hover and pressed fills';
  return [HOVER_ALPHA, PRESSED_ALPHA].flatMap((alpha) => [
    ...NEUTRAL_FILLS.flatMap((fill) => [
      derived(gate, cls, 'ink', 'ink', fill, alpha),
      derived(gate, cls, 'muted', 'ink', fill, alpha),
    ]),
    derived(gate, cls, 'placeholder', 'ink', 'surfaceSecondary', alpha),
    ...FILLS_WITH_LABEL.map(([fill, label]) =>
      derived(gate, cls, label, label, fill, alpha),
    ),
  ]);
}

function largeText(gate: Gate): Pair[] {
  return BASE_SURFACES.flatMap((surface) => [
    plain(gate, 'large text', 'ink', surface, gate.largeFloor),
    plain(gate, 'large text', 'accent', surface, gate.largeFloor),
  ]);
}

function fieldBorder(gate: Gate): Pair[] {
  const fills = ['canvas', 'surface', 'surfaceSecondary'] as const;
  return fills.flatMap((fill) => [
    plain(gate, 'field border', 'border', fill, ContrastFloor.nonText),
    // FR-027: "boundaries MUST be explicit" under increased contrast. Stricter than C4-3.
    ...(gate.contrast
      ? [plain(gate, 'boundary explicit (contrast themes)', 'border', fill, 4.5)]
      : []),
  ]);
}

function filledControl(gate: Gate): Pair[] {
  return BASE_SURFACES.map((surface) =>
    plain(gate, 'filled control', 'accent', surface, ContrastFloor.nonText),
  );
}

function rowCue(gate: Gate): Pair[] {
  return [plain(gate, 'row cue', 'muted', 'surface', ContrastFloor.nonText)];
}

function focusRing(gate: Gate): Pair[] {
  return FOCUS_RING_GROUNDS.map((ground) =>
    plain(gate, 'focus ring', 'focus', ground, ContrastFloor.nonText),
  );
}

function statusMarks(gate: Gate): Pair[] {
  const marks = ['statusPlanning', 'statusActive', 'statusPast', 'pending'] as const;
  return marks.flatMap((mark) =>
    BASE_SURFACES.map((surface) =>
      plain(gate, 'status mark', mark, surface, ContrastFloor.nonText),
    ),
  );
}

/** Every pair of contract C4-3 for one theme, with the floor that theme holds. */
export function buildPairs(palette: Palette, name: PaletteName): Pair[] {
  const gate = gateFor(palette, name);
  return [
    ...textOnNeutralFills(gate),
    ...placeholderOnFieldFill(gate),
    ...colouredText(gate),
    ...softChips(gate),
    ...labelOnFilledControl(gate),
    ...derivedHoverAndPressed(gate),
    ...largeText(gate),
    ...fieldBorder(gate),
    ...filledControl(gate),
    ...rowCue(gate),
    ...focusRing(gate),
    ...statusMarks(gate),
  ];
}

export function classesOf(pairs: Pair[]): PairClass[] {
  return [...new Set(pairs.map((pair) => pair.cls))];
}

/** The pairs of `cls` that fall below their floor, in a form a failing test prints well. */
export function failures(pairs: Pair[], cls: PairClass) {
  return pairs
    .filter((pair) => pair.cls === cls && pair.ratio < pair.floor)
    .map((pair) => ({
      pair: pair.label,
      ratio: Number(pair.ratio.toFixed(2)),
      floor: Number(pair.floor.toFixed(2)),
    }));
}

/** Every Palette key a set of pairs measures. */
export function coveredKeys(pairs: Pair[]): Set<string> {
  return new Set(pairs.flatMap((pair) => pair.keys));
}

/**
 * The keys that are neither measured by a pair nor on the allowlist. Pure: the gate and
 * its own regression test both call this one function, so the test that "a new key is
 * reported" exercises the very code the exhaustiveness check runs.
 */
export function unclassifiedKeys(
  keys: readonly string[],
  covered: ReadonlySet<string>,
  exempt: ReadonlySet<string>,
): string[] {
  return keys.filter((key) => !covered.has(key) && !exempt.has(key));
}
