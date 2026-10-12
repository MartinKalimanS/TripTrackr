/**
 * Gradient arcs — feature 005, T532 (FR-010; research D5-04, contract C5-24).
 *
 * `lineGradient` over `line-progress` needs `lineMetrics: true` on its own source and
 * cannot be combined with `lineDasharray`. So past and active connections, and the legs
 * between trips (which draw as past), are gradient layers over a SECOND source with one
 * feature per leg, so every leg gets the whole ramp; planned connections keep the dashed
 * line of the shared hit source, which this does not touch. The solid layers of that
 * source stay under the gradient as its fallback, and each gradient layer is placed
 * directly above the solid layer it covers (`GRADIENT_ABOVE`) so the stack keeps its
 * meaning: casing, past, planned, active, with the active trip never under another.
 *
 * A leg that crosses the date line is a MultiLineString whose parts each run the whole
 * ramp: the ramp is per line part in the renderer, and a rare leg is not worth a second
 * geometry.
 *
 * Pure, and free of runtime imports from Mapbox, so the contrast gate can measure the very
 * stops the layers use.
 */
import type { LineLayerStyle } from '@rnmapbox/maps';

import type {
  ArcCollection,
  Feature,
  FeatureCollection,
  JourneyCollection,
  LineGeometry,
} from './arc-features';
import { arcStyle, type Expression, type GlobePalette } from './arc-styles';

/** The legs between trips are `journey`; they draw in the past style. */
export type GradientStatus = 'journey' | 'past' | 'active';

export type GradientProperties = { status: GradientStatus };
export type GradientCollection = FeatureCollection<LineGeometry, GradientProperties>;

/** Directly above which solid layer of the hit source (or the journey) each one is drawn. */
export const GRADIENT_ABOVE: Readonly<Record<GradientStatus, string>> = {
  journey: 'globe-journey-line',
  past: 'globe-arc-past',
  active: 'globe-arc-active',
};

function gradientFeature(
  source: Feature<LineGeometry, object>,
  status: GradientStatus,
): Feature<LineGeometry, GradientProperties> {
  return {
    type: 'Feature',
    id: source.id,
    geometry: source.geometry,
    properties: { status },
  };
}

/**
 * The features the gradient layers draw: the journey, then every past and active leg. A
 * planned leg is not here (its dashed line is in the hit source). The geometry is shared,
 * not copied, and the inputs are not changed.
 */
export function gradientCollection(
  arcs: ArcCollection,
  journey: JourneyCollection,
): GradientCollection {
  const legs = journey.features.map((leg) => gradientFeature(leg, 'journey'));
  const connections = arcs.features.flatMap((arc) =>
    arc.properties.status === 'planning'
      ? []
      : [gradientFeature(arc, arc.properties.status)],
  );
  return { type: 'FeatureCollection', features: [...legs, ...connections] };
}

export function gradientFilter(status: GradientStatus): Expression {
  return ['==', ['get', 'status'], status];
}

/** The two stops of a status: its start and end tokens (the journey takes the past ones). */
export function gradientStops(
  status: GradientStatus,
  palette: GlobePalette,
): readonly [readonly [0, string], readonly [1, string]] {
  return status === 'active'
    ? [
        [0, palette.active],
        [1, palette.activeEnd],
      ]
    : [
        [0, palette.past],
        [1, palette.pastEnd],
      ];
}

/**
 * The style of a gradient layer: the line of its status (width, caps, emissive strength,
 * the start colour as the fallback) with `lineGradient` over `line-progress`.
 */
export function arcGradientStyle(
  status: GradientStatus,
  palette: GlobePalette,
): LineLayerStyle {
  const [[, start], [, end]] = gradientStops(status, palette);
  return {
    ...arcStyle(status === 'active' ? 'active' : 'past', palette),
    lineGradient: ['interpolate', ['linear'], ['line-progress'], 0, start, 1, end],
  };
}
