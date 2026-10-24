/**
 * The generated Welcome globe (F12): `scripts/build-welcome-globe.mjs` output. Pinned so a
 * regeneration cannot silently draw nothing, put a dot off the disc, or balloon the bundle.
 */
import {
  WELCOME_GLOBE,
  WELCOME_GLOBE_BOX,
  WELCOME_GLOBE_RADIUS,
} from './welcome-globe-data';

const PATH = /^M-?\d+ -?\d+(L-?\d+ -?\d+|Z|M-?\d+ -?\d+)*Z?$/;

describe('the Welcome globe data', () => {
  test('is a 1000 box with a disc of radius 500', () => {
    expect(WELCOME_GLOBE_BOX).toBe(1000);
    expect(WELCOME_GLOBE_RADIUS).toBe(500);
  });

  test.each(['land', 'visited', 'graticule'] as const)(
    '%s is a non-empty path',
    (key) => {
      expect(WELCOME_GLOBE[key].length).toBeGreaterThan(200);
      expect(WELCOME_GLOBE[key]).toMatch(PATH);
    },
  );

  test.each(Object.keys(WELCOME_GLOBE.arcs))('the %s arc is a non-empty path', (key) => {
    const arc = WELCOME_GLOBE.arcs[key as keyof typeof WELCOME_GLOBE.arcs];
    expect(arc.length).toBeGreaterThan(100);
    expect(arc).toMatch(PATH);
  });

  test('the three dots sit on the disc, Lisbon south-west of London and Reykjavik', () => {
    const inside = ([x, y]: readonly [number, number]) =>
      Math.hypot(x - 500, y - 500) < WELCOME_GLOBE_RADIUS;
    const { lisbon, london, reykjavik } = WELCOME_GLOBE.pins;
    for (const pin of [lisbon, london, reykjavik]) expect(inside(pin)).toBe(true);
    expect(lisbon[0]).toBeLessThan(london[0]);
    expect(lisbon[1]).toBeGreaterThan(london[1]);
    expect(reykjavik[1]).toBeLessThan(london[1]);
  });

  test('stays small enough to ship in the bundle', () => {
    const size = JSON.stringify(WELCOME_GLOBE).length;
    expect(size).toBeLessThan(80_000);
  });
});
