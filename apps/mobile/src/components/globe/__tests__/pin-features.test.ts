/**
 * The pins of the globe — feature 005, T533 (FR-011; research D5-04, contract C5-24).
 *
 * One pin per trip with a placed stop, at the stop the traveller is at today (else the first
 * one). They are drawn in rank order, past under planned under active, so the live trip is
 * never under another; a roundel (a photo in a ring) is for the trips that matter most, up
 * to about sixty, and every other pin is a plain dot.
 */
import { GlobeLayers } from '@/constants/theme';
import { fnv1a32 } from '@/lib/fnv1a';
import {
  toGlobeTrips,
  type GlobeStopRow,
  type GlobeTrip,
} from '@/features/globe/globe-data';

import {
  PIN_RANK,
  ROUNDEL_LIMIT,
  pinCollection,
  pinCountries,
  pinImageKey,
  roundelRequests,
  splitPins,
} from '../pin-features';

const TODAY = '2026-05-10';

let n = 0;
function stop(
  tripId: string,
  lng: number,
  arrive: string,
  depart = arrive,
  lat: number | null = 40,
): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    city_id: n,
    arrive_date: arrive,
    depart_date: depart,
    country_id: 1,
    lat: lat === null ? null : lat,
    lng: lat === null ? null : lng,
  };
}

/** A trip with one stop on `arrive`, so its status follows from the date alone. */
function oneStopTrips(...specs: [id: string, arrive: string][]): GlobeTrip[] {
  return toGlobeTrips(
    specs.map(([id]) => ({ id, title: id })),
    specs.map(([id, arrive], i) => stop(id, i, arrive)),
    TODAY,
  );
}

const PAST = '2025-01-01';
const NOW = TODAY;
const LATER = '2027-01-01';

describe('PIN_RANK and ROUNDEL_LIMIT', () => {
  test('active ranks above planned above past, so the live trip is drawn last and on top', () => {
    expect(PIN_RANK.past).toBeLessThan(PIN_RANK.planning);
    expect(PIN_RANK.planning).toBeLessThan(PIN_RANK.active);
  });

  test('roundels stop at about sixty', () => {
    expect(ROUNDEL_LIMIT).toBe(60);
    expect(GlobeLayers.pins.roundelLimit).toBe(ROUNDEL_LIMIT);
  });
});

