/**
 * Filing a photo under a city — tasks.md T116 (User Story 5, Acceptance
 * Scenario 2; FR-028; research D-34; Constitution IV).
 *
 * Pure. A photo with a position is filed under the NEAREST of its trip's
 * placed cities within 50 km — the same rule the media worker applies on the
 * server — and under none when nothing is that close. A filing that
 * contradicts the photo's own position is surfaced (spec edge case), never
 * silently "corrected".
 */
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  CITY_MATCH_RADIUS_KM,
  filingChoices,
  filingMismatchKm,
  nearestTripCity,
} from '@/features/photos/city-match';

type Stop = Pick<StopWithPlace, 'city_id' | 'city_name' | 'country_name' | 'lat' | 'lng'>;

const roma: Stop = {
  city_id: 100,
  city_name: 'Roma',
  country_name: 'Italy',
  lat: 41.9028,
  lng: 12.4964,
};
const firenze: Stop = {
  city_id: 101,
  city_name: 'Firenze',
  country_name: 'Italy',
  lat: 43.7696,
  lng: 11.2558,
};
const uncached: Stop = {
  city_id: 999,
  city_name: null,
  country_name: null,
  lat: null,
  lng: null,
};

describe('nearestTripCity', () => {
  test('the radius is the server worker’s 50 km', () => {
    expect(CITY_MATCH_RADIUS_KM).toBe(50);
  });

  test('a photo taken in Rome is filed under Roma, not Firenze', () => {
    expect(nearestTripCity({ lat: 41.8986, lng: 12.4769 }, [firenze, roma])).toBe(100);
  });

  test('the nearest wins when two of the trip’s cities are within reach', () => {
    const ostia: Stop = {
      ...roma,
      city_id: 102,
      city_name: 'Ostia',
      lat: 41.7317,
      lng: 12.2856,
    };
    // About 3 km from Ostia and 22 km from central Rome.
    expect(nearestTripCity({ lat: 41.74, lng: 12.32 }, [roma, ostia])).toBe(102);
  });

  test('farther than 50 km from every city is filed under none', () => {
    // Orvieto: about 90 km north of Rome.
    expect(nearestTripCity({ lat: 42.7185, lng: 12.1107 }, [roma, firenze])).toBeNull();
  });

  test('the boundary is inclusive', () => {
    // One degree of latitude on the mean sphere is 111.19 km.
    const north: Stop = { ...roma, city_id: 7, lat: 1, lng: 0 };
    expect(nearestTripCity({ lat: 0, lng: 0.0000001 }, [north], 111.2)).toBe(7);
    expect(nearestTripCity({ lat: 0, lng: 0.0000001 }, [north], 111.1)).toBeNull();
  });

  test('works across the date line', () => {
    const suva: Stop = {
      ...roma,
      city_id: 300,
      city_name: 'Suva',
      lat: -17.7,
      lng: -179.9,
    };
    expect(nearestTripCity({ lat: -17.7, lng: 179.95 }, [suva])).toBe(300);
  });

  test('a city this device has not cached cannot be measured, so it is skipped', () => {
    expect(nearestTripCity({ lat: 41.9, lng: 12.5 }, [uncached])).toBeNull();
    expect(nearestTripCity({ lat: 41.9, lng: 12.5 }, [uncached, roma])).toBe(100);
    expect(
      nearestTripCity({ lat: 41.9, lng: 12.5 }, [{ ...roma, lat: Number.NaN }]),
    ).toBeNull();
  });

  test('two cities at one position resolve to the first the trip visits', () => {
    const twin: Stop = { ...roma, city_id: 555 };
    expect(nearestTripCity({ lat: 41.9, lng: 12.5 }, [twin, roma])).toBe(555);
  });

  test('no position, or no stops, files under none', () => {
    expect(nearestTripCity({ lat: null, lng: null }, [roma])).toBeNull();
    expect(nearestTripCity({ lat: 41.9, lng: null }, [roma])).toBeNull();
    expect(nearestTripCity({ lat: 41.9, lng: 12.5 }, [])).toBeNull();
  });
});

describe('filingMismatchKm (spec edge case: location contradicts the filing)', () => {
  test('a Rome photo filed under Firenze is reported with the distance', () => {
    const km = filingMismatchKm(
      { exif_lat: 41.9028, exif_lng: 12.4964 },
      { lat: firenze.lat, lng: firenze.lng },
    );
    expect(km).not.toBeNull();
    expect(km!).toBeGreaterThan(220);
    expect(km!).toBeLessThan(240);
  });

  test('a photo within 50 km of its city is not a contradiction', () => {
    expect(
      filingMismatchKm(
        { exif_lat: 41.8986, exif_lng: 12.4769 },
        { lat: roma.lat, lng: roma.lng },
      ),
    ).toBeNull();
  });

  test('nothing to compare is not a contradiction', () => {
    expect(filingMismatchKm({ exif_lat: null, exif_lng: null }, roma)).toBeNull();
    expect(filingMismatchKm({ exif_lat: 41.9, exif_lng: 12.5 }, null)).toBeNull();
    expect(
      filingMismatchKm({ exif_lat: 41.9, exif_lng: 12.5 }, { lat: null, lng: null }),
    ).toBeNull();
  });
});

describe('filingChoices', () => {
  test('each of the trip’s cities once, in trip order, then “No city”', () => {
    const choices = filingChoices([roma, firenze, { ...roma }], {
      city_id: null,
      city_name: null,
      country_name: null,
    });
    expect(choices).toEqual([
      { key: 'city:100', cityId: 100, label: 'Roma, Italy' },
      { key: 'city:101', cityId: 101, label: 'Firenze, Italy' },
      { key: 'none', cityId: null, label: 'No city' },
    ]);
  });

  test('an uncached city still has a name a traveller can follow', () => {
    const [first] = filingChoices([uncached], {
      city_id: null,
      city_name: null,
      country_name: null,
    });
    expect(first).toEqual({ key: 'city:999', cityId: 999, label: 'City #999' });
  });

  test('a filing whose stop has since been removed stays visible and selectable', () => {
    const choices = filingChoices([roma], {
      city_id: 101,
      city_name: 'Firenze',
      country_name: 'Italy',
    });
    expect(choices.map((choice) => choice.key)).toEqual(['city:100', 'city:101', 'none']);
    expect(choices[1]?.label).toBe('Firenze, Italy');
  });
});
