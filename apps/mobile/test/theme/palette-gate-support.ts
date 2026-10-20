/**
 * The pair table of the contrast gate — contract C5-4 (extends 004 C4-3).
 *
 * Each class P1 to P23 of the contract is one small function that returns the pairs it
 * measures, so the table can be read, and extended, one class at a time. The keys a pair
 * "covers" are the keys it really measures: coverage is derived from the pairs, never
 * declared, which is what makes the exhaustiveness check in `contrast-gate.test.ts` honest.
 *
 * Alpha colours (`#RRGGBBAA`: tints, scrims, alpha lines) are composited over their
 * ground with `blend` (C5-2). The fixture for every text-on-scrim and icon-on-scrim pair is
 * a PURE WHITE photograph (`WHITE_PHOTO`): the worst ground a scrim can sit on, because a
 * scrim only darkens it. A pair measured over white is therefore measured over any photo.
 *
 * Derived values are composited in sRGB, which is what React Native does, so no tolerance
 * is needed (the 004 gate carried 0.1 for the kit's OKLAB mixes; Sunrise tints and scrims
 * are authored values, not kit mixes).
 *
 * This is a helper module, not a test file (Jest's `testMatch` only runs `*.test.ts`).
 */
import { GlobeColors } from '@/constants/theme';
import { blend, ContrastFloor, contrastRatio } from '@/theme/contrast';
import type { Palette, PaletteName } from '@/theme/palette';
import { Passport, Sky, colourAt, scrimSpec } from '@/theme/scrim';

import { isFillBelowFloor } from './gate-exemptions';

export type Key = keyof Palette;

/** The fixture ground of P8 to P11: a pure white photograph. */
export const WHITE_PHOTO = '#FFFFFF';

export type PairClass =
  | 'P1'
  | 'P2'
  | 'P3'
  | 'P4'
  | 'P5'
  | 'P6'
  | 'P7'
  | 'P8'
  | 'P9'
  | 'P10'
  | 'P11'
  | 'P12'
  | 'P13'
  | 'P14'
  | 'P15'
  | 'P16'
  | 'P17'
  | 'P18'
  | 'P19'
  | 'P20'
  | 'P22'
  | 'P23';

/** Every class of the C5-4 table, in order; P21 (aliases) is `ALIASES`, below. */
export const PAIR_CLASSES: readonly PairClass[] = [
  'P1',
  'P2',
  'P3',
  'P4',
  'P5',
  'P6',
  'P7',
  'P8',
  'P9',
  'P10',
  'P11',
  'P12',
  'P13',
  'P14',
  'P15',
  'P16',
  'P17',
  'P18',
  'P19',
  'P20',
  'P22',
  'P23',
];

export interface Pair {
  cls: PairClass;
  label: string;
  /** The ground the foreground sits on: a key, or a key plus its tint or fixture. */
  ground: string;
  /** Every Palette key this pair measures. Coverage is derived from this. */
  keys: readonly string[];
  floor: number;
  ratio: number;
}

export interface Gate {
  palette: Palette;
  name: PaletteName;
  contrast: boolean;
  textFloor: number;
  largeFloor: number;
}

export function isContrastTheme(name: PaletteName): boolean {
  return name.endsWith('-contrast');
}

export function gateFor(palette: Palette, name: PaletteName): Gate {
  const contrast = isContrastTheme(name);
  return {
    palette,
    name,
    contrast,
    textFloor: contrast ? ContrastFloor.increasedContrast : ContrastFloor.normalText,
    largeFloor: contrast ? ContrastFloor.increasedContrast : ContrastFloor.largeText,
  };
}

/** `#RRGGBBAA` composited over an opaque ground; an opaque colour is returned as is. */
export function flatten(colour: string, ground: string): string {
  if (colour.length !== 9) return colour;
  return blend(colour.slice(0, 7), ground, parseInt(colour.slice(7), 16) / 255);
}

export const GROUNDS = [
  'canvas',
  'surface',
  'surfaceSecondary',
] as const satisfies readonly Key[];
const PAPER_GROUNDS = ['surface', 'surfaceSecondary'] as const satisfies readonly Key[];

