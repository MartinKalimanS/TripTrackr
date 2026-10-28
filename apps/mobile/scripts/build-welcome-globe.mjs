/**
 * Builds `src/features/auth/welcome-globe-data.ts`: the Welcome screen's static composed globe
 * (feature 005, F12; owner decision Q-11; the approved fallback of a static composed globe, so
 * no second Mapbox map and no `useMapboxReady` dependency on the first screen).
 *
 *   node scripts/build-welcome-globe.mjs && npx prettier --write src/features/auth/welcome-globe-data.ts
 *
 * Reads the prototype's Natural Earth 110m country TopoJSON (public domain,
 * `specs/005-sunrise-passport-ui/reference/prototype/world.js`), projects it ONCE with an
 * orthographic projection centred on lon 8, lat 15 (the prototype's Welcome camera), keeps
 * only what the screen can show (the top of the disc, a margin either side), simplifies it to
 * integer units and writes SVG path strings in a 1000 by 1000 box (the disc is the circle of
 * radius 500 at 500,500). Pure decoration: no traveller data, no network.
 *
 * The arcs and the three dots are the picture's: Lisbon to London, Lisbon to Reykjavik
 * (planned) and Lisbon to New York (running off the left edge), great circles lifted off the
 * surface. They are an illustration, never a traveller's trip.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(
  here,
  '../../../specs/005-sunrise-passport-ui/reference/prototype/world.js',
);
const TARGET = resolve(here, '../src/features/auth/welcome-globe-data.ts');

const LON0 = 8;
const LAT0 = 15;
const R = 500;
const KEEP_X = 0.9;
const KEEP_Y_MAX = 0.55;
const VISITED = [
  '620',
  '724',
  '250',
  '826',
  '276',
  '380',
  '756',
  '040',
  '300',
  '504',
  '056',
  '528',
];
const rad = (d) => (d * Math.PI) / 180;

const topology = JSON.parse(
  readFileSync(SOURCE, 'utf8')
    .replace(/^window\.WORLD=/, '')
    .replace(/;\s*$/, ''),
);

function decodeArcs({ arcs, transform }) {
  const [sx, sy] = transform.scale;
  const [tx, ty] = transform.translate;
  return arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
}

const ARCS = decodeArcs(topology);

function ringOf(indices) {
  const points = [];
  for (const index of indices) {
    const arc = index >= 0 ? ARCS[index] : [...ARCS[~index]].reverse();
    points.push(...(points.length ? arc.slice(1) : arc));
  }
  return points;
}

/** Orthographic: unit-sphere coordinates, `visible` when the point faces the viewer. */
function project(lon, lat, radius = 1) {
  const l = rad(lon - LON0);
  const p = rad(lat);
  const p0 = rad(LAT0);
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l);
  const x = Math.cos(p) * Math.sin(l);
  const y = Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l);
  return { x: x * radius, y: -y * radius, visible: cosc > 0 };
}

const toUnits = ({ x, y }) => [Math.round(R + x * R), Math.round(R + y * R)];

/** A point behind the horizon is pressed onto the rim, which closes a ring tidily. */
function ringPoints(ring) {
  return ring.map(([lon, lat]) => {
    const point = project(lon, lat);
    if (point.visible) return point;
    const length = Math.hypot(point.x, point.y) || 1;
    return { x: point.x / length, y: point.y / length, visible: false };
  });
}

const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;

function simplify(points) {
  const kept = [];
  for (const point of points) {
    if (!kept.length || !near(kept[kept.length - 1], point)) kept.push(point);
  }
  return kept;
}

function inBox([x, y]) {
  return Math.abs(x - R) <= R * KEEP_X && y <= R + R * 2 * KEEP_Y_MAX - 2 * R * 0.45;
}

