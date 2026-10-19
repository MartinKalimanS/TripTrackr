/**
 * The graticule — feature 005, T532 (research D5-04, contract C5-24).
 *
 * "One static GeoJSON of meridians and parallels every 30 degrees": a `LineLayer` over it
 * gives the planet its faint grid. Static, so it is computed once; pure, so it is checked
 * here and not on a phone.
 */
import { graticule } from '../graticule';

const lines = (step: number) => graticule(step).features;
const meridians = (step: number) =>
  lines(step).filter((f) => f.properties.kind === 'meridian');
const parallels = (step: number) =>
  lines(step).filter((f) => f.properties.kind === 'parallel');

describe('graticule(30)', () => {
  test('is a FeatureCollection of LineStrings', () => {
    const collection = graticule(30);
    expect(collection.type).toBe('FeatureCollection');
    for (const feature of lines(30)) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('LineString');
    }
  });

  test('has twelve meridians, the date line once, and five parallels without the poles', () => {
    expect(meridians(30).map((f) => f.properties.degrees)).toEqual([
      -180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150,
    ]);
    expect(parallels(30).map((f) => f.properties.degrees)).toEqual([-60, -30, 0, 30, 60]);
  });

  test('a meridian is one longitude from the far south to the far north', () => {
    for (const { geometry, properties } of meridians(30)) {
      const longitudes = new Set(geometry.coordinates.map(([lng]) => lng));
      expect([...longitudes]).toEqual([properties.degrees]);
      const latitudes = geometry.coordinates.map(([, lat]) => lat);
      expect(latitudes[0]).toBe(-85);
      expect(latitudes.at(-1)).toBe(85);
      expect(latitudes).toEqual([...latitudes].sort((a, b) => a - b));
    }
  });

  test('a parallel is one latitude from the date line round to the date line', () => {
    for (const { geometry, properties } of parallels(30)) {
      const latitudes = new Set(geometry.coordinates.map(([, lat]) => lat));
      expect([...latitudes]).toEqual([properties.degrees]);
      const longitudes = geometry.coordinates.map(([lng]) => lng);
      expect(longitudes[0]).toBe(-180);
      expect(longitudes.at(-1)).toBe(180);
    }
  });

  test('vertices are at most 10 degrees apart, so the engine bends a line round the sphere', () => {
    for (const { geometry } of lines(30)) {
      const { coordinates } = geometry;
      for (let i = 1; i < coordinates.length; i += 1) {
        const dLng = Math.abs(coordinates[i]![0] - coordinates[i - 1]![0]);
        const dLat = Math.abs(coordinates[i]![1] - coordinates[i - 1]![1]);
        expect(Math.max(dLng, dLat)).toBeLessThanOrEqual(10);
      }
    }
  });

  test('every coordinate is a place the map can draw', () => {
    for (const { geometry } of lines(30)) {
      for (const [lng, lat] of geometry.coordinates) {
        expect(Math.abs(lng)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(85);
      }
    }
  });

  test('every feature has an id of its own', () => {
    const ids = lines(30).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('is the same every time: nothing random, nothing shared', () => {
    expect(graticule(30)).toEqual(graticule(30));
    expect(graticule(30)).not.toBe(graticule(30));
  });
});

describe('graticule at other steps', () => {
  test('every 15 degrees: twenty-four meridians and eleven parallels', () => {
    expect(meridians(15)).toHaveLength(24);
    expect(parallels(15).map((f) => f.properties.degrees)).toEqual([
      -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75,
    ]);
  });

  test('every 90 degrees: four meridians and the equator', () => {
    expect(meridians(90)).toHaveLength(4);
    expect(parallels(90).map((f) => f.properties.degrees)).toEqual([0]);
  });

  test.each([0, -30, 7, 100, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a step of %p: it would leave a gap at the poles or loop forever',
    (step) => {
      expect(() => graticule(step)).toThrow(RangeError);
    },
  );
});