/** Text colours that sit on a tint of their own hue (P4). */
export const TINTED_TEXT = [
  ['accentText', 'accentTint'],
  ['aquaInk', 'aquaTint'],
  ['danger', 'dangerTint'],
  ['success', 'successTint'],
  ['amberInk', 'amberTint'],
] as const satisfies readonly (readonly [Key, Key])[];

/** The aliases of C5-3: no separate value, asserted equal (P21). */
export const ALIASES = [
  ['link', 'ink'],
  ['placeholder', 'subtle'],
  ['overlay', 'surface'],
  ['statusActive', 'accentLine'],
  ['statusPlanning', 'amberLine'],
  ['statusPlanningInk', 'amberInk'],
  ['statusPast', 'muted'],
  ['pending', 'amberInk'],
] as const satisfies readonly (readonly [Key, Key])[];

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

/** `fg` on a `tint` (an alpha wash or an opaque colour) composited over `ground`. */
function onTint(gate: Gate, cls: PairClass, fg: Key, tint: Key, ground: Key): Pair {
  const flat = flatten(gate.palette[tint], gate.palette[ground]);
  return {
    cls,
    label: `${fg} on ${tint} over ${ground}`,
    ground: `${ground} + ${tint}`,
    keys: [fg, tint, ground],
    floor: gate.textFloor,
    ratio: contrastRatio(gate.palette[fg], flat),
  };
}

/** A colour (not a palette key) on a ground that is not a palette key either. */
function fixture(
  cls: PairClass,
  keys: readonly string[],
  label: string,
  ratio: number,
  floor: number,
): Pair {
  return { cls, label, ground: label, keys, floor, ratio };
}

function p1(gate: Gate): Pair[] {
  return (['ink', 'muted', 'subtle'] as const).flatMap((text) =>
    GROUNDS.map((ground) => plain(gate, 'P1', text, ground, gate.textFloor)),
  );
}

function p2(gate: Gate): Pair[] {
  return [plain(gate, 'P2', 'placeholder', 'surfaceSecondary', gate.textFloor)];
}

function p3(gate: Gate): Pair[] {
  const text = [
    'accentText',
    'aquaInk',
    'danger',
    'success',
    'amberInk',
    'pending',
  ] as const;
  return text.flatMap((fg) =>
    GROUNDS.map((ground) => plain(gate, 'P3', fg, ground, gate.textFloor)),
  );
}

function p4(gate: Gate): Pair[] {
  return TINTED_TEXT.flatMap(([text, tint]) =>
    PAPER_GROUNDS.map((ground) => onTint(gate, 'P4', text, tint, ground)),
  );
}

function p5(gate: Gate): Pair[] {
  const pairs = [
    ['accentInk', 'accent'],
    ['accentInk', 'accentPress'],
    ['dangerInk', 'danger'],
    ['onInk', 'ink'],
    // The kit's own foregrounds: `--success-foreground` and `--warning-foreground`
    // read `onInk`, and `--warning` reads `amberInk` (C5-6).
    ['onInk', 'success'],
    ['onInk', 'amberInk'],
  ] as const satisfies readonly (readonly [Key, Key])[];
  return pairs.map(([fg, bg]) => plain(gate, 'P5', fg, bg, gate.textFloor));
}

function p6(gate: Gate): Pair[] {
  return [plain(gate, 'P6', 'ink', 'pressed', gate.textFloor)];
}

function p7(gate: Gate): Pair[] {
  return [
    plain(gate, 'P7', 'toastInk', 'toastSurface', gate.textFloor),
    plain(gate, 'P7', 'accentPress', 'toastSurface', gate.textFloor),
  ];
}

/** The alphas of a scrim that sit under text, over a white photograph. */
export function scrimAlphasUnderText(contrast: boolean): number[] {
  const spec = scrimSpec(contrast);
  const bottom = spec.bottom.filter((stop) => stop.at >= 0.55).map((stop) => stop.alpha);
  return [
    spec.top.alpha,
    ...bottom,
    spec.caption.minUnderText,
    spec.caption.rampTo,
    spec.caption.blockTo,
  ];
}