function ringPath(ring) {
  const projected = ringPoints(ring);
  if (projected.every((point) => !point.visible)) return '';
  const units = simplify(projected.map(toUnits));
  if (units.length < 3 || !units.some(inBox)) return '';
  return `M${units.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
}

function geometryPath(geometry) {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.arcs]
      : geometry.type === 'MultiPolygon'
        ? geometry.arcs
        : [];
  return polygons
    .flatMap((polygon) => polygon.map((indices) => ringPath(ringOf(indices))))
    .filter(Boolean)
    .join('');
}

const countries = topology.objects.countries.geometries;
const land = countries
  .filter((country) => !VISITED.includes(country.id))
  .map(geometryPath)
  .join('');
const visited = countries
  .filter((country) => VISITED.includes(country.id))
  .map(geometryPath)
  .join('');

/** Polylines of the front hemisphere, split where the line goes behind the horizon. */
function polylines(samples) {
  const lines = [];
  let current = [];
  for (const point of samples) {
    if (point.visible) current.push(toUnits(point));
    else if (current.length) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length) lines.push(current);
  return lines
    .filter((line) => line.length > 1)
    .map((line) => `M${line.map(([x, y]) => `${x} ${y}`).join('L')}`)
    .join('');
}

const graticuleSamples = [];
for (let lon = -180; lon < 180; lon += 20) {
  const line = [];
  for (let lat = -90; lat <= 90; lat += 3) line.push(project(lon, lat));
  graticuleSamples.push(line);
}
for (let lat = -80; lat <= 80; lat += 20) {
  const line = [];
  for (let lon = -180; lon <= 180; lon += 3) line.push(project(lon, lat));
  graticuleSamples.push(line);
}
const graticule = graticuleSamples.map(polylines).join('');

function greatCircle([lon1, lat1], [lon2, lat2], lift) {
  const a = [rad(lon1), rad(lat1)];
  const b = [rad(lon2), rad(lat2)];
  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((b[1] - a[1]) / 2) ** 2 +
          Math.cos(a[1]) * Math.cos(b[1]) * Math.sin((b[0] - a[0]) / 2) ** 2,
      ),
    );
  const steps = 48;
  const samples = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const k1 = Math.sin((1 - t) * delta) / Math.sin(delta);
    const k2 = Math.sin(t * delta) / Math.sin(delta);
    const x = k1 * Math.cos(a[1]) * Math.cos(a[0]) + k2 * Math.cos(b[1]) * Math.cos(b[0]);
    const y = k1 * Math.cos(a[1]) * Math.sin(a[0]) + k2 * Math.cos(b[1]) * Math.sin(b[0]);
    const z = k1 * Math.sin(a[1]) + k2 * Math.sin(b[1]);
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const lon = (Math.atan2(y, x) * 180) / Math.PI;
    samples.push(project(lon, lat, 1 + lift * Math.sin(Math.PI * t)));
  }
  return polylines(samples);
}

const LISBON = [-9.14, 38.72];
const LONDON = [-0.13, 51.5];
const REYKJAVIK = [-21.9, 64.15];
const NEW_YORK = [-74, 40.7];

const arcs = {
  lisbonLondon: greatCircle(LISBON, LONDON, 0.05),
  lisbonReykjavik: greatCircle(LISBON, REYKJAVIK, 0.16),
  lisbonNewYork: greatCircle(LISBON, NEW_YORK, 0.2),
};
const dot = (place) => toUnits(project(place[0], place[1]));
const pins = { lisbon: dot(LISBON), london: dot(LONDON), reykjavik: dot(REYKJAVIK) };

const out = `/**
 * GENERATED by \`scripts/build-welcome-globe.mjs\` - do not edit by hand.
 *
 * The Welcome screen's static composed globe (feature 005, F12): Natural Earth 110m countries
 * (public domain) projected once, orthographic, centred on lon ${LON0}, lat ${LAT0}, as SVG path strings in a
 * 1000 by 1000 box (the disc is the circle of radius ${R} at ${R},${R}). \`visited\` is the picture's
 * coral countries, \`arcs\` and \`pins\` its illustration (Lisbon, London, Reykjavik, New York):
 * decoration, never a traveller's data.
 */
export const WELCOME_GLOBE_BOX = ${2 * R};
export const WELCOME_GLOBE_RADIUS = ${R};

export const WELCOME_GLOBE = {
  land: '${land}',
  visited: '${visited}',
  graticule: '${graticule}',
  arcs: {
    lisbonLondon: '${arcs.lisbonLondon}',
    lisbonReykjavik: '${arcs.lisbonReykjavik}',
    lisbonNewYork: '${arcs.lisbonNewYork}',
  },
  pins: {
    lisbon: [${pins.lisbon}],
    london: [${pins.london}],
    reykjavik: [${pins.reykjavik}],
  },
} as const;
`;
writeFileSync(TARGET, out);
console.log(`wrote ${TARGET} (${out.length} bytes)`);
