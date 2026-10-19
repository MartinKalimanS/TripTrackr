/**
 * The pins — feature 005, T533 (FR-011; research D5-04, contract C5-24).
 *
 * The DEFAULT is plain dots: one `CircleLayer` over a source of pins, in the status colour on
 * a casing ring, the live trip largest and drawn last. Where a photo roundel has been baked
 * for a pin (`use-roundels.tsx`, behind `GlobeLayers.pins.roundelsEnabled`) a `SymbolLayer`
 * draws that bitmap instead: `Images` registers the bitmaps, `iconImage` reads the name from
 * each feature, `symbolSortKey` is the rank with `iconAllowOverlap`, so the live trip is last
 * and on top, and `iconSize` is a little smaller while the whole planet is in view.
 *
 * Both sources answer a tap across a full touch target with the SHARED handler: a pin carries
 * the `trip_id` and `status` that `tripIdFromPress` reads, and the shared hit source, its
 * layers and that function are as they were. Every custom layer sets full emissive strength,
 * or the night lighting shades a colour away from its token.
 */
import {
  CircleLayer,
  Images,
  ShapeSource,
  SymbolLayer,
  type CircleLayerStyle,
  type SymbolLayerStyle,
} from '@rnmapbox/maps';
import { PixelRatio } from 'react-native';

import { GlobeLayers, MinTouchTarget } from '@/constants/theme';

import { byStatus, type GlobePalette } from './arc-styles';
import type { PinSplit } from './pin-features';
import type { GlobePressEvent } from './use-arc-press';

const HITBOX = { width: MinTouchTarget, height: MinTouchTarget };

export function pinDotStyle(palette: GlobePalette): CircleLayerStyle {
  const { dotRadius, dotRing } = GlobeLayers.pins;
  return {
    circleColor: byStatus(palette),
    circleRadius: byStatus(dotRadius),
    circleStrokeColor: palette.casing,
    circleStrokeWidth: dotRing,
    circleSortKey: ['get', 'rank'],
    circleEmissiveStrength: 1,
  };
}

export function roundelStyle(): SymbolLayerStyle {
  const { farZoom, farScale, nearZoom, nearScale } = GlobeLayers.pins.iconSize;
  return {
    iconImage: ['get', 'roundel'],
    iconAllowOverlap: true,
    iconIgnorePlacement: true,
    symbolSortKey: ['get', 'rank'],
    iconSize: [
      'interpolate',
      ['linear'],
      ['zoom'],
      farZoom,
      farScale,
      nearZoom,
      nearScale,
    ],
    iconEmissiveStrength: 1,
  };
}

/**
 * The bitmaps in use, as `Images` takes them: a file URI drawn at the device's scale, so the
 * capture (at the device's pixel density) is the size of the view it was taken from.
 */
export function roundelImages(
  roundels: PinSplit['roundels'],
  bitmaps: Readonly<Record<string, string>>,
): Record<string, { url: string; scale: number }> {
  const scale = PixelRatio.get();
  const used = roundels.features.map((f) => f.properties.roundel);
  return Object.fromEntries(
    used.flatMap((key) => (bitmaps[key] ? [[key, { url: bitmaps[key], scale }]] : [])),
  );
}

export type PinLayerProps = {
  split: PinSplit;
  bitmaps: Readonly<Record<string, string>>;
  palette: GlobePalette;
  onPress: (event: GlobePressEvent) => void;
};

/** The dots: the default pin, and the fallback for any pin without a bitmap. */
export function PinDotLayer({
  dots,
  palette,
  onPress,
}: {
  dots: PinSplit['dots'];
  palette: GlobePalette;
  onPress: PinLayerProps['onPress'];
}) {
  return (
    <ShapeSource id="globe-pins" shape={dots} hitbox={HITBOX} onPress={onPress}>
      <CircleLayer id="globe-pin-dot" style={pinDotStyle(palette)} />
    </ShapeSource>
  );
}

/**
 * The photo roundels: the bitmaps registered with `Images`, and one `SymbolLayer` that draws
 * the bitmap each feature names. Nothing is drawn for no roundel.
 */
export function RoundelLayer({
  roundels,
  bitmaps,
  onPress,
}: {
  roundels: PinSplit['roundels'];
  bitmaps: Readonly<Record<string, string>>;
  onPress: PinLayerProps['onPress'];
}) {
  if (roundels.features.length === 0) return null;
  return (
    <>
      <Images images={roundelImages(roundels, bitmaps)} />
      <ShapeSource id="globe-roundels" shape={roundels} hitbox={HITBOX} onPress={onPress}>
        <SymbolLayer id="globe-roundel" style={roundelStyle()} />
      </ShapeSource>
    </>
  );
}

/** Dots under roundels: a pin is drawn by exactly one of them. */
export function PinLayer({ split, bitmaps, palette, onPress }: PinLayerProps) {
  return (
    <>
      <PinDotLayer dots={split.dots} palette={palette} onPress={onPress} />
      <RoundelLayer roundels={split.roundels} bitmaps={bitmaps} onPress={onPress} />
    </>
  );
}
