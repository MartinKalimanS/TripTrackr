/**
 * Great-circle geometry for the globe — research D-30 (amends D-06).
 *
 * A connection between two stops is the shortest path over the sphere,
 * sampled densely enough to draw as a curve. Written here rather than taken
 * from `@turf/great-circle` because that package's engine was observed to get
 * exactly the journeys a travel journal records wrong (D-30): a gap where a leg
 * crosses the date line, a polar route returned as one line sweeping the width
 * of the map, and NaN or a throw on antipodal points.
 *
 * The rules this file keeps:
 *   - Interpolation is spherical (slerp between unit vectors), so every point
 *     lies on the great circle and the endpoints are the stops themselves.
 *   - Segments are at most `MAX_SEGMENT_KM`, the server's segment length
 *     (`SEGMENT_LENGTH_METRES` in arcs.service.ts), and at most
 *     `MAX_SEGMENTS` per leg.
 *   - Longitudes stay in [-180, 180]. A leg that crosses the antimeridian is
 *     split into parts that end and begin exactly on ±180° at the same
 *     latitude, so it draws unbroken as a GeoJSON MultiLineString
 *     (RFC 7946 §3.1.9) and never as a line across the whole map.
 *   - Two stops in one place draw nothing; an exactly antipodal pair — where
 *     every meridian is a shortest path — goes through a pole, deterministically.
 */

/** `[longitude, latitude]` in degrees — GeoJSON order (RFC 7946 §3.1.1). */
export type LngLat = [number, number];

/** IUGG mean Earth radius, the sphere turf and PostGIS's spherical mode use. */
export const EARTH_RADIUS_KM = 6371.0088;

/** The server's segment length (arcs.service.ts `SEGMENT_LENGTH_METRES`). */
export const MAX_SEGMENT_KM = 100;

/** Research D-06's "roughly 64 points" per leg. */
export const MAX_SEGMENTS = 64;

const RADIANS = Math.PI / 180;
/** A central angle below this (≈ 6 mm on the ground) is one place. */
const SAME_PLACE = 1e-9;
/** Closer than this to π (≈ 0.6 m from the antipode), the great circle is undefined. */
const ANTIPODAL = 1e-7;
/** Five decimals: about a metre, and a much smaller payload for the native side. */
const PRECISION = 1e5;

type Vector = [number, number, number];

/** `|| 0` folds −0 into 0, so a coordinate never reads as "-0". */
const round = (degrees: number) => Math.round(degrees * PRECISION) / PRECISION || 0;

function toVector([lng, lat]: LngLat): Vector {
  const phi = lat * RADIANS;
  const lambda = lng * RADIANS;
  return [
    Math.cos(phi) * Math.cos(lambda),
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
  ];
}

function toLngLat([x, y, z]: Vector): LngLat {
  return [
    round(Math.atan2(y, x) / RADIANS),
    round(Math.atan2(z, Math.hypot(x, y)) / RADIANS),
  ];
}

/** The angle between two unit vectors; `atan2` stays accurate at 0 and at π. */
function centralAngle(a: Vector, b: Vector): number {
  const cross = Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
  return Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

/** The point a fraction `f` of the way from `a` to `b` along their great circle. */
function slerp(a: Vector, b: Vector, angle: number, f: number): Vector {
  const sine = Math.sin(angle);
  const wa = Math.sin((1 - f) * angle) / sine;
  const wb = Math.sin(f * angle) / sine;
  return [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]];
}

/** Great-circle distance on the mean-radius sphere (haversine). */
export function haversineKm(from: LngLat, to: LngLat): number {
  const phi1 = from[1] * RADIANS;
  const phi2 = to[1] * RADIANS;
  const h =
    Math.sin((phi2 - phi1) / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(((to[0] - from[0]) * RADIANS) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function densify(
  from: LngLat,
  to: LngLat,
  a: Vector,
  b: Vector,
  angle: number,
): LngLat[] {
  const km = angle * EARTH_RADIUS_KM;
  const segments = Math.min(MAX_SEGMENTS, Math.max(1, Math.ceil(km / MAX_SEGMENT_KM)));
  const points: LngLat[] = [[from[0], from[1]]];
  for (let i = 1; i < segments; i += 1) {
    points.push(toLngLat(slerp(a, b, angle, i / segments)));
  }
  points.push([to[0], to[1]]);
  return points;
}

/**
 * Cut wherever neighbouring longitudes are more than 180° apart — the short
 * way between them crosses the antimeridian — closing one part on the edge
 * being left and opening the next on the opposite edge, at the latitude
 * interpolated where the step meets it.
 */
function splitAtAntimeridian(points: LngLat[]): LngLat[][] {
  const parts: LngLat[][] = [];
  let current: LngLat[] = [points[0]!];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    if (Math.abs(next[0] - prev[0]) > 180) {
      const edge = prev[0] > 0 ? 180 : -180;
      const span = next[0] + 2 * edge - prev[0];
      const t = span === 0 ? 0 : (edge - prev[0]) / span;
      const lat = round(prev[1] + t * (next[1] - prev[1]));
      current.push([edge, lat]);
      parts.push(current);
      current = [[-edge, lat]];
    }
    current.push(next);
  }
  parts.push(current);
  return parts;
}

/**
 * Every great circle through a point passes through its antipode, so any is a
 * shortest path; take the meridian of `from`, through the pole on its side.
 * When `from` is itself a pole every meridian starts there, so the route goes
 * down the prime meridian through [0, 0] instead.
 */
function viaPole(from: LngLat, to: LngLat): LngLat[][] {
  if (Math.abs(from[1]) > 89.999) {
    return [...greatCircle(from, [0, 0]), ...greatCircle([0, 0], to)];
  }
  const pole = from[1] >= 0 ? 90 : -90;
  return [...greatCircle(from, [from[0], pole]), ...greatCircle([to[0], pole], to)];
}

/**
 * The drawable path from `from` to `to`: one part, or two where the leg
 * crosses the antimeridian. Empty when both are the same place.
 */
export function greatCircle(from: LngLat, to: LngLat): LngLat[][] {
  const a = toVector(from);
  const b = toVector(to);
  const angle = centralAngle(a, b);
  if (angle < SAME_PLACE) return [];
  if (Math.PI - angle < ANTIPODAL) return viaPole(from, to);
  return splitAtAntimeridian(densify(from, to, a, b, angle));
}