function p8(gate: Gate): Pair[] {
  const { rgb } = scrimSpec(gate.contrast);
  return [...new Set(scrimAlphasUnderText(gate.contrast))].map((alpha) =>
    fixture(
      'P8',
      ['onPhoto'],
      `onPhoto on scrim ${alpha} over a white photograph`,
      contrastRatio(gate.palette.onPhoto, blend(rgb, WHITE_PHOTO, alpha)),
      gate.textFloor,
    ),
  );
}

function p9(gate: Gate): Pair[] {
  const stops = [1, 2, 3].flatMap((n) => [`cover${n}Start`, `cover${n}End`]) as Key[];
  return stops.map((stop) => plain(gate, 'P9', 'onPhoto', stop, gate.textFloor));
}

/** The passport card: its two stops, their mid colour, and the amber glow over the mid. */
export function passportGrounds(): { label: string; colour: string }[] {
  const [from, to] = Passport.stops;
  const mid = blend(to, from, 0.5);
  const { colour, alpha } = Passport.glow;
  return [
    { label: `stop ${from}`, colour: from },
    { label: `stop ${to}`, colour: to },
    { label: `mid ${mid}`, colour: mid },
    { label: `glow peak over ${mid}`, colour: blend(colour, mid, alpha) },
  ];
}

function p10(gate: Gate): Pair[] {
  const secondary = gate.contrast
    ? Passport.secondaryAlpha.contrast
    : Passport.secondaryAlpha.base;
  return passportGrounds().flatMap(({ label, colour }) => [
    fixture(
      'P10',
      ['onPhoto'],
      `onPhoto on the passport ${label}`,
      contrastRatio(gate.palette.onPhoto, colour),
      gate.textFloor,
    ),
    fixture(
      'P10',
      ['onPhoto'],
      `onPhoto at ${secondary} on the passport ${label}`,
      contrastRatio(blend(gate.palette.onPhoto, colour, secondary), colour),
      gate.textFloor,
    ),
  ]);
}

function p11(gate: Gate): Pair[] {
  const disc = flatten(gate.palette.scrimButton, WHITE_PHOTO);
  return [
    fixture(
      'P11',
      ['onPhoto', 'scrimButton'],
      'onPhoto icon on scrimButton over a white photograph',
      contrastRatio(gate.palette.onPhoto, disc),
      ContrastFloor.nonText,
    ),
  ];
}

function p12(gate: Gate): Pair[] {
  return GROUNDS.map((ground) =>
    plain(gate, 'P12', 'border', ground, ContrastFloor.nonText),
  );
}

function p13(gate: Gate): Pair[] {
  return GROUNDS.map((ground) =>
    plain(gate, 'P13', 'focus', ground, ContrastFloor.nonText),
  );
}

function p14(gate: Gate): Pair[] {
  return (['accentLine', 'aquaLine', 'amberLine'] as const).flatMap((line) =>
    GROUNDS.map((ground) => plain(gate, 'P14', line, ground, ContrastFloor.nonText)),
  );
}

/** The edge ring, and the accent fill unless it is the pinned `FILL_BELOW_FLOOR` entry. */
function p15(gate: Gate): Pair[] {
  const fills = GROUNDS.filter(
    (ground) => !isFillBelowFloor(gate.name, 'accent', ground),
  );
  return [
    plain(gate, 'P15', 'accentLine', 'surface', ContrastFloor.nonText),
    ...fills.map((ground) => plain(gate, 'P15', 'accent', ground, ContrastFloor.nonText)),
  ];
}

function p16(gate: Gate): Pair[] {
  const grab = flatten(gate.palette.grab, gate.palette.surface);
  return [
    {
      cls: 'P16',
      label: 'grab on surface',
      ground: 'surface',
      keys: ['grab', 'surface'],
      floor: ContrastFloor.nonText,
      ratio: contrastRatio(grab, gate.palette.surface),
    },
  ];
}

function p17(gate: Gate): Pair[] {
  return [plain(gate, 'P17', 'muted', 'surface', ContrastFloor.nonText)];
}

function p18(gate: Gate): Pair[] {
  return [plain(gate, 'P18', 'ink', 'surface', ContrastFloor.nonText)];
}

