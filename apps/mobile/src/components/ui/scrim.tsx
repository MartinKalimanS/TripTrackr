/**
 * `Scrim` - the ONE component that draws a gradient (feature 005; contract C5-10 and C5-19;
 * research D5-10; FR-007, FR-008, FR-068).
 *
 *   <Scrim kind="top" />                    the status-bar band over a photograph
 *   <Scrim kind="bottom" />                 the darkening over a photograph's lower part
 *   <Scrim kind="caption">...text...</Scrim> a ramp and a block that WRAPS its text
 *   <Scrim kind="sky" />                    the warm (or night) sky behind the globe
 *   <Scrim kind="cover" palette={1} />      a generated cover's gradient (`GeneratedCover`)
 *
 * The VALUES are data in `src/theme/scrim.ts` (stops, alphas, the sky, the passport glow);
 * the contrast gate measures them over a PURE WHITE photograph, and `scrim.test.tsx` measures
 * what this file renders, so neither can be retuned unseen. This file turns them into pixels
 * and writes no number of its own. An ESLint rule rejects a gradient string anywhere else.
 *
 * How it paints: React Native 0.86's `experimental_backgroundImage` style, in its TYPED
 * OBJECT form (an array of `{ type: 'linear-gradient', direction, colorStops }` and
 * `{ type: 'radial-gradient', shape, size, position, colorStops }`), not as a CSS string and
 * not through Uniwind's `bg-linear-*` classes (Uniwind maps a CSS `background-image` onto this
 * very style, `uniwind/dist/module/bundler/css-processor/rn.js`). The object form needs no
 * parsing, is typed (`BackgroundImageValue` in `react-native`), and its stops can be computed
 * from the tokens: a gradient class would need the alphas written into the stylesheet. The
 * `experimental_` prefix is isolated here: when React Native drops it, this is the one edit.
 * `expo-linear-gradient` is not installed (a Batch 2 decision, research D5-19) and nothing
 * needs it. Layers are listed top first, as in CSS.
 *
 * The theme comes from `useAppearance()` and is read live: `prefersMoreContrast` picks the
 * darker scrims (`scrimSpec`), the colour scheme picks the sky, and the palette name picks a
 * cover's two stops. The sky keeps its base look in the contrast themes (the text colours
 * carry the extra contrast).
 *
 * Behaviour: a scrim never takes a touch and is decoration, hidden from assistive
 * technology. The exception is `caption`, whose block holds the caller's text: the ramp is
 * hidden, the block is not, and the container passes touches to its children
 * (`box-none`). The caption's block has a minimum, never a height, so it grows with large
 * text and the alpha under any line of text is at least `caption.minUnderText` at every text
 * scale (C5-10). Boxes: `top` is the 120 dp band pinned to the top edge; `bottom`, `sky` and
 * `cover` fill their parent; a caller `style` is applied last and wins.
 */
import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type BackgroundImageValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import {
  Palettes,
  Passport,
  Sky,
  scrimSpec,
  withAlpha,
  type GradientStop,
  type Palette,
  type ScrimSpec,
} from '@/theme';

export type ScrimKind = 'top' | 'bottom' | 'caption' | 'sky' | 'cover';

/** Which of the three generated-cover palettes (`cover1..3` in the palette). */
export type CoverPaletteIndex = 0 | 1 | 2;

export interface ScrimProps {
  kind: ScrimKind;
  /** `cover` only: the palette, 0 to 2. Default 0. */
  palette?: CoverPaletteIndex;
  /** `caption` only: the text the block wraps. */
  children?: ReactNode;
  /** The box: positions the scrim over the default one. For `caption`, the container. */
  style?: StyleProp<ViewStyle>;
  /** `caption` only: the block's own style, where its padding belongs. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Default `scrim-<kind>`; the caption's parts are `<testID>-ramp` and `<testID>-block`. */
  testID?: string;
}

type Layer = BackgroundImageValue;

/** A fraction (0 to 1) as the percentage a colour stop takes: `0.44` is `'44%'`. */
function percent(fraction: number): string {
  return `${Math.round(fraction * 10_000) / 100}%`;
}

function colourStop(color: string, at: number) {
  return { color, positions: [percent(at)] };
}

function linear(
  direction: string,
  stops: readonly { color: string; at: number }[],
): Layer {
  return {
    type: 'linear-gradient',
    direction,
    colorStops: stops.map(({ color, at }) => colourStop(color, at)),
  };
}

/** One of the opaque stops of the data (the sky, a cover) as a colour stop. */
function opaque(stops: readonly GradientStop[]) {
  return stops.map(({ colour, at }) => ({ color: colour, at }));
}

/**
 * A glow as `deepFreeze` types it: the data's tuples arrive as `readonly number[]`, so the
 * parameter says what is read (two numbers each) and not the tuple type of `Glow`.
 */
interface GlowData {
  colour: string;
  alpha: number;
  centre: readonly number[];
  radius: readonly number[];
  fadeAt: number;
}

