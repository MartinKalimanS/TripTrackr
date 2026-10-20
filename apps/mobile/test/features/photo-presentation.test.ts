/**
 * How the gallery lays photos out and says what they are — tasks.md T117
 * (FR-041; feature 002 FR-010, FR-016, contract C13).
 *
 * Pure. The grid keeps a tile wide enough for its caption at the traveller's
 * text size (fewer columns as the text grows, never none); dates are the
 * device locale's, in the time zone of the city a photo is filed under when
 * this device knows it; and every photo has a label that says, in words,
 * where its bytes are.
 */
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { gridColumns, MAX_COLUMNS, toRows } from '@/features/photos/photo-grid';
import {
  filingMismatchLine,
  formatTakenAt,
  photoLabel,
  placeOf,
  takenAtLine,
} from '@/features/photos/photo-labels';

function photo(overrides: Partial<PhotoWithPlace> = {}): PhotoWithPlace {
  return {
    id: 'p',
    trip_id: 't',
    city_id: 100,
    taken_at: '2026-05-12T16:30:05.000Z',
    exif_lat: 41.9,
    exif_lng: 12.5,
    is_public: false,
    upload_state: 'uploaded',
    moderation_state: 'pending',
    has_thumbnail: false,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-06-01T10:00:00.000Z',
    local_file_uri: 'photos/t/p.jpg',
    city_name: 'Roma',
    country_name: 'Italy',
    city_lat: 41.9028,
    city_lng: 12.4964,
    city_timezone: 'Europe/Rome',
    ...overrides,
  };
}

describe('gridColumns (FR-016)', () => {
  test.each([
    ['a phone at the default text size', 342, 1, 3],
    ['a phone with larger text', 342, 1.5, 2],
    ['a phone with the largest text', 342, 2.4, 1],
    ['a small phone', 272, 1, 2],
    ['the widest column', 752, 1, MAX_COLUMNS],
    ['a width not measured yet', 0, 1, 1],
    ['a font scale the platform could not report', 342, Number.NaN, 3],
  ])('%s', (_label, width, fontScale, expected) => {
    expect(gridColumns(width, fontScale)).toBe(expected);
  });
});

describe('toRows', () => {
  test('cuts the photos into rows of the column count, the last one short', () => {
    expect(toRows(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
    expect(toRows([], 3)).toEqual([]);
  });
});

describe('dates', () => {
  test('in the time zone of the city the photo is filed under', () => {
    expect(formatTakenAt('2026-05-12T09:30:00.000Z', { timeZone: 'Asia/Tokyo' })).toMatch(
      /12 May 2026.*18:30/,
    );
    expect(
      formatTakenAt('2026-05-12T09:30:00.000Z', { timeZone: 'Europe/Rome' }),
    ).toMatch(/11:30/);
  });

  test('the day alone when the time is not wanted', () => {
    expect(
      formatTakenAt('2026-05-12T23:30:00.000Z', {
        timeZone: 'Asia/Tokyo',
        withTime: false,
      }),
    ).toBe('13 May 2026');
  });

  test('a zone the platform does not know falls back to the device’s own', () => {
    expect(() =>
      formatTakenAt('2026-05-12T09:30:00.000Z', { timeZone: 'Mars/Olympus_Mons' }),
    ).not.toThrow();
    expect(
      formatTakenAt('2026-05-12T09:30:00.000Z', { timeZone: 'Mars/Olympus_Mons' }),
    ).toBe(formatTakenAt('2026-05-12T09:30:00.000Z', {}));
  });

  test('the viewer’s line names whose clock the time is on', () => {
    expect(takenAtLine(photo({ taken_at: '2026-05-12T16:30:05.000Z' }))).toMatch(
      /^Taken 12 May 2026.*18:30 \(Roma time\)$/,
    );
    expect(
      takenAtLine(photo({ city_id: null, city_name: null, city_timezone: null })),
    ).toMatch(/^Taken 12 May 2026/);
    expect(takenAtLine(photo({ taken_at: null }))).toBe('Date taken unknown');
  });
});

describe('placeOf', () => {
  test('names the city, an uncached one by number, or none', () => {
    expect(placeOf(photo())).toBe('Roma, Italy');
    expect(placeOf(photo({ city_id: 777, city_name: null, country_name: null }))).toBe(
      'City #777',
    );
    expect(placeOf(photo({ city_id: null, city_name: null }))).toBeNull();
  });
});

describe('filingMismatchLine — a contradiction said, never corrected', () => {
  // Position of a photo taken near Rome, filed under Firenze (about 231 km away).
  const inFirenze = {
    city_id: 101,
    city_name: 'Firenze',
    city_lat: 43.7696,
    city_lng: 11.2558,
  };

  test('names the distance in the device locale and the city it is filed under', () => {
    expect(
      filingMismatchLine(photo({ ...inFirenze, exif_lat: 41.8986, exif_lng: 12.4769 })),
    ).toMatch(
      /^This photo was taken about 23\d km from Firenze, so it may be filed under the wrong city\./,
    );
    expect(
      filingMismatchLine(
        photo({ ...inFirenze, exif_lat: 41.8986, exif_lng: 12.4769 }),
        'de-DE',
      ),
    ).toMatch(/about 23\d km/);
    // Far enough to carry a thousands separator, which follows the locale.
    expect(
      filingMismatchLine(
        photo({ ...inFirenze, exif_lat: -33.87, exif_lng: 151.21 }),
        'en-GB',
      ),
    ).toMatch(/about 16,\d{3} km from Firenze/);
  });

  test('an uncached city is named by number', () => {
    expect(
      filingMismatchLine(
        photo({ ...inFirenze, city_name: null, exif_lat: 41.8986, exif_lng: 12.4769 }),
      ),
    ).toMatch(/km from City #101,/);
  });

  test('null when the photo agrees with its filing, has no position, or has no filing', () => {
    expect(filingMismatchLine(photo())).toBeNull();
    expect(filingMismatchLine(photo({ exif_lat: null, exif_lng: null }))).toBeNull();
    expect(
      filingMismatchLine(
        photo({ city_id: null, city_name: null, city_lat: null, city_lng: null }),
      ),
    ).toBeNull();
    expect(filingMismatchLine(photo({ city_lat: null, city_lng: null }))).toBeNull();
  });
});

describe('photoLabel — the state in words (FR-041, feature 002 FR-010)', () => {
  test('a pending photo says it is waiting to upload', () => {
    expect(photoLabel(photo({ upload_state: 'pending' }))).toBe(
      'Photo taken 12 May 2026, filed under Roma, Italy. Waiting to upload — saved on this device only.',
    );
  });

  test('a failed upload says so', () => {
    expect(photoLabel(photo({ upload_state: 'failed' }))).toBe(
      'Photo taken 12 May 2026, filed under Roma, Italy. Upload failed.',
    );
  });

  test('an uploaded photo with nothing known about it is still described', () => {
    expect(
      photoLabel(
        photo({ taken_at: null, city_id: null, city_name: null, country_name: null }),
      ),
    ).toBe('Photo, date taken unknown, not filed under a city.');
  });
});