/** The hairline as an explicit boundary: the two contrast themes only (FR-072). */
function p19(gate: Gate): Pair[] {
  if (!gate.contrast) return [];
  return PAPER_GROUNDS.map((ground) => {
    const line = flatten(gate.palette.hairline, gate.palette[ground]);
    return {
      cls: 'P19' as const,
      label: `hairline on ${ground}`,
      ground,
      keys: ['hairline', ground],
      floor: ContrastFloor.nonText,
      ratio: contrastRatio(line, gate.palette[ground]),
    };
  });
}

function p20(gate: Gate): Pair[] {
  const stamps = ['stampCoral', 'stampNavy', 'stampTeal', 'stampGreen'] as const;
  return stamps.map((stamp) =>
    plain(gate, 'P20', stamp, 'surfaceSecondary', ContrastFloor.nonText),
  );
}

/** The grounds the sky puts behind text: every stop, and every glow at its peak. */
export function skyGrounds(name: PaletteName): { label: string; colour: string }[] {
  const sky = Sky[name.startsWith('dark') ? 'dark' : 'light'];
  const glows = sky.glows.map((glow) => {
    const under = colourAt(sky.stops, glow.centre[1]);
    return {
      label: `glow ${glow.colour}`,
      colour: blend(glow.colour, under, glow.alpha),
    };
  });
  return [
    ...sky.stops.map((stop) => ({ label: `stop ${stop.colour}`, colour: stop.colour })),
    ...glows,
  ];
}

/** `ink` and `muted` at the text floor, `accentText` at the large floor (display size). */
function p23(gate: Gate): Pair[] {
  return skyGrounds(gate.name).flatMap(({ label, colour }) => [
    fixture(
      'P23',
      ['ink'],
      `ink on the sky ${label}`,
      contrastRatio(gate.palette.ink, colour),
      gate.textFloor,
    ),
    fixture(
      'P23',
      ['muted'],
      `muted on the sky ${label}`,
      contrastRatio(gate.palette.muted, colour),
      gate.textFloor,
    ),
    fixture(
      'P23',
      ['accentText'],
      `accentText (display size) on the sky ${label}`,
      contrastRatio(gate.palette.accentText, colour),
      gate.largeFloor,
    ),
  ]);
}

/** Every ratio pair of C5-4 for one theme, with the floor that theme holds (P22: `globePairs`). */
export function buildPairs(palette: Palette, name: PaletteName): Pair[] {
  const gate = gateFor(palette, name);
  return [
    ...p1(gate),
    ...p2(gate),
    ...p3(gate),
    ...p4(gate),
    ...p5(gate),
    ...p6(gate),
    ...p7(gate),
    ...p8(gate),
    ...p9(gate),
    ...p10(gate),
    ...p11(gate),
    ...p12(gate),
    ...p13(gate),
    ...p14(gate),
    ...p15(gate),
    ...p16(gate),
    ...p17(gate),
    ...p18(gate),
    ...p19(gate),
    ...p20(gate),
    ...p23(gate),
  ];
}

/** The arcs and keylines of C5-11 against their casing and the land (3:1, no contrast variant). */
export function globePairs(scheme: 'light' | 'dark'): Pair[] {
  const globe = GlobeColors[scheme];
  const arcs = ['active', 'activeEnd', 'past', 'pastEnd', 'planning'] as const;
  const keylines = ['visitedKeyline', 'plannedKeyline'] as const;
  const lands = ['land', 'landShade'] as const;
  const onCasing = arcs.map((arc) => ({
    cls: 'P22' as const,
    label: `${arc} on casing`,
    ground: 'casing',
    keys: [],
    floor: ContrastFloor.nonText,
    ratio: contrastRatio(globe[arc], globe.casing),
  }));
  const onLand = keylines.flatMap((line) =>
    lands.map((land) => ({
      cls: 'P22' as const,
      label: `${line} on ${land}`,
      ground: land,
      keys: [],
      floor: ContrastFloor.nonText,
      ratio: contrastRatio(globe[line], globe[land]),
    })),
  );
  return [...onCasing, ...onLand];
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

/** Every Palette key a set of pairs measures, plus the aliases P21 asserts equal. */
export function coveredKeys(pairs: Pair[]): Set<string> {
  return new Set([...pairs.flatMap((pair) => pair.keys), ...ALIASES.flat()]);
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
