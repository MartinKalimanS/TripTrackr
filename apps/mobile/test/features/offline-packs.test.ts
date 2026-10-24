/**
 * Offline map packs, the pure half — tasks.md T105 (FR-044; User Story 4,
 * Acceptance Scenarios 3 and 4); research D-06.
 *
 * Pinned here: one pack per city, named by the city's public id and carrying
 * nothing about a trip (Constitution I); a ~30 km box that never leaves Web
 * Mercator's latitudes and never wraps the long way round the antimeridian;
 * progress in whole percent that reads 100% only when the download is
 * actually complete, on both the legacy numeric state and the string the SDK
 * v11 native modules send; and every failure turned into plain words.
 */
import {
  CITY_PACK_RADIUS_KM,
  CITY_PACK_ZOOM,
  OFFLINE_PACK_COPY,
  cityBounds,
  cityIdOfPack,
  cityPackOptions,
  describePackError,
  formatPackSize,
  isAlreadyExists,
  packName,
  packProgress,
  packStatusText,
  splitByPack,
  tripCities,
  type OfflineCity,
  type OfflinePackState,
} from '@/features/trips/offline-packs';

const KM_PER_DEGREE = 111.32;

const rome: OfflineCity = {
  cityId: 100,
  cityName: 'Roma',
  countryName: 'Italy',
  lat: 41.9,
  lng: 12.5,
};

/** East–west width of a box at its centre latitude, in km. */
function widthKm([ne, sw]: ReturnType<typeof cityBounds>, lat: number): number {
  return (ne[0] - sw[0]) * KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
}

describe('packName / cityIdOfPack — one pack per city, shared by every trip', () => {
  test('names a pack by the city’s public id, and reads the id back', () => {
    expect(packName(100)).toBe('city-100');
    expect(cityIdOfPack(packName(100))).toBe(100);
  });

  test.each([['city-'], ['city-abc'], ['city-12x'], ['trip-100'], ['offlinePack']])(
    '%s is not a city pack',
    (name) => {
      expect(cityIdOfPack(name)).toBeNull();
    },
  );

  test('a pack without a name is not a city pack either', () => {
    expect(cityIdOfPack(undefined)).toBeNull();
    expect(cityIdOfPack(42)).toBeNull();
  });
});

describe('cityBounds — a box of ~15 km radius around the city', () => {
  test('is [north-east, south-west], about 30 km tall and 30 km wide', () => {
    const [ne, sw] = cityBounds(rome.lng, rome.lat);

    expect(ne[0]).toBeGreaterThan(sw[0]);
    expect(ne[1]).toBeGreaterThan(sw[1]);
    expect((ne[1] - sw[1]) * KM_PER_DEGREE).toBeCloseTo(2 * CITY_PACK_RADIUS_KM, 6);
    expect(widthKm([ne, sw], rome.lat)).toBeCloseTo(2 * CITY_PACK_RADIUS_KM, 6);
    expect(ne).toEqual([expect.closeTo(12.681, 3), expect.closeTo(42.0347, 3)]);
    expect(sw).toEqual([expect.closeTo(12.319, 3), expect.closeTo(41.7653, 3)]);
  });

  test('widens in degrees of longitude towards the poles, so it stays ~30 km wide', () => {
    const tromso = cityBounds(18.96, 69.65);
    expect(widthKm(tromso, 69.65)).toBeCloseTo(2 * CITY_PACK_RADIUS_KM, 6);
    expect(tromso[0][0] - tromso[1][0]).toBeGreaterThan(0.7);
  });

  test('is cut at 85° north and south, inside the latitudes Web Mercator can draw', () => {
    const north = cityBounds(-62.35, 84.95);
    expect(north[0][1]).toBe(85);
    expect(north[1][1]).toBeCloseTo(84.95 - CITY_PACK_RADIUS_KM / KM_PER_DEGREE, 6);

    const south = cityBounds(166.67, -84.95);
    expect(south[1][1]).toBe(-85);
    expect(south[0][1]).toBeCloseTo(-84.95 + CITY_PACK_RADIUS_KM / KM_PER_DEGREE, 6);
  });

  test('at a pole it spans every longitude and stays within ±85°, with no NaN or Infinity', () => {
    for (const lat of [90, -90]) {
      const [ne, sw] = cityBounds(0, lat);
      expect(ne[0]).toBe(180);
      expect(sw[0]).toBe(-180);
      for (const value of [...ne, ...sw]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(Math.abs(value)).toBeLessThanOrEqual(180);
      }
      expect(Math.abs(ne[1])).toBeLessThanOrEqual(85);
      expect(Math.abs(sw[1])).toBeLessThanOrEqual(85);
    }
  });

  test('is cut at the antimeridian rather than wrapped the long way round the world', () => {
    // Taveuni, Fiji: 15 km east of it is past 180°.
    const [ne, sw] = cityBounds(179.97, -16.8);
    expect(ne[0]).toBe(180);
    expect(sw[0]).toBeCloseTo(179.83, 2);
    expect(ne[0] - sw[0]).toBeLessThan(1);

    // And from the western side.
    const [neWest, swWest] = cityBounds(-179.95, -16.8);
    expect(swWest[0]).toBe(-180);
    expect(neWest[0]).toBeCloseTo(-179.81, 2);
    expect(neWest[0] - swWest[0]).toBeLessThan(1);
  });
});

