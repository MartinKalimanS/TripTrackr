/**
 * Gradient arcs — feature 005, T532 (FR-010; research D5-04, contract C5-24).
 *
 * `lineGradient` over `line-progress` needs `lineMetrics: true` on its own source and cannot
 * be combined with `lineDasharray`, so past and active connections (and the legs between
 * trips, which draw as past) are gradient layers over a second source, and planned
 * connections keep their dashed line in the shared hit source. These are the pure parts:
 * which features the gradient source holds, and the style of each layer.
 */
import { GlobeColors, GlobeGeometry } from '@/constants/theme';

import {
  GRADIENT_ABOVE,
  arcGradientStyle,
  gradientCollection,
  gradientFilter,
  gradientStops,
} from '../gradient-arcs';
import type {
  ArcCollection,
  ArcProperties,
  Feature,
  JourneyCollection,
  LineGeometry,
} from '../arc-features';

const line = (): LineGeometry => ({
  type: 'LineString',
  coordinates: [
    [0, 0],
    [10, 10],
  ],
});

function arc(
  id: string,
  status: ArcProperties['status'],
): Feature<LineGeometry, ArcProperties> {
  return {
    type: 'Feature',
    id,
    geometry: line(),
    properties: { trip_id: `trip-${id}`, status, from_city_id: 1, to_city_id: 2 },
  };
}

const arcs: ArcCollection = {
  type: 'FeatureCollection',
  features: [
    arc('p1', 'past'),
    arc('l1', 'planning'),
    arc('a1', 'active'),
    arc('p2', 'past'),
  ],
};

const journey: JourneyCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'journey:x:y',
      geometry: line(),
      properties: { from_city_id: 3, to_city_id: 4 },
    },
  ],
};

describe('gradientCollection', () => {
  test('holds past and active connections and the journey, and never a planned one', () => {
    const { features } = gradientCollection(arcs, journey);
    expect(features.map((f) => [f.id, f.properties.status])).toEqual([
      ['journey:x:y', 'journey'],
      ['p1', 'past'],
      ['a1', 'active'],
      ['p2', 'past'],
    ]);
  });

  test('is one feature per leg: a leg keeps its own id and its own geometry, so each gets the whole ramp', () => {
    const { features } = gradientCollection(arcs, journey);
    const ids = features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(features.find((f) => f.id === 'p1')?.geometry).toBe(
      arcs.features[0]!.geometry,
    );
    expect(features[0]!.geometry).toBe(journey.features[0]!.geometry);
  });

  test('carries only what the layers read: the status', () => {
    for (const feature of gradientCollection(arcs, journey).features) {
      expect(Object.keys(feature.properties)).toEqual(['status']);
    }
  });

  test('is empty, not absent, when there is nothing to draw', () => {
    const empty = { type: 'FeatureCollection' as const, features: [] };
    expect(gradientCollection(empty, empty)).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  test('does not touch the shapes it is given', () => {
    const before = JSON.stringify([arcs, journey]);
    gradientCollection(arcs, journey);
    expect(JSON.stringify([arcs, journey])).toBe(before);
  });
});

describe('gradientFilter', () => {
  test.each(['past', 'active', 'journey'] as const)(
    '%s reads the feature’s status',
    (status) => {
      expect(gradientFilter(status)).toEqual(['==', ['get', 'status'], status]);
    },
  );
});

describe.each(['light', 'dark'] as const)('%s palette', (theme) => {
  const palette = GlobeColors[theme];

  test('the stops are the start and end tokens of the status', () => {
    expect(gradientStops('past', palette)).toEqual([
      [0, palette.past],
      [1, palette.pastEnd],
    ]);
    expect(gradientStops('active', palette)).toEqual([
      [0, palette.active],
      [1, palette.activeEnd],
    ]);
  });

  test.each(['past', 'active', 'journey'] as const)(
    '%s: a gradient over line-progress, with the start colour as the fallback',
    (status) => {
      const style = arcGradientStyle(status, palette);
      const [[, start], [, end]] = gradientStops(status, palette);
      expect(style.lineGradient).toEqual([
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        start,
        1,
        end,
      ]);
      expect(style.lineColor).toBe(start);
    },
  );

  test('draws at the width of its status, and the journey at the past width', () => {
    expect(arcGradientStyle('past', palette).lineWidth).toBe(GlobeGeometry.arcWidth.past);
    expect(arcGradientStyle('active', palette).lineWidth).toBe(
      GlobeGeometry.arcWidth.active,
    );
    expect(arcGradientStyle('journey', palette).lineWidth).toBe(
      GlobeGeometry.arcWidth.past,
    );
  });

  test('is solid: no dash (a gradient cannot have one) and full emissive strength', () => {
    for (const status of ['past', 'active', 'journey'] as const) {
      const style = arcGradientStyle(status, palette);
      expect(style).not.toHaveProperty('lineDasharray');
      expect(style.lineEmissiveStrength).toBe(1);
      expect(style.lineCap).toBe('round');
    }
  });
});

describe('GRADIENT_ABOVE', () => {
  test('puts each gradient directly above the solid layer it replaces, so the stack keeps its order', () => {
    expect(GRADIENT_ABOVE).toEqual({
      journey: 'globe-journey-line',
      past: 'globe-arc-past',
      active: 'globe-arc-active',
    });
  });
});
