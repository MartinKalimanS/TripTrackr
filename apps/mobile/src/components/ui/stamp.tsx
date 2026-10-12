/**
 * `Stamp` and `GhostStamp` - the passport's art (feature 005; FR-059, FR-076; contract C5-25;
 * research D5-08).
 *
 *   <Stamp spec={stampSpec('PT', '2026-10-12', 'Lisboa')} size={124} />
 *   <GhostStamp size={96} />                      an unvisited slot, or a trip with no stop
 *
 * A stamp is a `react-native-svg` drawing in a 120 by 120 box: an outer ring (heavy, dashed when
 * the spec is perforated) and fine inner rings in one of six shapes, the country code big in
 * the middle, a line of text round the top and the date. The circle writes its top and its date
 * on arcs (`TextPath`, `startOffset` 50 percent, centred), the scallop its top; the others write
 * on lines. The text is the embedded Bricolage Bold, whose family name is the stylesheet variable
 * `--font-display-bold` (the name differs by platform: `global.css` spells both, and
 * `useCSSVariable` answers the one this platform loads), never a name written here. SVG text
 * ignores Dynamic Type, so each line is fitted to its room by arithmetic (`stamp-layout.ts`).
 *
 * The distressed edge is the baked wear of `stamp-wear.ts`, the shape of an SVG `<Mask>`: the
 * ink is seen through a plate full of small holes. There is no filter anywhere in this file:
 * `react-native-svg` 15.15.4 draws nothing for `feTurbulence`, `feDisplacementMap` or
 * `feMorphology`. The ink is one of four tokens (`stampCoral`, `stampNavy`, `stampTeal`,
 * `stampGreen`, each measured against cream and with a dark twin), the box is tilted by the
 * spec's own degrees, and a stamp multiplies into the page in the light themes and lies normally
 * in the dark ones (`mixBlendMode`).
 *
 * Accessibility (FR-076): a stamp is decoration. It is hidden from assistive technology with its
 * text, takes no touch, and the PARENT carries the meaning ("Stamp: Portugal, 12 October 2026",
 * `stampLabel`). It does not move: the landing is `StampIn`, a wrapper that honours reduced
 * motion. Whether a device draws the face on a `TextPath` and applies the mask is device check
 * V5 (T511).
 */
import { useId, type ReactElement } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  Mask,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
  TextPath,
} from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { useAppearance } from '@/hooks/use-appearance';
import { Palettes, type Palette } from '@/theme';

import {
  ARCS,
  SHAPE_LAYOUT,
  fitLabel,
  octagonPoints,
  type TextSlot,
} from './stamp-layout';
import {
  stampDateText,
  type StampInk,
  type StampShape,
  type StampSpec,
} from './stamp-spec';
import { STAMP_BOX, wearPath } from './stamp-wear';
import { fontFamilyOf } from './stack-header';

export interface StampProps {
  spec: StampSpec;
  /** The side of the square, in dp. Default 124. */
  size?: number;
  /** Default `stamp`. */
  testID?: string;
}

export interface GhostStampProps {
  /** The side of the square, in dp. Default 96. */
  size?: number;
  /** A tilt in degrees. Default 0. */
  rotationDeg?: number;
  /** Default `ghost-stamp`. */
  testID?: string;
}

const INK_KEYS = {
  coral: 'stampCoral',
  navy: 'stampNavy',
  teal: 'stampTeal',
  green: 'stampGreen',
} as const satisfies Record<StampInk, keyof Palette>;

/** The heavy outer ring and the fine inner ones, in the prototype's units. */
const HEAVY = 4.2;
const FINE = 1.8;
const PERFORATION = '7 5';
const CENTRE = 60;