describe('cityPackOptions — what is asked of Mapbox', () => {
  test('the app’s basemap, city zooms 10–16, and a public city id and name only', () => {
    const options = cityPackOptions(rome);

    expect(options).toEqual({
      name: 'city-100',
      styleURL: 'mapbox://styles/mapbox/standard',
      bounds: cityBounds(rome.lng, rome.lat),
      minZoom: 10,
      maxZoom: 16,
      metadata: { cityId: 100, cityName: 'Roma' },
    });
    expect(CITY_PACK_ZOOM).toEqual({ min: 10, max: 16 });
    // Constitution I: no trip id, no dates, no traveller data in a pack.
    expect(Object.keys(options.metadata ?? {})).toEqual(['cityId', 'cityName']);
  });
});

describe('tripCities — each of the trip’s cities once, in visiting order', () => {
  const stop = (
    overrides: Partial<{
      city_id: number;
      city_name: string | null;
      country_name: string | null;
      lat: number | null;
      lng: number | null;
    }>,
  ) => ({
    city_id: 100,
    city_name: 'Roma',
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
    ...overrides,
  });

  test('a city visited twice appears once, where it was first visited', () => {
    const cities = tripCities([
      stop({}),
      stop({ city_id: 101, city_name: 'Firenze', lat: 43.77, lng: 11.26 }),
      stop({}),
    ]);

    expect(cities.placed).toEqual([
      rome,
      { cityId: 101, cityName: 'Firenze', countryName: 'Italy', lat: 43.77, lng: 11.26 },
    ]);
    expect(cities.unplaced).toEqual([]);
  });

  test('a city this device has not cached cannot be saved, and is set apart', () => {
    const cities = tripCities([
      stop({ city_id: 777, city_name: null, country_name: null, lat: null, lng: null }),
      stop({}),
      stop({ city_id: 777, city_name: null, country_name: null, lat: null, lng: null }),
    ]);

    expect(cities.placed).toEqual([rome]);
    expect(cities.unplaced).toEqual([{ city_id: 777, city_name: null }]);
  });

  test('a position that cannot be on the map is not guessed at', () => {
    const cities = tripCities([
      stop({ city_id: 1, lat: Number.NaN }),
      stop({ city_id: 2, lng: 181 }),
      stop({ city_id: 3, lat: -91 }),
    ]);

    expect(cities.placed).toEqual([]);
    expect(cities.unplaced.map((city) => city.city_id)).toEqual([1, 2, 3]);
  });

  test('a city beyond the 85° Web Mercator can draw is not saved as a band round the world', () => {
    const cities = tripCities([
      stop({ city_id: 4, lat: 85.5 }),
      stop({ city_id: 5, lat: -89.9 }),
      stop({ city_id: 6, lat: 84.9 }),
    ]);

    expect(cities.placed.map((city) => city.cityId)).toEqual([6]);
    expect(cities.unplaced.map((city) => city.city_id)).toEqual([4, 5]);
  });

  test('no stops, no cities', () => {
    expect(tripCities([])).toEqual({ placed: [], unplaced: [] });
  });
});

