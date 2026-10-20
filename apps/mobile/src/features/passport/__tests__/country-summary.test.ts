/**
 * T536 - the Countries list's data (feature 005; FR-016, FR-017, FR-084; data-model section 5;
 * research D5-17; owner question Q-2): each visited country with its continent, the number of
 * trips, the first and last visit, whether the live trip is there and where to fly the globe,
 * derived on the device from the same local rows as the globe's statistics. The figure above
 * the list is `travelSummary`'s, untouched (FR-082): these tests pin that the two agree.
 */
import { toGlobeTrips, type GlobeStopRow } from '@/features/globe/globe-data';
import { haversineKm } from '@/features/globe/great-circle';
import { travelSummary } from '@/features/globe/travel-stats';

import {
  CONTINENTS,
  WORLD_CONTINENTS,
  WORLD_COUNTRIES,
  continentsVisited,
  filterCountries,
  groupByContinent,
  recentVisits,
  summariseCountries,
  worldTotals,
  type CountryInfo,
} from '../country-summary';

const TODAY = '2026-10-14';

const COUNTRIES: CountryInfo[] = [
  { id: 33, iso_code: 'FR', name: 'France', continent: 'Europe' },
  { id: 41, iso_code: 'CH', name: 'Switzerland', continent: 'Europe' },
  { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' },
  { id: 81, iso_code: 'JP', name: 'Japan', continent: 'Asia' },
  { id: 1, iso_code: 'US', name: 'United States', continent: 'North America' },
  { id: 61, iso_code: 'AU', name: 'Australia', continent: 'Oceania' },
  { id: 679, iso_code: 'FJ', name: 'Fiji', continent: 'Oceania' },
  { id: 27, iso_code: 'ZA', name: 'South Africa', continent: 'Africa' },
  { id: 900, iso_code: 'XX', name: 'Atlantis', continent: 'Atlantis' },
  { id: 901, iso_code: 'XK', name: 'Kosovo', continent: 'Unknown' },
];

type CityFixture = Pick<GlobeStopRow, 'city_id' | 'country_id' | 'lng' | 'lat'>;

const PARIS: CityFixture = { city_id: 1, country_id: 33, lng: 2.3522, lat: 48.8566 };
const LYON: CityFixture = { city_id: 2, country_id: 33, lng: 4.8357, lat: 45.764 };
const NICE: CityFixture = { city_id: 3, country_id: 33, lng: 7.262, lat: 43.7102 };
const ZURICH: CityFixture = { city_id: 4, country_id: 41, lng: 8.5417, lat: 47.3769 };
const LISBON: CityFixture = { city_id: 5, country_id: 351, lng: -9.1393, lat: 38.7223 };
const SINTRA: CityFixture = { city_id: 6, country_id: 351, lng: -9.3817, lat: 38.8029 };
const TOKYO: CityFixture = { city_id: 7, country_id: 81, lng: 139.6917, lat: 35.6895 };
const NEW_YORK: CityFixture = { city_id: 8, country_id: 1, lng: -74.006, lat: 40.7128 };
const HONOLULU: CityFixture = { city_id: 9, country_id: 1, lng: -157.8583, lat: 21.3069 };
const SUVA: CityFixture = { city_id: 10, country_id: 679, lng: 178.44, lat: -18.1416 };
const TAVEUNI: CityFixture = { city_id: 11, country_id: 679, lng: -179.9, lat: -16.85 };
const ATLANTIS: CityFixture = { city_id: 12, country_id: 900, lng: -30, lat: 30 };
const PRISTINA: CityFixture = {
  city_id: 13,
  country_id: 901,
  lng: 21.1655,
  lat: 42.6629,
};
const SYDNEY: CityFixture = { city_id: 14, country_id: 61, lng: 151.2093, lat: -33.8688 };
const UNCACHED: CityFixture = { city_id: 99, country_id: null, lng: null, lat: null };
/** Cached city whose country has no row in this device's `countries` cache. */
const ORPHAN: CityFixture = { city_id: 98, country_id: 777, lng: 10, lat: 10 };

let n = 0;
function stop(
  tripId: string,
  city: CityFixture,
  arrive: string,
  depart: string = arrive,
): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: depart,
    ...city,
  };
}

function trips(
  rows: readonly string[],
  stops: readonly GlobeStopRow[],
  today: string = TODAY,
) {
  return toGlobeTrips(
    rows.map((id) => ({ id, title: id })),
    stops,
    today,
  );
}

const byIso = (summaries: ReturnType<typeof summariseCountries>, iso2: string) =>
  summaries.find((summary) => summary.iso2 === iso2);

