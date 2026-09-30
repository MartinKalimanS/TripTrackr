/**
 * The EXIF reader — tasks.md T116 (FR-029; research D-34; Constitution IV).
 *
 * Pure and table-tested: the shapes both platforms' pickers hand back
 * (expo-image-picker 57), plus the garbage real files carry. What these pin:
 *
 *   - time: `DateTimeOriginal` + `OffsetTimeOriginal` is exact; without an
 *     offset the GPS UTC stamp settles the zone when it agrees with the clock
 *     to the minute; otherwise the device's zone reads the wall clock (the
 *     documented rule in exif.ts). Anything that is not a real date is null.
 *   - position: the reference letter decides the sign, whatever sign the value
 *     already carries (Android pre-signs, iOS does not); iOS's `{GPS}`
 *     sub-dictionary and its flattened `GPS…` keys both read; a missing or
 *     unknown reference, a value out of range, or the (0, 0) placeholder is
 *     null — never a guess.
 */
import { deviceZoneOffset, readExif, type WallClock } from '@/features/photos/exif';

/** A fixed zone for the rule-3 fallback, so no row depends on the machine's TZ. */
const plusOne = () => 60;

describe('readExif — time taken', () => {
  test.each([
    [
      'an offset east of UTC',
      '2026:05:12 18:30:05',
      '+02:00',
      '2026-05-12T16:30:05.000Z',
    ],
    [
      'an offset west of UTC',
      '2026:05:12 18:30:05',
      '-04:00',
      '2026-05-12T22:30:05.000Z',
    ],
    [
      'a quarter-hour offset (Nepal)',
      '2026:05:12 18:30:00',
      '+05:45',
      '2026-05-12T12:45:00.000Z',
    ],
    [
      'an offset written without a colon',
      '2026:05:12 18:30:05',
      '+0200',
      '2026-05-12T16:30:05.000Z',
    ],
    ['UTC itself', '2026:05:12 18:30:05', '+00:00', '2026-05-12T18:30:05.000Z'],
    [
      'a clock that crosses midnight',
      '2026:05:13 01:10:00',
      '+03:00',
      '2026-05-12T22:10:00.000Z',
    ],
    [
      'dashes instead of colons in the date',
      '2026-05-12 18:30:05',
      '+02:00',
      '2026-05-12T16:30:05.000Z',
    ],
  ])('DateTimeOriginal with %s is exact', (_label, original, offset, expected) => {
    const reading = readExif(
      { DateTimeOriginal: original, OffsetTimeOriginal: offset },
      plusOne,
    );
    expect(reading.takenAt).toBe(expected);
  });

  test.each([
    [
      'in step with the clock',
      '2026:05:12 18:30:05',
      '2026:05:12',
      '16:29:58',
      '2026-05-12T16:30:05.000Z',
    ],
    [
      'with fractional seconds (iOS)',
      '2026:05:12 18:30:05',
      '2026:05:12',
      '16:30:01.00',
      '2026-05-12T16:30:05.000Z',
    ],
    [
      'a day behind across midnight',
      '2026:05:13 01:10:00',
      '2026:05:12',
      '23:10:00',
      '2026-05-12T23:10:00.000Z',
    ],
    [
      'west of UTC',
      '2026:05:12 08:00:00',
      '2026:05:12',
      '12:00:30',
      '2026-05-12T12:00:00.000Z',
    ],
  ])(
    'without an offset, the GPS UTC stamp %s settles the zone',
    (_label, original, gpsDate, gpsTime, expected) => {
      const reading = readExif(
        { DateTimeOriginal: original, GPSDateStamp: gpsDate, GPSTimeStamp: gpsTime },
        plusOne,
      );
      expect(reading.takenAt).toBe(expected);
    },
  );

  test('the GPS stamp inside iOS’s {GPS} sub-dictionary counts too', () => {
    const reading = readExif(
      {
        DateTimeOriginal: '2026:05:12 18:30:05',
        '{GPS}': { DateStamp: '2026:05:12', TimeStamp: '16:30:05' },
      },
      plusOne,
    );
    expect(reading.takenAt).toBe('2026-05-12T16:30:05.000Z');
  });

  test.each([
    [
      'a stale fix, off the quarter-hour grid',
      '2026:05:12 18:30:00',
      '2026:05:12',
      '15:50:00',
    ],
    ['an offset no zone has', '2026:05:12 18:30:00', '2026:05:11', '22:30:00'],
    ['an unreadable stamp', '2026:05:12 18:30:00', '2026:05:12', 'noon'],
    ['a date with no time', '2026:05:12 18:30:00', '2026:05:12', undefined],
  ])(
    'without an offset, %s falls back to the device’s zone',
    (_label, original, gpsDate, gpsTime) => {
      const reading = readExif(
        { DateTimeOriginal: original, GPSDateStamp: gpsDate, GPSTimeStamp: gpsTime },
        plusOne,
      );
      expect(reading.takenAt).toBe('2026-05-12T17:30:00.000Z');
    },
  );

  test('a garbage offset is treated as no offset, never as a zone', () => {
    const reading = readExif(
      { DateTimeOriginal: '2026:05:12 18:30:05', OffsetTimeOriginal: '   :  ' },
      plusOne,
    );
    expect(reading.takenAt).toBe('2026-05-12T17:30:05.000Z');
  });

  test.each(['+15:00', '+02:75', 'CET', 'Z+1'])(
    'an impossible offset %s is ignored',
    (offset) => {
      const reading = readExif(
        { DateTimeOriginal: '2026:05:12 18:30:05', OffsetTimeOriginal: offset },
        plusOne,
      );
      expect(reading.takenAt).toBe('2026-05-12T17:30:05.000Z');
    },
  );

  test('the device-zone rule is handed the wall clock as written', () => {
    const zone = jest.fn((_wall: WallClock) => 0);
    readExif({ DateTimeOriginal: '2026:05:12 18:30:05' }, zone);
    expect(zone).toHaveBeenCalledWith({
      year: 2026,
      month: 5,
      day: 12,
      hour: 18,
      minute: 30,
      second: 5,
    });
  });

  test('by default the wall clock is read in this device’s own time zone', () => {
    const reading = readExif({ DateTimeOriginal: '2026:05:12 18:30:05' });
    expect(reading.takenAt).toBe(new Date(2026, 4, 12, 18, 30, 5).toISOString());
    expect(
      deviceZoneOffset({ year: 2026, month: 1, day: 15, hour: 12, minute: 0, second: 0 }),
    ).toBe(-new Date(2026, 0, 15, 12, 0, 0).getTimezoneOffset());
  });

  test.each([
    ['the all-zero “unknown” placeholder', '0000:00:00 00:00:00'],
    ['a thirteenth month', '2026:13:01 10:00:00'],
    ['the thirtieth of February', '2026:02:30 10:00:00'],
    ['hour 24', '2026:05:12 24:00:00'],
    ['minute 60', '2026:05:12 10:60:00'],
    ['second 60', '2026:05:12 10:00:60'],
    ['a year before photography could be dated', '1850:01:01 00:00:00'],
    ['words', 'yesterday afternoon'],
    ['an empty string', ''],
    ['a number', 20260512],
    ['null', null],
  ])('%s is no time at all', (_label, original) => {
    const reading = readExif({
      DateTimeOriginal: original,
      OffsetTimeOriginal: '+02:00',
    });
    expect(reading.takenAt).toBeNull();
  });

  test('DateTimeDigitized alone is not taken for the capture time (a scan’s date is not a photo’s)', () => {
    const reading = readExif({
      DateTimeDigitized: '2026:05:12 18:30:05',
      DateTime: '2026:05:12 18:30:05',
    });
    expect(reading.takenAt).toBeNull();
  });
});

