/**
 * The graticule — feature 005, T532 (research D5-04, contract C5-24).
 *
 * Meridians and parallels as GeoJSON, drawn by one faint `LineLayer` over the planet. It is
 * static, so `GraticuleLayer` computes it once. A line is a LineString with a vertex at
 * least every 10 degrees: the globe projection bends a segment round the sphere, and a
 * very long straight one is clipped by the tiles it crosses. The date line is drawn once
 * (as -180), and nothing is drawn at the poles or above 85 degrees, where Web Mercator
 * ends.
 *
 * Pure: no Mapbox, no React.
 */
import type { LngLat } from './great-circle';

export type GraticuleProperties = { kind: 'meridian' | 'parallel'; degrees: number };

/** Plain RFC 7946 objects, typed here so this file needs nothing from Mapbox or the layers. */
export type GraticuleFeature = {
  type: 'Feature';
  id: string;
  geometry: { type: 'LineString'; coordinates: LngLat[] };
  properties: GraticuleProperties;
};
export type GraticuleCollection = {
  type: 'FeatureCollection';
  features: GraticuleFeature[];
};

/** Where Web Mercator ends: a line above it would be clamped by the engine. */
const MAX_LATITUDE = 85;

/** The most a vertex may be from the last, in degrees. */
const VERTEX_SPACING = 10;

/** `from` to `to` inclusive in steps of at most `VERTEX_SPACING`. */
function ramp(from: number, to: number): number[] {
  const count = Math.ceil((to - from) / VERTEX_SPACING);
  return Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);
}

function feature(
  kind: GraticuleProperties['kind'],
  degrees: number,
  coordinates: LngLat[],
): GraticuleFeature {
  return {
    type: 'Feature',
    id: `${kind}:${degrees}`,
    geometry: { type: 'LineString', coordinates },
    properties: { kind, degrees },
  };
}

function checkStep(step: number): void {
  const valid = Number.isFinite(step) && step > 0 && step <= 90 && 90 % step === 0;
  if (!valid) {
    throw new RangeError(
      `A graticule step must divide 90 degrees (5, 10, 15, 30, 45 or 90), received ${step}.`,
    );
  }
}

/** A multiple of `step` from `start` up to and including `end`. */
function multiples(start: number, end: number, step: number): number[] {
  const count = Math.round((end - start) / step);
  return Array.from({ length: count + 1 }, (_, i) => start + i * step);
}

/**
 * The lines every `step` degrees (a divisor of 90): meridians from -180 round to the last
 * one before 180, parallels from the far south to the far north without the poles.
 */
export function graticule(step: number): GraticuleCollection {
  checkStep(step);
  const meridians = multiples(-180, 180 - step, step).map((lng) =>
    feature(
      'meridian',
      lng,
      ramp(-MAX_LATITUDE, MAX_LATITUDE).map((lat): LngLat => [lng, lat]),
    ),
  );
  const parallels = multiples(-90 + step, 90 - step, step).map((lat) =>
    feature(
      'parallel',
      lat,
      ramp(-180, 180).map((lng): LngLat => [lng, lat]),
    ),
  );
  return { type: 'FeatureCollection', features: [...meridians, ...parallels] };
}
