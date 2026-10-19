/**
 * T545 - what the timeline draws between and on its stops (spec FR-041; data-model section 9
 * `StopLeg`; research D5-17): which stop is done, which one the traveller is at ("Now") and
 * which come next, and the great-circle distance between consecutive stops, absent wherever
 * either end is unplaced. Pure: today is passed in, the distance is `haversineKm` of
 * `features/globe/great-circle.ts` (the globe's own geometry, untouched), and nothing is
 * read from or written to the store.
 */
import {
  hasTransit,
  nightsLabel,
  stopLegs,
  stopNights,
  stopStates,
  type LegStop,
  type StateStop,
} from '@/features/trips/stop-timeline';

const stop = (id: string, arrive: string, depart: string): StateStop => ({
  id,
  arrive_date: arrive,
  depart_date: depart,
});

describe('stopStates: done, now, next', () => {
  const lisbon = stop('lisbon', '2026-10-12', '2026-10-14');
  const sintra = stop('sintra', '2026-10-14', '2026-10-15');
  const porto = stop('porto', '2026-10-15', '2026-10-19');

  test('a trip that has not started is all next', () => {
    expect(stopStates([lisbon, sintra, porto], '2026-10-01')).toEqual({
      lisbon: 'next',
      sintra: 'next',
      porto: 'next',
    });
  });

  test('a trip that is over is all done', () => {
    expect(stopStates([lisbon, sintra, porto], '2026-11-01')).toEqual({
      lisbon: 'done',
      sintra: 'done',
      porto: 'done',
    });
  });

  test('on a day inside a stop that stop is now, the ones before it are done and the ones after are next', () => {
    expect(stopStates([lisbon, sintra, porto], '2026-10-13')).toEqual({
      lisbon: 'now',
      sintra: 'next',
      porto: 'next',
    });
    expect(stopStates([lisbon, sintra, porto], '2026-10-17')).toEqual({
      lisbon: 'done',
      sintra: 'done',
      porto: 'now',
    });
  });

  test("on a travel day, when one stop is left and the next reached, the later one wins (as the globe's resting place does)", () => {
    expect(stopStates([lisbon, sintra, porto], '2026-10-14')).toEqual({
      lisbon: 'done',
      sintra: 'now',
      porto: 'next',
    });
    expect(stopStates([lisbon, sintra, porto], '2026-10-15')).toEqual({
      lisbon: 'done',
      sintra: 'done',
      porto: 'now',
    });
  });

  test('between two stops, with nothing covering today, none is now', () => {
    const a = stop('a', '2026-05-01', '2026-05-02');
    const b = stop('b', '2026-05-05', '2026-05-06');
    expect(stopStates([a, b], '2026-05-03')).toEqual({ a: 'done', b: 'next' });
  });

  test('overlapping stops: the later one in the list is now; the other, which has begun, is done', () => {
    const long = stop('long', '2026-06-01', '2026-06-10');
    const short = stop('short', '2026-06-04', '2026-06-06');
    expect(stopStates([long, short], '2026-06-05')).toEqual({
      long: 'done',
      short: 'now',
    });
  });

  test('has an entry for every stop, in any order, and is empty for none', () => {
    expect(Object.keys(stopStates([porto, lisbon], '2026-10-13')).sort()).toEqual([
      'lisbon',
      'porto',
    ]);
    expect(stopStates([], '2026-10-13')).toEqual({});
  });
});

