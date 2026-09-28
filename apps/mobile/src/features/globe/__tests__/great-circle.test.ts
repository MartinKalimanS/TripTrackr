/**
 * Great-circle geometry for the globe — research D-30.
 *
 * The connections are drawn from these points, so what is pinned here is what
 * a traveller would see go wrong: a leg drawn the long way round the map, a
 * gap where it crosses the date line, a line through the Earth's interior, or
 * a NaN that makes Mapbox drop the whole source. Each case below is one the
 * `@turf/great-circle` 7.4.0 engine was observed to get wrong (D-30).
 */
import {
  EARTH_RADIUS_KM,
  MAX_SEGMENTS,
  greatCircle,
  haversineKm,
  type LngLat,
} from '../great-circle';

const LONDON: LngLat = [-0.1276, 51.5072];
const PARIS: LngLat = [2.3522, 48.8566];
const ROME: LngLat = [12.4964, 41.9028];
const FLORENCE: LngLat = [11.2558, 43.7696];
const TOKYO: LngLat = [139.6917, 35.6895];
const SAN_FRANCISCO: LngLat = [-122.4194, 37.7749];
const NEW_YORK: LngLat = [-74.006, 40.7128];
const HONG_KONG: LngLat = [114.1694, 22.3193];
const SUVA: LngLat = [178.4419, -18.1416];
const APIA: LngLat = [-171.7514, -13.8333];

/** Every point of every part, in order. */
const flat = (parts: LngLat[][]) => parts.flat();

/** The largest longitude step between neighbours inside any one part. */
function largestStep(parts: LngLat[][]): number {
  let largest = 0;
  for (const part of parts) {
    for (let i = 1; i < part.length; i += 1) {
      largest = Math.max(largest, Math.abs(part[i]![0] - part[i - 1]![0]));
    }
  }
  return largest;
}

/** A point on the arc splits the leg exactly: d(A,P) + d(P,B) = d(A,B). */
function expectOnArc(parts: LngLat[][], from: LngLat, to: LngLat) {
  const total = haversineKm(from, to);
  for (const point of flat(parts)) {
    expect(haversineKm(from, point) + haversineKm(point, to)).toBeCloseTo(total, 0);
  }
}

describe('haversineKm', () => {
  test('uses the IUGG mean Earth radius', () => {
    expect(EARTH_RADIUS_KM).toBe(6371.0088);
  });

  test('matches the known great-circle distances on that sphere', () => {
    expect(haversineKm(LONDON, PARIS)).toBeCloseTo(343.53, 1);
    expect(haversineKm(ROME, FLORENCE)).toBeCloseTo(230.91, 1);
    expect(haversineKm(TOKYO, SAN_FRANCISCO)).toBeCloseTo(8270.73, 0);
  });

  test('is symmetric, zero for one place, and half the circumference for antipodes', () => {
    expect(haversineKm(PARIS, LONDON)).toBeCloseTo(haversineKm(LONDON, PARIS), 9);
    expect(haversineKm(ROME, ROME)).toBe(0);
    expect(haversineKm([0, 0], [180, 0])).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 6);
  });
});