describe('readExif — where it was taken', () => {
  test.each([
    [
      'iOS flattened keys, unsigned with references',
      {
        GPSLatitude: 41.9,
        GPSLatitudeRef: 'N',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
      41.9,
      12.5,
    ],
    [
      'iOS’s {GPS} sub-dictionary, south',
      {
        '{GPS}': {
          Latitude: 33.8688,
          LatitudeRef: 'S',
          Longitude: 151.2093,
          LongitudeRef: 'E',
        },
      },
      -33.8688,
      151.2093,
    ],
    [
      'Android’s pre-signed values — the sign is not applied twice',
      {
        GPSLatitude: -33.45,
        GPSLatitudeRef: 'S',
        GPSLongitude: -70.67,
        GPSLongitudeRef: 'W',
      },
      -33.45,
      -70.67,
    ],
    [
      'west of Greenwich, unsigned',
      {
        GPSLatitude: 40.7128,
        GPSLatitudeRef: 'N',
        GPSLongitude: 74.006,
        GPSLongitudeRef: 'W',
      },
      40.7128,
      -74.006,
    ],
    [
      'rational degrees-minutes-seconds strings',
      {
        GPSLatitude: '51/1,30/1,2640/100',
        GPSLatitudeRef: 'N',
        GPSLongitude: '0/1,7/1,3960/100',
        GPSLongitudeRef: 'W',
      },
      51 + 30 / 60 + 26.4 / 3600,
      -(7 / 60 + 39.6 / 3600),
    ],
    [
      'degrees-minutes-seconds arrays',
      {
        GPSLatitude: [48, 51, 29.6],
        GPSLatitudeRef: 'N',
        GPSLongitude: [2, 17, 40.2],
        GPSLongitudeRef: 'E',
      },
      48 + 51 / 60 + 29.6 / 3600,
      2 + 17 / 60 + 40.2 / 3600,
    ],
    [
      'decimal strings and untidy references',
      {
        GPSLatitude: ' 41.9 ',
        GPSLatitudeRef: 'n\u0000',
        GPSLongitude: '12.5',
        GPSLongitudeRef: ' e ',
      },
      41.9,
      12.5,
    ],
    [
      'the equator, which is a real place',
      { GPSLatitude: 0, GPSLatitudeRef: 'S', GPSLongitude: 32.58, GPSLongitudeRef: 'E' },
      0,
      32.58,
    ],
  ])('%s', (_label, exif, lat, lng) => {
    const reading = readExif(exif, plusOne);
    expect(reading.lat).toBeCloseTo(lat, 9);
    expect(reading.lng).toBeCloseTo(lng, 9);
    expect(Object.is(reading.lat, -0)).toBe(false);
  });

  test.each([
    [
      'no reference letters (Android’s 0.0 placeholder)',
      { GPSLatitude: 0, GPSLongitude: 0 },
    ],
    [
      'a missing longitude reference',
      { GPSLatitude: 41.9, GPSLatitudeRef: 'N', GPSLongitude: 12.5 },
    ],
    [
      'an unknown reference letter',
      {
        GPSLatitude: 41.9,
        GPSLatitudeRef: 'X',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
    ],
    [
      'a latitude beyond the pole',
      { GPSLatitude: 91, GPSLatitudeRef: 'N', GPSLongitude: 12.5, GPSLongitudeRef: 'E' },
    ],
    [
      'a longitude beyond the date line',
      { GPSLatitude: 41.9, GPSLatitudeRef: 'N', GPSLongitude: 181, GPSLongitudeRef: 'E' },
    ],
    [
      'the (0, 0) placeholder of a redacted or unfixed position',
      { GPSLatitude: 0, GPSLatitudeRef: 'N', GPSLongitude: 0, GPSLongitudeRef: 'E' },
    ],
    ['only a latitude', { GPSLatitude: 41.9, GPSLatitudeRef: 'N' }],
    [
      'sixty minutes',
      {
        GPSLatitude: '41/1,60/1,0/1',
        GPSLatitudeRef: 'N',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
    ],
    [
      'a division by zero',
      {
        GPSLatitude: '41/0',
        GPSLatitudeRef: 'N',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
    ],
    [
      'not a number',
      {
        GPSLatitude: Number.NaN,
        GPSLatitudeRef: 'N',
        GPSLongitude: Number.POSITIVE_INFINITY,
        GPSLongitudeRef: 'E',
      },
    ],
    [
      'words',
      {
        GPSLatitude: 'north-ish',
        GPSLatitudeRef: 'N',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
    ],
    [
      'a negative minute',
      {
        GPSLatitude: [41, -5, 0],
        GPSLatitudeRef: 'N',
        GPSLongitude: 12.5,
        GPSLongitudeRef: 'E',
      },
    ],
  ])('%s is no position, never a guess', (_label, exif) => {
    const reading = readExif(exif, plusOne);
    expect(reading.lat).toBeNull();
    expect(reading.lng).toBeNull();
  });
});

describe('readExif — no metadata at all', () => {
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'Exif'],
    ['an array', []],
    ['an empty object', {}],
  ])('%s reads as nothing', (_label, exif) => {
    expect(readExif(exif, plusOne)).toEqual({ takenAt: null, lat: null, lng: null });
  });

  test('time and position are read independently', () => {
    expect(
      readExif(
        {
          DateTimeOriginal: '2026:05:12 18:30:05',
          OffsetTimeOriginal: '+02:00',
          GPSLatitude: 41.9,
        },
        plusOne,
      ),
    ).toEqual({ takenAt: '2026-05-12T16:30:05.000Z', lat: null, lng: null });
  });
});