describe('pinCollection', () => {
  test('has one point per trip with a placed stop, with the status and its rank', () => {
    const { features } = pinCollection(oneStopTrips(['a', PAST]), TODAY);
    expect(features).toHaveLength(1);
    expect(features[0]).toMatchObject({
      type: 'Feature',
      id: 'pin:a',
      geometry: { type: 'Point', coordinates: [0, 40] },
      properties: { trip_id: 'a', status: 'past', rank: PIN_RANK.past },
    });
  });

  test('is ordered by rank, past then planned then active, whatever the order of the trips', () => {
    const trips = oneStopTrips(['live', NOW], ['old', PAST], ['soon', LATER]);
    expect(pinCollection(trips, TODAY).features.map((f) => f.properties.status)).toEqual([
      'past',
      'planning',
      'active',
    ]);
  });

  test('keeps the order of the trips within a rank', () => {
    const trips = oneStopTrips(['b', PAST], ['a', PAST], ['c', PAST]);
    expect(pinCollection(trips, TODAY).features.map((f) => f.properties.trip_id)).toEqual(
      ['b', 'a', 'c'],
    );
  });

  test('rests at the stop the traveller is at today, else at the first placed stop', () => {
    const [active, planned] = toGlobeTrips(
      [
        { id: 'active', title: 'Active' },
        { id: 'planned', title: 'Planned' },
      ],
      [
        stop('active', 1, '2026-05-08', '2026-05-09'),
        stop('active', 2, '2026-05-09', '2026-05-12'),
        stop('active', 3, '2026-05-12', '2026-05-14'),
        stop('planned', 10, '2027-01-01'),
        stop('planned', 11, '2027-01-03'),
      ],
      TODAY,
    );
    const at = (trip: GlobeTrip) =>
      pinCollection([trip], TODAY).features[0]!.geometry.coordinates;
    expect(at(active!)).toEqual([2, 40]);
    expect(at(planned!)).toEqual([10, 40]);
  });

  test('has no pin for a trip with nothing placed, or no stops at all', () => {
    const trips = toGlobeTrips(
      [
        { id: 'unplaced', title: 'Unplaced' },
        { id: 'empty', title: 'Empty' },
      ],
      [stop('unplaced', 0, PAST, PAST, null)],
      TODAY,
    );
    expect(pinCollection(trips, TODAY).features).toEqual([]);
  });

  test('is empty, not absent, for an empty globe', () => {
    expect(pinCollection([], TODAY)).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('pinImageKey for a generated cover', () => {
  test('differs from any photograph, and follows the country and the palette', () => {
    const photo = pinImageKey('t1', 'active', 'file:///a.jpg');
    const generated = pinImageKey('t1', 'active', null, 'light', 'PT');
    expect(generated).not.toBe(photo);
    expect(pinImageKey('t1', 'active', null, 'light', 'pt')).toBe(generated);
    expect(pinImageKey('t1', 'active', null, 'light', 'ES')).not.toBe(generated);
    expect(pinImageKey('t1', 'active', null, 'dark', 'PT')).not.toBe(generated);
    expect(pinImageKey('t1', 'planning', null, 'light', 'PT')).not.toBe(generated);
  });
});

describe('pinCountries', () => {
  test('is the country of the stop the pin rests at, null when this device has not cached it', () => {
    const rows = [
      { ...stop('a', 1, PAST), country_iso: 'pt' },
      { ...stop('b', 2, PAST) },
      { ...stop('c', 3, '2026-05-01', '2026-05-09'), country_iso: 'ES' },
      { ...stop('c', 4, NOW, '2026-05-12'), country_iso: 'FR' },
    ];
    const trips = toGlobeTrips(
      ['a', 'b', 'c'].map((id) => ({ id, title: id })),
      rows,
      TODAY,
    );
    expect(pinCountries(trips, TODAY)).toEqual({ a: 'PT', b: null, c: 'FR' });
  });
});

describe('pinImageKey', () => {
  test('is stable, and names the trip', () => {
    expect(pinImageKey('t1', 'active', 'file:///a.jpg')).toBe(
      pinImageKey('t1', 'active', 'file:///a.jpg'),
    );
    expect(pinImageKey('t1', 'active', 'file:///a.jpg')).toContain('t1');
  });

  test('changes with the scheme, because the ring colours follow the theme', () => {
    expect(pinImageKey('t1', 'active', 'file:///a.jpg', 'dark')).not.toBe(
      pinImageKey('t1', 'active', 'file:///a.jpg', 'light'),
    );
    expect(pinImageKey('t1', 'active', 'file:///a.jpg')).toBe(
      pinImageKey('t1', 'active', 'file:///a.jpg', 'light'),
    );
  });

  test('changes with the cover and with the status, because the ring is baked into the bitmap', () => {
    const base = pinImageKey('t1', 'active', 'file:///a.jpg');
    expect(pinImageKey('t1', 'active', 'file:///b.jpg')).not.toBe(base);
    expect(pinImageKey('t1', 'planning', 'file:///a.jpg')).not.toBe(base);
    expect(pinImageKey('t2', 'active', 'file:///a.jpg')).not.toBe(base);
  });
});

/** `count` past trips, `t0` first, each with a cover. */
function crowd(count: number) {
  const trips = oneStopTrips(
    ...Array.from({ length: count }, (_, i): [string, string] => [`t${i}`, PAST]),
  );
  const covers = Object.fromEntries(trips.map((t) => [t.id, `file:///${t.id}.jpg`]));
  return { pins: pinCollection(trips, TODAY), covers };
}

describe('roundelRequests', () => {
  test('asks for a roundel for every trip with a cover, up to the limit', () => {
    const { pins, covers } = crowd(3);
    expect(roundelRequests(pins, covers).map((r) => r.tripId)).toEqual([
      't0',
      't1',
      't2',
    ]);
  });

  test('a trip without a cover still gets a roundel: the generated cover, not a bare dot', () => {
    const { pins, covers } = crowd(3);
    const { t1: _dropped, ...rest } = covers;
    const requests = roundelRequests(pins, rest, ROUNDEL_LIMIT, 'light', { t1: 'pt' });
    expect(requests.map((r) => r.tripId)).toEqual(['t0', 't1', 't2']);
    expect(requests[1]).toMatchObject({ cover: null, iso: 'PT' });
    expect(requests[1]!.palette).toBe(fnv1a32('t1') % 3);
    expect(requests[0]).toMatchObject({ cover: 'file:///t0.jpg', iso: null });
  });

  test('a generated cover without a country carries no code, and the palette follows the trip id', () => {
    const { pins } = crowd(2);
    const [a, b] = roundelRequests(pins, {});
    expect(a).toMatchObject({ cover: null, iso: null, palette: fnv1a32('t0') % 3 });
    expect(b!.palette).toBe(fnv1a32('t1') % 3);
  });

  test('beyond about sixty the rest are dots: sixty requests, however many pins', () => {
    const { pins, covers } = crowd(75);
    expect(roundelRequests(pins, covers)).toHaveLength(60);
    expect(roundelRequests(pins, covers, 12)).toHaveLength(12);
  });

  test('the live trip and the planned ones are served before the past ones when places are short', () => {
    const trips = oneStopTrips(
      ...Array.from({ length: 62 }, (_, i): [string, string] => [`p${i}`, PAST]),
      ['live', NOW],
      ['soon', LATER],
    );
    const covers = Object.fromEntries(trips.map((t) => [t.id, `file:///${t.id}.jpg`]));
    const ids = roundelRequests(pinCollection(trips, TODAY), covers).map((r) => r.tripId);
    expect(ids).toHaveLength(60);
    expect(ids).toContain('live');
    expect(ids).toContain('soon');
    expect(ids.filter((id) => id.startsWith('p'))).toHaveLength(58);
  });

  test('a request carries what the bitmap is made of: key, trip, status and cover', () => {
    const trips = oneStopTrips(['live', NOW]);
    const [request] = roundelRequests(pinCollection(trips, TODAY), {
      live: 'file:///live.jpg',
    });
    expect(request).toEqual({
      key: pinImageKey('live', 'active', 'file:///live.jpg'),
      tripId: 'live',
      status: 'active',
      cover: 'file:///live.jpg',
      iso: null,
      palette: fnv1a32('live') % 3,
    });
  });
});

describe('splitPins', () => {
  test('a pin with a bitmap is a roundel, every other pin is a dot, none is both or neither', () => {
    const { pins, covers } = crowd(4);
    const requests = roundelRequests(pins, covers);
    const bitmaps = {
      [requests[0]!.key]: 'file:///bitmap-0.png',
      [requests[2]!.key]: 'file:///bitmap-2.png',
    };
    const { roundels, dots } = splitPins(pins, requests, bitmaps);
    expect(roundels.features.map((f) => f.properties.trip_id)).toEqual(['t0', 't2']);
    expect(dots.features.map((f) => f.properties.trip_id)).toEqual(['t1', 't3']);
    expect(roundels.features[0]!.properties.roundel).toBe(requests[0]!.key);
  });

  test('with no bitmaps, which is how it starts, every pin is a dot', () => {
    const { pins, covers } = crowd(3);
    const { roundels, dots } = splitPins(pins, roundelRequests(pins, covers), {});
    expect(roundels.features).toEqual([]);
    expect(dots.features).toHaveLength(3);
  });

  test('each side keeps the rank order, so the live trip is still last', () => {
    const trips = oneStopTrips(['live', NOW], ['old', PAST], ['soon', LATER]);
    const pins = pinCollection(trips, TODAY);
    const covers = { live: 'a', old: 'b', soon: 'c' };
    const requests = roundelRequests(pins, covers);
    const bitmaps = Object.fromEntries(
      requests.map((r) => [r.key, `file:///${r.tripId}.png`]),
    );
    const { roundels } = splitPins(pins, requests, bitmaps);
    expect(roundels.features.map((f) => f.properties.rank)).toEqual([0, 1, 2]);
  });

  test('a bitmap nobody asked for (a cover that changed) draws nothing', () => {
    const { pins, covers } = crowd(1);
    const { roundels, dots } = splitPins(pins, roundelRequests(pins, covers), {
      'roundel:stale': 'file:///x.png',
    });
    expect(roundels.features).toEqual([]);
    expect(dots.features).toHaveLength(1);
  });

  test('does not touch its input', () => {
    const { pins, covers } = crowd(2);
    const before = JSON.stringify(pins);
    splitPins(pins, roundelRequests(pins, covers), {});
    expect(JSON.stringify(pins)).toBe(before);
  });
});
