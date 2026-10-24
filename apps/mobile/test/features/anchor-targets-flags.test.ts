/**
 * The anchor chips' flags (F9, T551): a target carries its country's ISO code when the stop
 * has one cached, and no key at all when it has not (so a target built by hand stays equal).
 */
import type { StopWithPlace } from '@/db/repositories/stops';
import { anchorTargets } from '@/features/notes/use-move-note';

const stop = (overrides: Partial<StopWithPlace>): StopWithPlace =>
  ({
    id: 's',
    trip_id: 't',
    city_id: 100,
    sort_order: 0,
    arrive_date: null,
    depart_date: null,
    city_name: 'Sintra',
    country_id: 1,
    country_name: 'Portugal',
    country_iso: 'PT',
    lat: null,
    lng: null,
    ...overrides,
  }) as StopWithPlace;

describe('anchorTargets: the flag code', () => {
  test('the country and its cities carry the iso code of the country', () => {
    const targets = anchorTargets([
      stop({}),
      stop({ id: 's2', city_id: 101, city_name: 'Lisboa' }),
    ]);
    expect(targets.map((target) => [target.key, target.iso2])).toEqual([
      ['country:1', 'PT'],
      ['city:100', 'PT'],
      ['city:101', 'PT'],
    ]);
  });

  test('a country with no cached code has no iso2 key at all', () => {
    const [country, city] = anchorTargets([stop({ country_iso: null })]);
    expect(country).not.toHaveProperty('iso2');
    expect(city).not.toHaveProperty('iso2');
  });

  test('two countries each carry their own', () => {
    const targets = anchorTargets([
      stop({}),
      stop({
        id: 's2',
        city_id: 200,
        city_name: 'Madrid',
        country_id: 2,
        country_name: 'Spain',
        country_iso: 'ES',
      }),
    ]);
    expect(targets.filter((t) => t.level === 'country').map((t) => t.iso2)).toEqual([
      'PT',
      'ES',
    ]);
  });
});
