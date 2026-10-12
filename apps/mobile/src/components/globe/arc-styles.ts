/**
 * Per-status styling and the beacon's motion — T095, FR-046, research D-30.
 *
 * "Distinguishable at a glance" rests on more than hue (feature 002 FR-010):
 * past trips are the thinnest line, planned trips are dashed, active trips are
 * the thickest, and the trip that animates carries a beacon. Every connection
 * sits on a casing line, which is what the globe contrast gate measures the
 * status colours against. Every layer sets emissive strength 1 so the Standard
 * basemap's night lighting cannot shade a colour away from its measured token.
 */
import type { CircleLayerStyle, LineLayerStyle } from '@rnmapbox/maps';

import { GlobeColors, GlobeGeometry } from '@/constants/theme';
import type { LngLat } from '@/features/globe/great-circle';
import type { TripStatus } from '@/features/trips/trip-status';

export type GlobePalette = (typeof GlobeColors)['light'] | (typeof GlobeColors)['dark'];

/** A Mapbox expression, as the installed typings define it. */
export type Expression = Extract<
  NonNullable<LineLayerStyle['lineColor']>,
  readonly unknown[]
>;

/** One leg of the beacon's trip every this many milliseconds (D-30). */
export const LEG_DURATION_MS = 2400;

/** ~30 frames a second: smooth for a small moving dot, gentle on the JS thread. */
export const BEACON_FRAME_MS = 33;

/** Pick a value by the feature's `status` property. */
export function byStatus(values: Record<TripStatus, string | number>): Expression {
  return [
    'match',
    ['get', 'status'],
    'active',
    values.active,
    'planning',
    values.planning,
    values.past,
  ];
}

export function statusFilter(status: TripStatus): Expression {
  return ['==', ['get', 'status'], status];
}

const LINE_BASE = {
  lineCap: 'round',
  lineJoin: 'round',
  lineEmissiveStrength: 1,
} as const;

export function arcStyle(status: TripStatus, palette: GlobePalette): LineLayerStyle {
  return {
    ...LINE_BASE,
    lineColor: palette[status],
    lineWidth: GlobeGeometry.arcWidth[status],
    ...(status === 'planning' ? { lineDasharray: [...GlobeGeometry.planningDash] } : {}),
  };
}

/** Under every connection, wide enough to show on both sides of each status's line. */
export function casingStyle(palette: GlobePalette): LineLayerStyle {
  const { arcWidth, casingWidth } = GlobeGeometry;
  return {
    ...LINE_BASE,
    lineColor: palette.casing,
    lineWidth: byStatus({
      active: arcWidth.active + 2 * casingWidth,
      planning: arcWidth.planning + 2 * casingWidth,
      past: arcWidth.past + 2 * casingWidth,
    }),
  };
}

/**
 * Under the legs between trips (feature 003). Those features carry no status,
 * so the casing cannot read one: it takes the past line's width, the line the
 * journey is drawn in (`arcStyle('past')`), so both read as the same line.
 */
export function journeyCasingStyle(palette: GlobePalette): LineLayerStyle {
  const { arcWidth, casingWidth } = GlobeGeometry;
  return {
    ...LINE_BASE,
    lineColor: palette.casing,
    lineWidth: arcWidth.past + 2 * casingWidth,
  };
}

export function markerStyle(palette: GlobePalette): CircleLayerStyle {
  return {
    circleColor: byStatus(palette),
    circleRadius: GlobeGeometry.markerRadius,
    circleStrokeColor: palette.casing,
    circleStrokeWidth: GlobeGeometry.markerRing,
    circleEmissiveStrength: 1,
  };
}

export function beaconStyle(palette: GlobePalette): CircleLayerStyle {
  return {
    circleColor: byStatus(palette),
    circleRadius: GlobeGeometry.beaconRadius,
    circleStrokeColor: palette.casing,
    circleStrokeWidth: GlobeGeometry.beaconRing,
    circleEmissiveStrength: 1,
  };
}

/** Slow out of one stop and into the next: the hop reads as a journey. */
function easeInOut(f: number): number {
  return f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
}

/**
 * A fraction of the way along a leg, by segment. Parts are never bridged: the
 * last point of one part (on 180°) and the first of the next (on −180°) are
 * the same meridian, so the beacon steps between them rather than sweeping
 * across the globe.
 *
 * Between two vertices the step is a straight lerp in degrees, not a slerp:
 * the vertices are on the great circle and at most `MAX_SEGMENT_KM` (or a
 * 64th of a very long leg) apart, so the dot strays from the arc by far less
 * than its own radius at globe zoom. If the segment bounds in great-circle.ts
 * ever grow, revisit this.
 */
function along(parts: readonly LngLat[][], fraction: number): LngLat {
  const segments = parts.flatMap((part) =>
    part.slice(1).map((end, i) => [part[i]!, end] as const),
  );
  if (segments.length === 0) return parts[0]![0]!;
  const position = fraction * segments.length;
  const index = Math.min(Math.floor(position), segments.length - 1);
  const [start, end] = segments[index]!;
  const t = position - index;
  return [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])];
}

/** Where the beacon is `elapsedMs` into its loop over the trip's legs. */
export function beaconPosition(
  route: readonly LngLat[][][],
  elapsedMs: number,
): LngLat | null {
  if (route.length === 0) return null;
  const leg = route[Math.floor(elapsedMs / LEG_DURATION_MS) % route.length]!;
  return along(leg, easeInOut((elapsedMs % LEG_DURATION_MS) / LEG_DURATION_MS));
}