describe('packProgress — native download status to what the screen shows', () => {
  test('whole percent, floored, with the bytes saved so far', () => {
    expect(
      packProgress({ state: 1, percentage: 42.7, completedResourceSize: 5_000_000 }),
    ).toEqual({ percent: 42, complete: false, bytes: 5_000_000 });
  });

  test('never reads 100% before the download has finished', () => {
    expect(packProgress({ state: 1, percentage: 99.9 })).toEqual({
      percent: 99,
      complete: false,
      bytes: 0,
    });
  });

  test('complete at 100%', () => {
    expect(
      packProgress({ state: 1, percentage: 100, completedResourceSize: 12_400_000 }),
    ).toEqual({ percent: 100, complete: true, bytes: 12_400_000 });
  });

  test.each([
    ['the legacy numeric Complete', 2],
    ['the SDK v11 native modules’ "complete"', 'complete'],
  ])('complete on %s, whatever the percentage says', (_label, state) => {
    expect(packProgress({ state, percentage: 99.5 })).toMatchObject({
      percent: 100,
      complete: true,
    });
  });

  test('a region with nothing to fetch reports no percentage; its state still counts', () => {
    expect(packProgress({ state: 'complete', percentage: null })).toEqual({
      percent: 100,
      complete: true,
      bytes: 0,
    });
  });

  test.each([[null], [undefined], [Number.NaN], [-5], ['42']])(
    'a percentage of %p reads as 0%, not as NaN',
    (percentage) => {
      expect(packProgress({ state: 'unknown', percentage })).toEqual({
        percent: 0,
        complete: false,
        bytes: 0,
      });
    },
  );

  test('the size falls back to tile bytes when resource bytes are missing, never below 0', () => {
    expect(packProgress({ percentage: 10, completedTileSize: 777 }).bytes).toBe(777);
    expect(
      packProgress({
        percentage: 10,
        completedResourceSize: Number.NaN,
        completedTileSize: 5,
      }).bytes,
    ).toBe(5);
    expect(packProgress({ percentage: 10, completedResourceSize: -1 }).bytes).toBe(0);
  });
});

describe('describePackError — every failure in words (FR-044)', () => {
  test.each([
    ['Tile count limit exceeded', OFFLINE_PACK_COPY.tooLarge],
    ['Tile pack limit reached', OFFLINE_PACK_COPY.tooLarge],
    ['Region contains too many tiles', OFFLINE_PACK_COPY.tooLarge],
    ['Disk full', OFFLINE_PACK_COPY.noSpace],
    ['Not enough storage', OFFLINE_PACK_COPY.noSpace],
    ['The Internet connection appears to be offline.', OFFLINE_PACK_COPY.noConnection],
    ['Unable to resolve host "api.mapbox.com"', OFFLINE_PACK_COPY.noConnection],
    ['The request timed out.', OFFLINE_PACK_COPY.noConnection],
    ['Network error', OFFLINE_PACK_COPY.noConnection],
    ['Style could not be parsed', OFFLINE_PACK_COPY.failed],
    // The SDK's own words for a pack it lost — not a connection problem.
    ['Unknown offline pack: city-100', OFFLINE_PACK_COPY.failed],
    ['Offline pack: city-100 already cancelled', OFFLINE_PACK_COPY.failed],
  ])('"%s"', (message, words) => {
    expect(describePackError({ name: 'city-100', message })).toBe(words);
    expect(describePackError(new Error(message))).toBe(words);
    expect(describePackError(message)).toBe(words);
  });

  test('a failure with no message still has words', () => {
    expect(describePackError(undefined)).toBe(OFFLINE_PACK_COPY.failed);
    expect(describePackError({ message: 42 })).toBe(OFFLINE_PACK_COPY.failed);
  });

  test('the device-limit copy says what to do', () => {
    expect(OFFLINE_PACK_COPY.tooLarge).toMatch(/Remove another city and try again/);
  });
});