describe('greatCircle', () => {
  test('a short leg is one part from exact start to exact end, every point on the arc', () => {
    const parts = greatCircle(LONDON, PARIS);

    expect(parts).toHaveLength(1);
    const points = parts[0]!;
    expect(points[0]![0]).toBeCloseTo(LONDON[0], 5);
    expect(points[0]![1]).toBeCloseTo(LONDON[1], 5);
    expect(points.at(-1)![0]).toBeCloseTo(PARIS[0], 5);
    expect(points.at(-1)![1]).toBeCloseTo(PARIS[1], 5);
    expectOnArc(parts, LONDON, PARIS);
  });

  test('segments are at most 100 km — the server’s segment length — on a short leg', () => {
    // 343.5 km → 4 segments → 5 points, like ST_Segmentize at 100 km.
    const [points] = greatCircle(LONDON, PARIS);
    expect(points).toHaveLength(5);
    for (let i = 1; i < points!.length; i += 1) {
      expect(haversineKm(points![i - 1]!, points![i]!)).toBeLessThanOrEqual(100);
    }
  });

  test('the middle point of an even split is the geographic midpoint', () => {
    const [points] = greatCircle(LONDON, PARIS);
    const middle = points![2]!;
    expect(haversineKm(LONDON, middle)).toBeCloseTo(haversineKm(middle, PARIS), 1);
  });

  test('a long leg is capped at MAX_SEGMENTS segments and still follows the arc', () => {
    // London → Tokyo is ~9,560 km: 96 segments at 100 km, capped to 64.
    const parts = greatCircle(LONDON, TOKYO);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(MAX_SEGMENTS + 1);
    expectOnArc(parts, LONDON, TOKYO);
  });

  test('crossing the date line eastward splits into two parts that meet exactly on ±180°', () => {
    const parts = greatCircle(TOKYO, SAN_FRANCISCO);

    expect(parts).toHaveLength(2);
    const [west, east] = parts as [LngLat[], LngLat[]];
    expect(west.at(-1)![0]).toBe(180);
    expect(east[0]![0]).toBe(-180);
    expect(east[0]![1]).toBe(west.at(-1)![1]);
    // No part sweeps across the map, and every longitude stays in range.
    expect(largestStep(parts)).toBeLessThan(10);
    for (const [lng] of flat(parts)) {
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
    expectOnArc(parts, TOKYO, SAN_FRANCISCO);
  });

  test('crossing westward mirrors it: the first part ends on −180°, the second starts on 180°', () => {
    const parts = greatCircle(SAN_FRANCISCO, TOKYO);

    expect(parts).toHaveLength(2);
    expect(parts[0]!.at(-1)![0]).toBe(-180);
    expect(parts[1]![0]![0]).toBe(180);
    expect(parts[1]![0]![1]).toBe(parts[0]!.at(-1)![1]);
  });

  test('a short hop over the date line (Suva → Apia) is split, not drawn round the world', () => {
    const parts = greatCircle(SUVA, APIA);
    expect(parts).toHaveLength(2);
    expect(largestStep(parts)).toBeLessThan(10);
    expectOnArc(parts, SUVA, APIA);
  });

  test('a polar route (New York → Hong Kong) never jumps across the map inside a part', () => {
    const parts = greatCircle(NEW_YORK, HONG_KONG);
    expect(largestStep(parts)).toBeLessThan(180);
    expectOnArc(parts, NEW_YORK, HONG_KONG);
  });

  test('two stops in the same city draw nothing', () => {
    expect(greatCircle(ROME, ROME)).toEqual([]);
  });

  test('two places metres apart give a valid two-point line, not NaN', () => {
    const parts = greatCircle([12.4964, 41.9028], [12.4965, 41.9029]);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(2);
    for (const [lng, lat] of flat(parts)) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
    }
  });

  test('exact antipodes take a deterministic route through a pole, with no NaN', () => {
    const parts = greatCircle([0, 0], [180, 0]);

    const points = flat(parts);
    expect(points.length).toBeGreaterThan(2);
    for (const [lng, lat] of points) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
    }
    const length = parts.reduce(
      (sum, part) =>
        sum + part.slice(1).reduce((s, p, i) => s + haversineKm(part[i]!, p), 0),
      0,
    );
    expect(length).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, -1);
  });

  test('pole to pole — where every meridian starts — goes down the prime meridian', () => {
    const parts = greatCircle([0, 90], [0, -90]);

    const points = flat(parts);
    expect(points).toContainEqual([0, 0]);
    for (const [lng, lat] of points) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
    }
    expect(points[0]).toEqual([0, 90]);
    expect(points.at(-1)).toEqual([0, -90]);
  });

  test('over a sweep of pairs, every point is finite and every part is a real line', () => {
    // A deterministic generator, so a failure is reproducible.
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 300; i += 1) {
      const from: LngLat = [next() * 360 - 180, next() * 170 - 85];
      const to: LngLat = [next() * 360 - 180, next() * 170 - 85];
      const parts = greatCircle(from, to);
      for (const part of parts) {
        expect(part.length).toBeGreaterThanOrEqual(2);
        for (const [lng, lat] of part) {
          expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true);
          expect(Math.abs(lng)).toBeLessThanOrEqual(180);
        }
      }
      expect(largestStep(parts)).toBeLessThan(180);
    }
  });
});