describe('stopLegs: the distance between consecutive stops', () => {
  const at = (id: string, lat: number | null, lng: number | null): LegStop => ({
    id,
    lat,
    lng,
  });
  const lisbon = at('lisbon', 38.7223, -9.1393);
  const sintra = at('sintra', 38.8029, -9.3817);
  const porto = at('porto', 41.1579, -8.6291);

  test('is one leg per pair, from the one to the next', () => {
    const legs = stopLegs([lisbon, sintra, porto]);
    expect(legs.map((leg) => [leg.fromStopId, leg.toStopId])).toEqual([
      ['lisbon', 'sintra'],
      ['sintra', 'porto'],
    ]);
  });

  test('is the great-circle distance in kilometres', () => {
    const [lisbonSintra, sintraPorto] = stopLegs([lisbon, sintra, porto]);
    expect(lisbonSintra?.km).toBeGreaterThan(21);
    expect(lisbonSintra?.km).toBeLessThan(25);
    expect(sintraPorto?.km).toBeGreaterThan(265);
    expect(sintraPorto?.km).toBeLessThan(275);
  });

  test('is null when either end is unplaced, and is not bridged across it (A to C is not a leg)', () => {
    const unplaced = at('unknown', null, null);
    const legs = stopLegs([lisbon, unplaced, porto]);
    expect(legs).toHaveLength(2);
    expect(legs.map((leg) => leg.km)).toEqual([null, null]);
  });

  test('a coordinate that is not a position is unplaced', () => {
    expect(stopLegs([lisbon, at('nan', Number.NaN, 0)])[0]?.km).toBeNull();
    expect(stopLegs([lisbon, at('far', 120, 0)])[0]?.km).toBeNull();
    expect(stopLegs([lisbon, at('far', 0, 400)])[0]?.km).toBeNull();
  });

  test('has no legs for fewer than two stops', () => {
    expect(stopLegs([])).toEqual([]);
    expect(stopLegs([lisbon])).toEqual([]);
  });

  test('two stops in one place are a leg of zero kilometres, not a missing one', () => {
    expect(stopLegs([lisbon, { ...lisbon, id: 'again' }])[0]?.km).toBe(0);
  });
});

describe('hasTransit: when a dotted segment with a distance is drawn', () => {
  test('is false with no leg and for an unplaced end', () => {
    expect(hasTransit(undefined)).toBe(false);
    expect(hasTransit({ fromStopId: 'a', toStopId: 'b', km: null })).toBe(false);
  });

  test('is false when the traveller has not moved on: under a kilometre is one stay', () => {
    expect(hasTransit({ fromStopId: 'a', toStopId: 'b', km: 0 })).toBe(false);
    expect(hasTransit({ fromStopId: 'a', toStopId: 'b', km: 0.4 })).toBe(false);
  });

  test('is true once the distance rounds to a kilometre or more', () => {
    expect(hasTransit({ fromStopId: 'a', toStopId: 'b', km: 0.6 })).toBe(true);
    expect(hasTransit({ fromStopId: 'a', toStopId: 'b', km: 313.2 })).toBe(true);
  });
});

describe('stopNights: how long the traveller stays', () => {
  test('is the calendar nights between arrival and departure', () => {
    expect(stopNights(stop('a', '2026-10-12', '2026-10-14'))).toBe(2);
    expect(stopNights(stop('a', '2026-10-14', '2026-10-15'))).toBe(1);
    expect(stopNights(stop('a', '2026-10-12', '2026-10-12'))).toBe(0);
  });

  test('counts over a month end, a year end and a leap day, as calendar days', () => {
    expect(stopNights(stop('a', '2026-10-30', '2026-11-02'))).toBe(3);
    expect(stopNights(stop('a', '2026-12-31', '2027-01-01'))).toBe(1);
    expect(stopNights(stop('a', '2028-02-28', '2028-03-01'))).toBe(2);
  });

  test('is null for dates that are not a stay: damaged data, or a departure before the arrival', () => {
    expect(stopNights(stop('a', 'soon', '2026-10-14'))).toBeNull();
    expect(stopNights(stop('a', '2026-10-14', '2026-10-12'))).toBeNull();
  });
});

describe('nightsLabel', () => {
  test('says "Same day", "1 night" and "N nights"', () => {
    expect(nightsLabel(0)).toBe('Same day');
    expect(nightsLabel(1)).toBe('1 night');
    expect(nightsLabel(2)).toBe('2 nights');
    expect(nightsLabel(12)).toBe('12 nights');
  });

  test('says nothing for an unknown stay', () => {
    expect(nightsLabel(null)).toBeNull();
  });
});