/** A soft radial wash: the glow's colour at its alpha in the centre, nothing at `fadeAt`. */
function glowLayer(glow: GlowData): Layer {
  return {
    type: 'radial-gradient',
    shape: 'ellipse',
    size: { x: percent(glow.radius[0]), y: percent(glow.radius[1]) },
    position: { left: percent(glow.centre[0]), top: percent(glow.centre[1]) },
    colorStops: [
      colourStop(withAlpha(glow.colour, glow.alpha), 0),
      colourStop(withAlpha(glow.colour, 0), glow.fadeAt),
    ],
  };
}

/** The status-bar band: its alpha held to `holdTo` of the box, then to nothing. */
function topLayers({ rgb, top }: ScrimSpec): Layer[] {
  return [
    linear('to bottom', [
      { color: withAlpha(rgb, top.alpha), at: 0 },
      { color: withAlpha(rgb, top.alpha), at: top.holdTo },
      { color: withAlpha(rgb, 0), at: 1 },
    ]),
  ];
}

/** The darkening over a photograph: from nothing at the top to its darkest at the bottom. */
function bottomLayers({ rgb, bottom }: ScrimSpec): Layer[] {
  return [
    linear(
      'to bottom',
      bottom.map(({ at, alpha }) => ({ color: withAlpha(rgb, alpha), at })),
    ),
  ];
}

/** The caption scrim's two gradients: the ramp that fades in, the block that wraps text. */
function captionLayers({ rgb, caption }: ScrimSpec): { ramp: Layer[]; block: Layer[] } {
  return {
    ramp: [
      linear('to bottom', [
        { color: withAlpha(rgb, 0), at: 0 },
        { color: withAlpha(rgb, caption.rampTo), at: 1 },
      ]),
    ],
    block: [
      linear('to bottom', [
        { color: withAlpha(rgb, caption.rampTo), at: 0 },
        { color: withAlpha(rgb, caption.blockTo), at: 1 },
      ]),
    ],
  };
}

/** The sky: its glows over its 180 degree gradient. */
function skyLayers(scheme: 'light' | 'dark'): Layer[] {
  const { stops, glows } = Sky[scheme];
  return [...glows.map(glowLayer), linear('to bottom', opaque(stops))];
}

const COVER_STOPS = [
  ['cover1Start', 'cover1End'],
  ['cover2Start', 'cover2End'],
  ['cover3Start', 'cover3End'],
] as const satisfies readonly (readonly [keyof Palette, keyof Palette])[];

/** A cover: the passport's amber corner over a gradient between the palette's two stops. */
function coverLayers(palette: Palette, index: CoverPaletteIndex): Layer[] {
  const [start, end] = COVER_STOPS[index];
  return [
    glowLayer(Passport.glow),
    linear(`${Passport.angle}deg`, [
      { color: palette[start], at: 0 },
      { color: palette[end], at: 1 },
    ]),
  ];
}

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

const BANDS: Record<'top' | 'bottom' | 'sky' | 'cover', (spec: ScrimSpec) => ViewStyle> =
  {
    top: (spec) => ({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: spec.top.height,
    }),
    bottom: () => StyleSheet.absoluteFill,
    sky: () => StyleSheet.absoluteFill,
    cover: () => StyleSheet.absoluteFill,
  };

/** A childless, touch-less, hidden View painted with `layers`. */
function Band({
  layers,
  box,
  style,
  testID,
}: {
  layers: readonly Layer[];
  box: ViewStyle;
  style: StyleProp<ViewStyle>;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      pointerEvents="none"
      {...HIDDEN}
      style={[box, { experimental_backgroundImage: layers }, style]}
    />
  );
}

function Caption({
  spec,
  style,
  contentStyle,
  testID,
  children,
}: Pick<ScrimProps, 'style' | 'contentStyle' | 'children'> & {
  spec: ScrimSpec;
  testID: string;
}) {
  const { ramp, block } = captionLayers(spec);
  return (
    <View testID={testID} pointerEvents="box-none" style={style}>
      <Band
        testID={`${testID}-ramp`}
        layers={ramp}
        box={{ height: spec.caption.rampHeight }}
        style={undefined}
      />
      <View
        testID={`${testID}-block`}
        style={[{ experimental_backgroundImage: block }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

export function Scrim({
  kind,
  palette = 0,
  children,
  style,
  contentStyle,
  testID,
}: ScrimProps) {
  const { theme, themeName, prefersMoreContrast } = useAppearance();
  const spec = scrimSpec(prefersMoreContrast);
  const id = testID ?? `scrim-${kind}`;
  if (kind === 'caption') {
    return (
      <Caption spec={spec} style={style} contentStyle={contentStyle} testID={id}>
        {children}
      </Caption>
    );
  }
  const layers = {
    top: () => topLayers(spec),
    bottom: () => bottomLayers(spec),
    sky: () => skyLayers(theme),
    cover: () => coverLayers(Palettes[themeName], palette),
  }[kind]();
  return <Band testID={id} layers={layers} box={BANDS[kind](spec)} style={style} />;
}