/** What a stamp and its ghost share: decoration, hidden, never a touch (FR-076). */
const DECORATIVE = {
  pointerEvents: 'none',
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

const VIEW_BOX = `0 0 ${STAMP_BOX} ${STAMP_BOX}`;

interface Paint {
  ink: string;
  face: string | undefined;
  perforated: boolean;
}

const heavy = ({ ink, perforated }: Paint) => ({
  fill: 'none',
  stroke: ink,
  strokeWidth: HEAVY,
  ...(perforated ? { strokeDasharray: PERFORATION } : {}),
});

const fine = ({ ink }: Paint) => ({ fill: 'none', stroke: ink, strokeWidth: FINE });

/** The rings of each shape, outer first. Hex and octagon corners are the prototype's. */
const OUTLINES: Record<StampShape, (paint: Paint) => ReactElement> = {
  circle: (paint) => (
    <>
      <Circle cx={CENTRE} cy={CENTRE} r={55} {...heavy(paint)} />
      <Circle cx={CENTRE} cy={CENTRE} r={48} {...fine(paint)} />
      <Circle cx={CENTRE} cy={CENTRE} r={29} {...fine(paint)} />
    </>
  ),
  rect: (paint) => (
    <>
      <Rect x={6} y={20} width={108} height={80} rx={12} {...heavy(paint)} />
      <Rect x={13} y={27} width={94} height={66} rx={7} {...fine(paint)} />
      <Line x1={24} x2={96} y1={78} y2={78} stroke={paint.ink} strokeWidth={FINE} />
    </>
  ),
  hex: (paint) => (
    <>
      <Polygon
        points="115,60 87.5,107.6 32.5,107.6 5,60 32.5,12.4 87.5,12.4"
        strokeLinejoin="round"
        {...heavy(paint)}
      />
      <Polygon
        points="107,60 83.5,100.7 36.5,100.7 13,60 36.5,19.3 83.5,19.3"
        strokeLinejoin="round"
        {...fine(paint)}
      />
    </>
  ),
  oct: (paint) => (
    <>
      <Polygon points={octagonPoints(58)} strokeLinejoin="round" {...heavy(paint)} />
      <Polygon points={octagonPoints(50)} strokeLinejoin="round" {...fine(paint)} />
    </>
  ),
  // The outer ring of a scallop is already a ring of dots, so perforation changes nothing.
  scallop: (paint) => (
    <>
      <Circle
        cx={CENTRE}
        cy={CENTRE}
        r={55}
        fill="none"
        stroke={paint.ink}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="0.1 9.6"
      />
      <Circle cx={CENTRE} cy={CENTRE} r={47} {...fine(paint)} />
    </>
  ),
  oval: (paint) => (
    <>
      <Ellipse cx={CENTRE} cy={CENTRE} rx={57} ry={42} {...heavy(paint)} />
      <Ellipse cx={CENTRE} cy={CENTRE} rx={50} ry={35} {...fine(paint)} />
    </>
  ),
};

/** The text props every line shares: the embedded face (no synthetic bold), the ink. */
const lettering = ({ ink, face }: Paint, size: number, tracking: number) => ({
  fontFamily: face,
  fontWeight: 'normal' as const,
  fontSize: size,
  letterSpacing: tracking,
  fill: ink,
});

/** One line of text, fitted to its room: on a line, or along the arc named by `arcId`. */
function Label({
  slot,
  text,
  paint,
  arcId,
}: {
  slot: TextSlot;
  text: string;
  paint: Paint;
  arcId: string;
}) {
  const { size, tracking } = fitLabel(text, slot.room, slot.size, slot.tracking);
  const font = lettering(paint, size, tracking);
  if (slot.kind === 'line') {
    return (
      <SvgText x={CENTRE} y={slot.y} textAnchor="middle" {...font}>
        {text}
      </SvgText>
    );
  }
  return (
    <SvgText textAnchor="middle" {...font}>
      <TextPath href={`#${arcId}`} startOffset="50%">
        {text}
      </TextPath>
    </SvgText>
  );
}

/** The arcs the circle and the scallop write on, defined once for the text to follow. */
function ArcPaths({ spec, uid }: { spec: StampSpec; uid: string }) {
  const { top, date } = SHAPE_LAYOUT[spec.shape];
  return (
    <>
      {top.kind === 'arc' ? (
        <Path id={`${uid}-top`} d={ARCS[top.arc].d} fill="none" />
      ) : null}
      {date.kind === 'arc' ? (
        <Path id={`${uid}-bottom`} d={ARCS[date.arc].d} fill="none" />
      ) : null}
    </>
  );
}

/** The drawing: rings, then the three lines of text. All of it is seen through the wear. */
function Art({ spec, paint, uid }: { spec: StampSpec; paint: Paint; uid: string }) {
  const layout = SHAPE_LAYOUT[spec.shape];
  const code = lettering(paint, layout.code.size, 0);
  return (
    <>
      {OUTLINES[spec.shape](paint)}
      <Label slot={layout.top} text={spec.top} paint={paint} arcId={`${uid}-top`} />
      <SvgText x={CENTRE} y={layout.code.y} textAnchor="middle" {...code}>
        {spec.iso2}
      </SvgText>
      <Label
        slot={layout.date}
        text={stampDateText(spec.date)}
        paint={paint}
        arcId={`${uid}-bottom`}
      />
    </>
  );
}

export function Stamp({ spec, size = 124, testID = 'stamp' }: StampProps) {
  const { theme, themeName } = useAppearance();
  const palette = Palettes[themeName];
  const face = fontFamilyOf(useCSSVariable('--font-display-bold'));
  const uid = useId().replace(/[^A-Za-z0-9]/g, '');
  const paint: Paint = {
    ink: palette[INK_KEYS[spec.ink]],
    face,
    perforated: spec.perforated,
  };
  const box: ViewStyle = {
    width: size,
    height: size,
    transform: [{ rotate: `${spec.rotationDeg}deg` }],
    mixBlendMode: theme === 'light' ? 'multiply' : 'normal',
  };
  return (
    <View testID={testID} {...DECORATIVE} style={box}>
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
        <Defs>
          <Mask
            id={`${uid}-mask`}
            x={0}
            y={0}
            width={STAMP_BOX}
            height={STAMP_BOX}
            maskUnits="userSpaceOnUse">
            <Path d={wearPath(spec.wear)} fill={palette.onPhoto} fillRule="evenodd" />
          </Mask>
          <ArcPaths spec={spec} uid={uid} />
        </Defs>
        <G mask={`url(#${uid}-mask)`}>
          <Art spec={spec} paint={paint} uid={uid} />
        </G>
      </Svg>
    </View>
  );
}

/** An unvisited slot: a dashed outline in the field-border colour, no text, no wear. */
export function GhostStamp({
  size = 96,
  rotationDeg = 0,
  testID = 'ghost-stamp',
}: GhostStampProps) {
  const { themeName } = useAppearance();
  const stroke = Palettes[themeName].border;
  return (
    <View
      testID={testID}
      {...DECORATIVE}
      style={{ width: size, height: size, transform: [{ rotate: `${rotationDeg}deg` }] }}>
      <Svg width={size} height={size} viewBox={VIEW_BOX}>
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={54}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={42}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray="3 5"
        />
      </Svg>
    </View>
  );
}