describe('summariseCountries: one entry per visited country', () => {
  test('lists each country once, with its name, code and continent from the cache', () => {
    const globe = trips(
      ['a', 'b'],
      [
        stop('a', PARIS, '2024-06-01'),
        stop('a', LYON, '2024-06-03'),
        stop('b', PARIS, '2025-03-01'),
        stop('b', TOKYO, '2025-03-05'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(summaries.map((s) => s.iso2).sort()).toEqual(['FR', 'JP']);
    expect(byIso(summaries, 'FR')).toMatchObject({
      countryId: 33,
      name: 'France',
      continent: 'Europe',
    });
    expect(byIso(summaries, 'JP')).toMatchObject({ continent: 'Asia' });
  });

  test('a country nobody has been to is not listed', () => {
    const globe = trips(['a'], [stop('a', PARIS, '2024-06-01')]);
    expect(summariseCountries(globe, COUNTRIES, TODAY)).toHaveLength(1);
  });

  test('counts a trip once per country, however many of its stops are there', () => {
    const globe = trips(
      ['a', 'b', 'c'],
      [
        stop('a', PARIS, '2023-01-01'),
        stop('a', LYON, '2023-01-02'),
        stop('a', NICE, '2023-01-03'),
        stop('b', PARIS, '2024-01-01'),
        stop('c', ZURICH, '2025-01-01'),
        stop('c', PARIS, '2025-01-02'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'FR')?.tripCount).toBe(3);
    expect(byIso(summaries, 'CH')?.tripCount).toBe(1);
  });

  test('a stop whose city this device has not cached counts for nothing', () => {
    const globe = trips(
      ['a'],
      [stop('a', PARIS, '2024-06-01'), stop('a', UNCACHED, '2024-06-04')],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(summaries).toHaveLength(1);
    expect(byIso(summaries, 'FR')?.lastVisit).toBe('2024-06-01');
  });

  test('a country this device has no row for is left out of the list, not guessed at', () => {
    const globe = trips(
      ['a'],
      [stop('a', PARIS, '2024-06-01'), stop('a', ORPHAN, '2024-06-02')],
    );
    expect(summariseCountries(globe, COUNTRIES, TODAY).map((s) => s.iso2)).toEqual([
      'FR',
    ]);
  });
});

describe('first and last visit', () => {
  test('the earliest arrival and the latest departure that has happened, over every trip and stop', () => {
    const globe = trips(
      ['early', 'late'],
      [
        stop('late', PARIS, '2025-08-10', '2025-08-14'),
        stop('early', LYON, '2021-02-03', '2021-02-05'),
        stop('early', NICE, '2021-02-06', '2021-02-09'),
      ],
    );
    expect(byIso(summariseCountries(globe, COUNTRIES, TODAY), 'FR')).toMatchObject({
      firstVisit: '2021-02-03',
      lastVisit: '2025-08-14',
    });
  });

  test('the last visit is the last day that has happened, never one still to come', () => {
    const globe = trips(
      ['past', 'ahead', 'now'],
      [
        stop('past', LISBON, '2023-01-01', '2023-01-04'),
        stop('ahead', LISBON, '2027-05-01', '2027-05-04'),
        stop('now', PARIS, '2026-10-10', '2026-10-20'),
        stop('past', PARIS, '2024-02-01', '2024-02-03'),
        stop('ahead', TOKYO, '2027-02-01', '2027-02-09'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'PT')?.lastVisit).toBe('2023-01-04');
    expect(byIso(summaries, 'FR')?.lastVisit).toBe(TODAY);
    expect(byIso(summaries, 'JP')?.lastVisit).toBe('2027-02-09');
  });

  test('is a calendar date, not an instant', () => {
    const globe = trips(['a'], [stop('a', TOKYO, '2024-12-31', '2025-01-02')]);
    const japan = byIso(summariseCountries(globe, COUNTRIES, TODAY), 'JP');
    expect(japan?.firstVisit).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(japan?.lastVisit).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('a country with only trips still to come is marked planned, a visited one is not', () => {
    const globe = trips(
      ['past', 'ahead', 'both-past', 'both-ahead'],
      [
        stop('past', PARIS, '2024-01-01'),
        stop('ahead', TOKYO, '2027-02-01'),
        stop('both-past', LISBON, '2023-01-01'),
        stop('both-ahead', LISBON, '2027-05-01'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'FR')?.planned).toBe(false);
    expect(byIso(summaries, 'JP')?.planned).toBe(true);
    expect(byIso(summaries, 'PT')?.planned).toBe(false);
  });
});

describe('isNow: the active trip is there today', () => {
  test('the country of the stop that covers today, on an active trip', () => {
    const globe = trips(
      ['a'],
      [
        stop('a', PARIS, '2026-10-10', '2026-10-12'),
        stop('a', LISBON, '2026-10-12', '2026-10-18'),
        stop('a', ZURICH, '2026-10-19', '2026-10-20'),
      ],
    );
    expect(globe[0]?.status).toBe('active');
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'PT')?.isNow).toBe(true);
    expect(byIso(summaries, 'FR')?.isNow).toBe(false);
    expect(byIso(summaries, 'CH')?.isNow).toBe(false);
  });

  test('on a travel day the stop being reached wins, as on the globe', () => {
    const globe = trips(
      ['a'],
      [
        stop('a', PARIS, '2026-10-10', '2026-10-14'),
        stop('a', LISBON, '2026-10-14', '2026-10-18'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'PT')?.isNow).toBe(true);
    expect(byIso(summaries, 'FR')?.isNow).toBe(false);
  });

  test('a day between two stops names no country: the app does not guess where the traveller is', () => {
    const globe = trips(
      ['a'],
      [
        stop('a', PARIS, '2026-10-10', '2026-10-12'),
        stop('a', LISBON, '2026-10-16', '2026-10-18'),
      ],
    );
    expect(globe[0]?.status).toBe('active');
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(summaries.every((s) => !s.isNow)).toBe(true);
  });

  test('a past or a planned trip is never now', () => {
    const globe = trips(
      ['past', 'planned'],
      [
        stop('past', PARIS, '2026-09-01', '2026-09-05'),
        stop('planned', TOKYO, '2026-11-01', '2026-11-05'),
      ],
    );
    expect(summariseCountries(globe, COUNTRIES, TODAY).every((s) => !s.isNow)).toBe(true);
  });

  test('every active trip has its own current country', () => {
    const globe = trips(
      ['a', 'b'],
      [
        stop('a', PARIS, '2026-10-10', '2026-10-20'),
        stop('b', TOKYO, '2026-10-12', '2026-10-16'),
      ],
    );
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'FR')?.isNow).toBe(true);
    expect(byIso(summaries, 'JP')?.isNow).toBe(true);
  });

  test('a current stop in an uncached city is no country at all', () => {
    const globe = trips(
      ['a'],
      [stop('a', UNCACHED, '2026-10-10', '2026-10-20'), stop('a', PARIS, '2026-10-21')],
    );
    expect(summariseCountries(globe, COUNTRIES, TODAY).every((s) => !s.isNow)).toBe(true);
  });
});

describe('focus: where to fly the globe', () => {
  test('a country seen in one place centres on it and has no bounds', () => {
    const globe = trips(['a'], [stop('a', TOKYO, '2025-04-01')]);
    const { focus } = byIso(summariseCountries(globe, COUNTRIES, TODAY), 'JP')!;
    expect(focus.center).toEqual([139.6917, 35.6895]);
    expect(focus.bounds).toBeNull();
  });

  test('the same place twice is still one place', () => {
    const globe = trips(
      ['a', 'b'],
      [stop('a', TOKYO, '2025-04-01'), stop('b', TOKYO, '2026-04-01')],
    );
    expect(
      byIso(summariseCountries(globe, COUNTRIES, TODAY), 'JP')?.focus.bounds,
    ).toBeNull();
  });

  test('several places give the box that holds them and its middle', () => {
    const globe = trips(
      ['a'],
      [
        stop('a', PARIS, '2024-06-01'),
        stop('a', LYON, '2024-06-03'),
        stop('a', NICE, '2024-06-05'),
      ],
    );
    const { focus } = byIso(summariseCountries(globe, COUNTRIES, TODAY), 'FR')!;
    expect(focus.bounds).toEqual([
      [2.3522, 43.7102],
      [7.262, 48.8566],
    ]);
    expect(focus.center[0]).toBeCloseTo((2.3522 + 7.262) / 2, 6);
    expect(focus.center[1]).toBeCloseTo((43.7102 + 48.8566) / 2, 6);
  });

  test('a country that spans an ocean takes the box that holds its places, not the planet', () => {
    const globe = trips(
      ['a'],
      [stop('a', NEW_YORK, '2024-01-01'), stop('a', HONOLULU, '2024-01-09')],
    );
    const { focus } = byIso(summariseCountries(globe, COUNTRIES, TODAY), 'US')!;
    expect(focus.bounds).toEqual([
      [-157.8583, 21.3069],
      [-74.006, 40.7128],
    ]);
  });

  test('places either side of the date line give the short way round, never the whole globe', () => {
    const globe = trips(
      ['a'],
      [stop('a', SUVA, '2024-01-01'), stop('a', TAVEUNI, '2024-01-05')],
    );
    const { focus } = byIso(summariseCountries(globe, COUNTRIES, TODAY), 'FJ')!;
    const [[west], [east]] = focus.bounds!;
    expect(west).toBe(178.44);
    expect(east).toBeCloseTo(180.1, 6);
    expect(east - west).toBeLessThan(5);
    expect(focus.center[0]).toBeCloseTo(179.27, 2);
    expect(focus.center[0]).toBeLessThanOrEqual(180);
    expect(focus.center[1]).toBeCloseTo((-18.1416 + -16.85) / 2, 6);
  });
});

describe('continents', () => {
  const globe = trips(
    ['a'],
    [
      stop('a', PARIS, '2024-01-01'),
      stop('a', TOKYO, '2024-01-03'),
      stop('a', SYDNEY, '2024-01-05'),
      stop('a', ATLANTIS, '2024-01-07'),
      stop('a', PRISTINA, '2024-01-09'),
    ],
  );

  test('there are seven, written as the geography cache writes them', () => {
    expect(CONTINENTS).toEqual([
      'Africa',
      'Antarctica',
      'Asia',
      'Europe',
      'North America',
      'Oceania',
      'South America',
    ]);
    expect(WORLD_CONTINENTS).toBe(7);
    expect(WORLD_COUNTRIES).toBe(195);
  });

  test('a continent the app does not know is Unknown, and the country is still listed', () => {
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(byIso(summaries, 'XX')?.continent).toBe('Unknown');
    expect(byIso(summaries, 'XK')?.continent).toBe('Unknown');
    expect(summaries).toHaveLength(5);
  });

  test('Unknown is never counted as a continent', () => {
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    expect(continentsVisited(summaries)).toBe(3);
  });

  test('a continent is counted once, however many countries are in it', () => {
    const many = trips(
      ['a'],
      [
        stop('a', PARIS, '2024-01-01'),
        stop('a', ZURICH, '2024-01-02'),
        stop('a', LISBON, '2024-01-03'),
      ],
    );
    expect(continentsVisited(summariseCountries(many, COUNTRIES, TODAY))).toBe(1);
  });
});

describe('groupByContinent: continent name ascending, then country name', () => {
  test('orders the groups and the countries in them, Unknown last', () => {
    const globe = trips(
      ['a'],
      [
        stop('a', TOKYO, '2024-01-01'),
        stop('a', LISBON, '2024-01-02'),
        stop('a', PARIS, '2024-01-03'),
        stop('a', ZURICH, '2024-01-04'),
        stop('a', PRISTINA, '2024-01-05'),
        stop('a', SYDNEY, '2024-01-06'),
        stop('a', NEW_YORK, '2024-01-07'),
      ],
    );
    const groups = groupByContinent(summariseCountries(globe, COUNTRIES, TODAY));
    expect(groups.map((g) => g.continent)).toEqual([
      'Asia',
      'Europe',
      'North America',
      'Oceania',
      'Unknown',
    ]);
    expect(groups[1]?.countries.map((c) => c.name)).toEqual([
      'France',
      'Portugal',
      'Switzerland',
    ]);
  });

  test('has no empty group, and nothing for no countries', () => {
    expect(groupByContinent([])).toEqual([]);
  });
});

describe('worldTotals: the figures above the list', () => {
  const globe = trips(
    ['a', 'b', 'c'],
    [
      stop('a', PARIS, '2024-06-01'),
      stop('a', LYON, '2024-06-03'),
      stop('a', ZURICH, '2024-06-05'),
      stop('b', LISBON, '2025-01-01'),
      stop('b', UNCACHED, '2025-01-04'),
      stop('b', SINTRA, '2025-01-06'),
      stop('c', TOKYO, '2027-03-01'),
    ],
  );

  test('the countries figure is travelSummary\u2019s, planned trips included', () => {
    const summaries = summariseCountries(globe, COUNTRIES, TODAY);
    const totals = worldTotals(globe, summaries);
    expect(totals.countries).toBe(travelSummary(globe).countriesVisited);
    expect(totals.countries).toBe(4);
    expect(summaries).toHaveLength(totals.countries);
  });

  test('the distance is travelSummary\u2019s, to the last decimal', () => {
    const totals = worldTotals(globe, summariseCountries(globe, COUNTRIES, TODAY));
    expect(totals.distanceKm).toBe(travelSummary(globe).distanceKm);
    expect(totals.distanceKm).toBeGreaterThan(
      haversineKm(
        [PARIS.lng as number, PARIS.lat as number],
        [LYON.lng as number, LYON.lat as number],
      ),
    );
  });

  test('every trip counts, the fixed denominators are 195 and 7, and Unknown is no continent', () => {
    const totals = worldTotals(globe, summariseCountries(globe, COUNTRIES, TODAY));
    expect(totals).toMatchObject({
      trips: 3,
      countriesOf: 195,
      continentsOf: 7,
      continents: 2,
    });
  });

  test('the figure still counts a country this device has no name for, which the list cannot show', () => {
    const odd = trips(
      ['a'],
      [stop('a', PARIS, '2024-01-01'), stop('a', ORPHAN, '2024-01-02')],
    );
    const summaries = summariseCountries(odd, COUNTRIES, TODAY);
    expect(worldTotals(odd, summaries).countries).toBe(2);
    expect(summaries).toHaveLength(1);
  });

  test('with no trips every figure is zero', () => {
    const totals = worldTotals([], []);
    expect(totals).toMatchObject({
      countries: 0,
      trips: 0,
      distanceKm: 0,
      continents: 0,
    });
  });
});

describe('filterCountries: the search field', () => {
  const globe = trips(
    ['a'],
    [
      stop('a', PARIS, '2024-01-01'),
      stop('a', ZURICH, '2024-01-02'),
      stop('a', LISBON, '2024-01-03'),
      stop('a', SYDNEY, '2024-01-04'),
    ],
  );
  const summaries = summariseCountries(globe, COUNTRIES, TODAY);
  const names = (query: string) => filterCountries(summaries, query).map((s) => s.name);

  test('an empty or blank query keeps every country', () => {
    expect(names('')).toHaveLength(4);
    expect(names('   ')).toHaveLength(4);
  });

  test('matches inside the name, ignoring case', () => {
    expect(names('FRAN')).toEqual(['France']);
    expect(names('tral')).toEqual(['Australia']);
  });

  test('ignores accents on either side', () => {
    const accented = summariseCountries(
      trips(['a'], [stop('a', ZURICH, '2024-01-01')]),
      [
        {
          id: 41,
          iso_code: 'CH',
          name: 'Schweiz / Suisse / Svizzera / Zürcher',
          continent: 'Europe',
        },
      ],
      TODAY,
    );
    expect(filterCountries(accented, 'zurcher')).toHaveLength(1);
    expect(filterCountries(accented, 'ZÜRCHER')).toHaveLength(1);
  });

  test('a query nothing matches leaves nothing', () => {
    expect(names('zzz')).toEqual([]);
  });

  test('it does not change the list it was given', () => {
    const before = [...summaries];
    names('fra');
    expect(summaries).toEqual(before);
  });
});

describe('recentVisits: the countries of the newest stamps', () => {
  const globe = trips(
    ['a'],
    [
      stop('a', PARIS, '2021-02-03'),
      stop('a', TOKYO, '2024-05-01'),
      stop('a', LISBON, '2023-09-10'),
      stop('a', ZURICH, '2022-01-01'),
      stop('a', SYDNEY, '2027-03-01'),
    ],
  );
  const summaries = summariseCountries(globe, COUNTRIES, TODAY);

  test('are the countries first visited most recently, newest first', () => {
    expect(recentVisits(summaries, 2).map((s) => s.iso2)).toEqual(['JP', 'PT']);
    expect(recentVisits(summaries, 3).map((s) => s.iso2)).toEqual(['JP', 'PT', 'CH']);
  });

  test('never a country that is only planned: nothing has been stamped there yet', () => {
    expect(recentVisits(summaries, 10).map((s) => s.iso2)).not.toContain('AU');
  });

  test('is fewer when there are fewer, and none for none', () => {
    const visited = summaries.filter((summary) => !summary.planned);
    expect(recentVisits(visited.slice(0, 1), 5)).toHaveLength(1);
    expect(recentVisits([], 2)).toEqual([]);
  });

  test('breaks a tie by name, so the same two are chosen every time', () => {
    const tie = trips(
      ['a'],
      [stop('a', PARIS, '2024-05-01'), stop('a', ZURICH, '2024-05-01')],
    );
    expect(
      recentVisits(summariseCountries(tie, COUNTRIES, TODAY), 1).map((s) => s.iso2),
    ).toEqual(['FR']);
  });
});
