/**
 * The route preview of the stop editor (005 UI-SPEC 9.1: "Stop 3 · 322 km from Sintra").
 * Q-11: no invented data. The distance is the great-circle distance between the stops' real
 * coordinates, and it is absent when the previous stop's position is not cached.
 */
import { planRoute, routeCode } from '@/features/trips/stop-route';

const LISBON = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
const SINTRA = { name: 'Sintra', lat: 38.8029, lng: -9.3817 };
const PORTO = { name: 'Porto', lat: 41.1579, lng: -8.6291 };

describe('routeCode', () => {
  test('is the first three letters of the name, accents folded, upper case', () => {
    expect(routeCode('Lisboa')).toBe('LIS');
    expect(routeCode('Zürich')).toBe('ZUR');
    expect(routeCode('São Paulo')).toBe('SAO');
    expect(routeCode('Évora')).toBe('EVO');
  });

  test('skips what is not a letter and keeps a short name as it is', () => {
    expect(routeCode("L'Aquila")).toBe('LAQ');
    expect(routeCode('Ur')).toBe('UR');
    expect(routeCode('  ')).toBe('?');
    expect(routeCode('東京')).toBe('東京');
  });
});

describe('planRoute', () => {
  test('is nothing for the first stop of a trip: there is no line to draw', () => {
    expect(planRoute([], PORTO)).toBeNull();
  });

  test('draws the last two stops and the new one, which is the next position', () => {
    const route = planRoute([LISBON, SINTRA], PORTO);
    expect(route?.nodes.map((node) => node.code)).toEqual(['LIS', 'SIN', 'POR']);
    expect(route?.nodes.map((node) => node.isNew)).toEqual([false, false, true]);
    expect(route?.position).toBe(3);
    expect(route?.fromName).toBe('Sintra');
  });

  test('keeps only the last two of a long trip, and the position counts them all', () => {
    const route = planRoute([LISBON, SINTRA, LISBON, SINTRA], PORTO);
    expect(route?.nodes).toHaveLength(3);
    expect(route?.position).toBe(5);
  });

  test('with one previous stop there are two dots', () => {
    const route = planRoute([SINTRA], PORTO);
    expect(route?.nodes.map((node) => node.code)).toEqual(['SIN', 'POR']);
    expect(route?.position).toBe(2);
  });

  test('the distance is the great-circle distance from the previous stop, from real coordinates', () => {
    const route = planRoute([LISBON, SINTRA], PORTO);
    // Sintra to Porto, straight line: about 270 km.
    expect(route?.km).toBeGreaterThan(268);
    expect(route?.km).toBeLessThan(272);
    expect(planRoute([SINTRA], SINTRA)?.km).toBe(0);
  });

  test('is symmetric: the distance does not depend on which end is new', () => {
    const forward = planRoute([SINTRA], PORTO)?.km ?? NaN;
    const back = planRoute([PORTO], SINTRA)?.km ?? NaN;
    expect(forward).toBeCloseTo(back, 6);
  });

  test('has no distance when the previous stop was never cached on this device', () => {
    const route = planRoute([LISBON, { name: 'Sintra', lat: null, lng: null }], PORTO);
    expect(route?.km).toBeNull();
    expect(route?.fromName).toBe('Sintra');
  });

  test('only the previous stop decides: an older stop without a position changes nothing', () => {
    const route = planRoute([{ name: 'Lisboa', lat: null, lng: null }, SINTRA], PORTO);
    expect(route?.km).not.toBeNull();
  });
});
