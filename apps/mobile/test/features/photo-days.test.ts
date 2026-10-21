/**
 * Photographs grouped by day (T549; FR-045; UI-SPEC 9.2): the calendar day in the filed
 * city's zone, newest day first, the undated last, the place a day is named for, the words.
 */
import type { PhotoWithPlace } from '@/db/repositories/photos';
import {
  UNDATED_KEY,
  dayKeyOf,
  dominantPlace,
  groupByDay,
  photoCount,
} from '@/features/photos/photo-days';

function photo(id: string, overrides: Partial<PhotoWithPlace> = {}): PhotoWithPlace {
  return {
    id,
    trip_id: 't',
    city_id: 1,
    taken_at: '2026-10-14T12:00:00.000Z',
    exif_lat: null,
    exif_lng: null,
    is_public: false,
    upload_state: 'uploaded',
    moderation_state: 'pending',
    has_thumbnail: false,
    created_at: '2026-10-14T12:00:00.000Z',
    updated_at: '2026-10-14T12:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
    local_file_uri: `photos/t/${id}.jpg`,
    city_name: 'Sintra',
    country_name: 'Portugal',
    city_lat: null,
    city_lng: null,
    city_timezone: 'Europe/Lisbon',
    ...overrides,
  };
}

describe('photoCount: no Intl.PluralRules on Hermes', () => {
  test.each([
    [0, '0 photos'],
    [1, '1 photo'],
    [2, '2 photos'],
    [14, '14 photos'],
  ])('%i', (count, words) => expect(photoCount(count)).toBe(words));
});

describe('dayKeyOf: the local calendar day', () => {
  test('is the day in the filed city’s zone, not UTC', () => {
    // 23:30 on the 14th in Lisbon (UTC+1 in October is Europe/Lisbon WEST: 22:30Z) ...
    expect(
      dayKeyOf({ taken_at: '2026-10-14T22:30:00.000Z', city_timezone: 'Asia/Tokyo' }),
    ).toBe('2026-10-15');
    expect(
      dayKeyOf({ taken_at: '2026-10-14T22:30:00.000Z', city_timezone: 'Europe/Lisbon' }),
    ).toBe('2026-10-14');
  });

  test('a city with no cached zone uses the device zone', () => {
    const noon = '2026-10-14T12:00:00.000Z';
    expect(dayKeyOf({ taken_at: noon, city_timezone: null })).toBe('2026-10-14');
  });

  test('a zone the platform does not know falls back instead of throwing', () => {
    expect(
      dayKeyOf({ taken_at: '2026-10-14T12:00:00.000Z', city_timezone: 'Mars/Olympus' }),
    ).toBe('2026-10-14');
  });

  test('no date, or a date that does not parse, is undated', () => {
    expect(dayKeyOf({ taken_at: null, city_timezone: null })).toBe(UNDATED_KEY);
    expect(dayKeyOf({ taken_at: 'not a date', city_timezone: null })).toBe(UNDATED_KEY);
  });
});

describe('dominantPlace', () => {
  test('the city most photographs are filed under', () => {
    const photos = [
      photo('a', { city_name: 'Lisboa' }),
      photo('b', { city_name: 'Sintra' }),
      photo('c', { city_name: 'Sintra' }),
    ];
    expect(dominantPlace(photos)).toBe('Sintra');
  });

  test('the first on a tie; none when no photograph has a cached city', () => {
    expect(
      dominantPlace([
        photo('a', { city_name: 'Lisboa' }),
        photo('b', { city_name: 'Sintra' }),
      ]),
    ).toBe('Lisboa');
    expect(dominantPlace([photo('a', { city_name: null, city_id: null })])).toBeNull();
    expect(dominantPlace([])).toBeNull();
  });
});

describe('groupByDay', () => {
  const lisbon13 = photo('l1', {
    taken_at: '2026-10-13T10:00:00.000Z',
    city_name: 'Lisboa',
  });
  const sintraA = photo('s1', { taken_at: '2026-10-14T15:00:00.000Z' });
  const sintraB = photo('s2', { taken_at: '2026-10-14T09:00:00.000Z' });
  const undated = photo('u1', { taken_at: null, city_id: null, city_name: null });

  test('groups by day, newest day first, keeping the order within a day', () => {
    const days = groupByDay([lisbon13, sintraA, sintraB], 'en-GB');
    expect(days.map((day) => day.key)).toEqual(['2026-10-14', '2026-10-13']);
    expect(days[0].photos.map((p) => p.id)).toEqual(['s1', 's2']);
    expect(days[0].count).toBe(2);
  });

  test('the photographs with no date are ONE group, last', () => {
    const days = groupByDay([undated, sintraA, undated], 'en-GB');
    expect(days.map((day) => day.key)).toEqual(['2026-10-14', UNDATED_KEY]);
    expect(days[1].count).toBe(2);
    expect(days[1].numeral).toBeNull();
    expect(days[1].meta).toBe('2 photos');
    expect(days[1].label).toBe('Date unknown, 2 photos');
  });

  test('says the numeral, the place, the meta line and the spoken section', () => {
    const [day] = groupByDay([sintraA, sintraB], 'en-GB');
    expect(day.numeral).toBe('14');
    expect(day.place).toBe('Sintra');
    expect(day.meta).toBe('Wed · Oct · 2 photos');
    expect(day.label).toMatch(/^Wednesday,? 14 October 2026, Sintra$/);
  });

  test('a day with no known place omits it from the spoken section', () => {
    const [day] = groupByDay([photo('x', { city_id: null, city_name: null })], 'en-GB');
    expect(day.place).toBeNull();
    expect(day.label).toMatch(/^Wednesday,? 14 October 2026$/);
    expect(day.meta).toBe('Wed · Oct · 1 photo');
  });

  test('a day number below ten has no leading zero', () => {
    const [day] = groupByDay(
      [photo('x', { taken_at: '2026-10-05T12:00:00.000Z' })],
      'en-GB',
    );
    expect(day.numeral).toBe('5');
  });

  test('no photographs, no days', () => {
    expect(groupByDay([], 'en-GB')).toEqual([]);
  });
});
