/**
 * T556 - the passport's figures (feature 005; FR-058, FR-084; data-model section 5; research
 * D5-17; owner question Q-2): what the card says for All time or for one year. A trip belongs
 * to the year of its FIRST arrival; the countries figure and the distance are `travelSummary`'s
 * statistic over those trips, untouched; continents are distinct and never count `Unknown`;
 * the lap is the real distance over the sphere the distance was measured on. Nothing is stored.
 */
import { toGlobeTrips, type GlobeStopRow } from '@/features/globe/globe-data';
import { EARTH_RADIUS_KM } from '@/features/globe/great-circle';
import { travelSummary } from '@/features/globe/travel-stats';

import { summariseCountries, type CountryInfo } from '../country-summary';
import {
  LAP_KM,
  lapFraction,
  passportTotals,
  periodKeys,
  tripFirstArrival,
  tripsInPeriod,
} from '../passport-totals';

const TODAY = '2026-10-14';

const COUNTRIES: CountryInfo[] = [
  { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' },
  { id: 81, iso_code: 'JP', name: 'Japan', continent: 'Asia' },
  { id: 1, iso_code: 'US', name: 'United States', continent: 'North America' },
  { id: 901, iso_code: 'XK', name: 'Kosovo', continent: 'Unknown' },
];

type City = Pick<GlobeStopRow, 'city_id' | 'country_id' | 'lng' | 'lat'>;
const LISBON: City = { city_id: 5, country_id: 351, lng: -9.1393, lat: 38.7223 };
const PORTO: City = { city_id: 6, country_id: 351, lng: -8.611, lat: 41.1496 };
const TOKYO: City = { city_id: 7, country_id: 81, lng: 139.6917, lat: 35.6895 };
const NEW_YORK: City = { city_id: 8, country_id: 1, lng: -74.006, lat: 40.7128 };
const PRISTINA: City = { city_id: 13, country_id: 901, lng: 21.1655, lat: 42.6629 };
const UNCACHED: City = { city_id: 99, country_id: null, lng: null, lat: null };

let n = 0;
function stop(tripId: string, city: City, arrive: string, depart = arrive): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: depart,
    ...city,
  };
}

// 2025: Lisbon -> Porto (one trip). 2026: Tokyo, then New York. Planned 2027: Pristina.
// "bare" has no stop at all.
const STOPS = [
  stop('t25', LISBON, '2025-05-01', '2025-05-03'),
  stop('t25', PORTO, '2025-05-03', '2025-05-05'),
  stop('t26a', TOKYO, '2026-03-03', '2026-03-10'),
  stop('t26b', NEW_YORK, '2026-10-01', '2026-10-05'),
  stop('t26b', UNCACHED, '2026-10-05', '2026-10-06'),
  stop('t27', PRISTINA, '2027-02-01', '2027-02-04'),
];
const TRIPS = toGlobeTrips(
  ['t25', 't26a', 't26b', 't27', 'bare'].map((id) => ({ id, title: id })),
  STOPS,
  TODAY,
);
const SUMMARIES = summariseCountries(TRIPS, COUNTRIES, TODAY);
const byId = (id: string) => TRIPS.find((trip) => trip.id === id)!;

describe('periods', () => {
  test('a trip belongs to the year of its first arrival; a trip with no stop to none', () => {
    expect(tripFirstArrival(byId('t25'))).toBe('2025-05-01');
    expect(tripFirstArrival(byId('t26b'))).toBe('2026-10-01');
    expect(tripFirstArrival(byId('bare'))).toBeNull();
  });

  test('the years offered are those with at least one trip, newest first, planned years too', () => {
    expect(periodKeys(TRIPS)).toEqual(['all', '2027', '2026', '2025']);
    expect(periodKeys([])).toEqual(['all']);
  });

  test('a year keeps its trips; All time keeps every trip, even one with no stop', () => {
    expect(tripsInPeriod(TRIPS, '2026').map((t) => t.id)).toEqual(['t26a', 't26b']);
    expect(tripsInPeriod(TRIPS, '2024')).toEqual([]);
    expect(tripsInPeriod(TRIPS, 'all')).toHaveLength(5);
  });
});

describe('passportTotals', () => {
  test("All time: the app's own statistic, fixed denominators, every trip counted", () => {
    const totals = passportTotals(TRIPS, SUMMARIES, 'all');
    const stat = travelSummary(TRIPS);
    expect(totals.countries).toBe(stat.countriesVisited);
    expect(totals.distanceKm).toBe(stat.distanceKm);
    expect(totals.countriesOf).toBe(195);
    expect(totals.continentsOf).toBe(7);
    expect(totals.trips).toBe(5);
    expect(totals.period).toBe('all');
  });

  test('continents are distinct and never count Unknown', () => {
    // Europe, Asia, North America; Kosovo is Unknown.
    expect(passportTotals(TRIPS, SUMMARIES, 'all').continents).toBe(3);
  });

  test("a year is the statistic over that year's trips only", () => {
    const totals = passportTotals(TRIPS, SUMMARIES, '2026');
    const stat = travelSummary(tripsInPeriod(TRIPS, '2026'));
    expect(totals.countries).toBe(2);
    expect(totals.countries).toBe(stat.countriesVisited);
    expect(totals.distanceKm).toBe(stat.distanceKm);
    expect(totals.trips).toBe(2);
    expect(totals.continents).toBe(2);
  });

  test('a year with one country on one continent', () => {
    const totals = passportTotals(TRIPS, SUMMARIES, '2025');
    expect(totals).toMatchObject({ countries: 1, trips: 1, continents: 1 });
    expect(totals.distanceKm).toBeGreaterThan(200);
    expect(totals.distanceKm).toBeLessThan(400);
  });

  test('a year of Unknown only has no continent', () => {
    expect(passportTotals(TRIPS, SUMMARIES, '2027').continents).toBe(0);
  });

  test('nothing recorded: zeros, and no lap line to claim', () => {
    const totals = passportTotals([], [], 'all');
    expect(totals).toMatchObject({
      countries: 0,
      trips: 0,
      distanceKm: 0,
      continents: 0,
    });
    expect(totals.laps).toBe(0);
  });
});

describe('the lap', () => {
  test('is measured on the sphere the distance is measured on', () => {
    expect(LAP_KM).toBeCloseTo(2 * Math.PI * EARTH_RADIUS_KM, 6);
  });

  test('is distance over one lap, never invented', () => {
    expect(lapFraction(0)).toBe(0);
    expect(lapFraction(LAP_KM)).toBe(1);
    expect(lapFraction(LAP_KM * 1.5)).toBeCloseTo(1.5, 10);
    expect(lapFraction(-5)).toBe(0);
    expect(lapFraction(Number.NaN)).toBe(0);
  });

  test("the card carries the real distance's lap", () => {
    const totals = passportTotals(TRIPS, SUMMARIES, 'all');
    expect(totals.laps).toBeCloseTo(totals.distanceKm / LAP_KM, 12);
  });
});