describe('isAlreadyExists — the SDK refusing a second pack of the same name', () => {
  test('recognises @rnmapbox/maps’ refusal', () => {
    expect(
      isAlreadyExists(new Error('Offline pack with name city-100 already exists.')),
    ).toBe(true);
    expect(isAlreadyExists('Offline pack with name city-100 already exists.')).toBe(true);
  });

  test('and nothing else', () => {
    expect(isAlreadyExists(new Error('Disk full'))).toBe(false);
    expect(isAlreadyExists(null)).toBe(false);
  });
});

describe('formatPackSize — decimal units, as the phone’s own storage settings show them', () => {
  test.each([
    [12_400_000, '12.4 MB', '12.4 megabytes'],
    [1_000_000, '1 MB', '1 megabyte'],
    [512_000, '512 KB', '512 kilobytes'],
    [1_234_000_000, '1.2 GB', '1.2 gigabytes'],
    [0, '0 KB', '0 kilobytes'],
    [Number.NaN, '0 KB', '0 kilobytes'],
    [-10, '0 KB', '0 kilobytes'],
  ])('%p bytes → %s', (bytes, text, spoken) => {
    expect(formatPackSize(bytes, 'en-GB')).toEqual({ text, spoken });
  });

  test('in the device locale', () => {
    expect(formatPackSize(12_400_000, 'de-DE').text).toBe('12,4 MB');
    // The default is the device's (en-GB under test, jest.setup.ts).
    expect(formatPackSize(12_400_000).text).toBe('12.4 MB');
  });
});

describe('packStatusText — state as words, never colour alone (feature 002 FR-010)', () => {
  test('not saved', () => {
    expect(packStatusText({ kind: 'none' }, 'en-GB')).toEqual({
      text: 'Not saved on this device',
      spoken: 'Not saved on this device',
    });
  });

  test('downloading, as a percentage', () => {
    expect(packStatusText({ kind: 'downloading', percent: 42 }, 'en-GB')).toEqual({
      text: 'Downloading… 42%',
      spoken: 'Downloading, 42%',
    });
    expect(packStatusText({ kind: 'downloading', percent: 42 }, 'de-DE').text).toMatch(
      /^Downloading… 42\s%$/,
    );
  });

  test('ready, with its size', () => {
    expect(packStatusText({ kind: 'ready', bytes: 12_400_000 })).toEqual({
      text: 'Ready offline · 12.4 MB',
      spoken: 'Ready offline, 12.4 megabytes',
    });
  });

  test('a failure reads as its message', () => {
    expect(
      packStatusText({
        kind: 'error',
        message: OFFLINE_PACK_COPY.failed,
        partial: false,
      }),
    ).toEqual({ text: OFFLINE_PACK_COPY.failed, spoken: OFFLINE_PACK_COPY.failed });
  });
});

describe('splitByPack - the two lists of the offline maps screen (F11)', () => {
  const city = (cityId: number) => ({
    cityId,
    cityName: `City ${cityId}`,
    countryName: null,
    lat: 1,
    lng: 2,
  });
  const states: Record<number, OfflinePackState> = {
    1: { kind: 'none' },
    2: { kind: 'ready', bytes: 5 },
    3: { kind: 'downloading', percent: 10 },
    4: { kind: 'error', message: 'x', partial: true },
    5: { kind: 'ready', bytes: 7 },
  };

  test('finished maps are "saved"; everything else is still "to do", each in the trip’s order', () => {
    const cities = [1, 2, 3, 4, 5].map(city);
    const { todo, saved } = splitByPack(cities, (c) => states[c.cityId]);
    expect(todo.map((c) => c.cityId)).toEqual([1, 3, 4]);
    expect(saved.map((c) => c.cityId)).toEqual([2, 5]);
  });

  test('no city is dropped or repeated', () => {
    const cities = [1, 2, 3, 4, 5].map(city);
    const { todo, saved } = splitByPack(cities, (c) => states[c.cityId]);
    expect(todo.length + saved.length).toBe(cities.length);
  });
});
