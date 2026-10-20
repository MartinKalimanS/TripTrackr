import { captureFromExif, isWireInstant } from '@/modules/photos/capture';

/**
 * Capture time and position read from a photo's own EXIF — the media worker's
 * fallback when registration carried none (FR-029; research D-34; tasks.md
 * T113).
 *
 * EXIF is untrusted input and Constitution IV forbids presenting a guess as
 * fact, so the rules pinned here are all refusals of a guess:
 *
 *   - `DateTimeOriginal` is a wall clock with no zone. It names an instant only
 *     with `OffsetTimeOriginal`; failing that, the GPS date and time (UTC by the
 *     EXIF specification) do; failing both, no time is recorded.
 *   - A date the calendar does not have (31 February) or that the wire format
 *     cannot carry (a UTC year past 9999) is no date.
 *   - A position is a pair inside the coordinate ranges, and exactly 0,0 — what
 *     a camera writes when it has no fix — is no position.
 */
describe('captureFromExif — time', () => {
  it('reads the wall clock with its offset as one instant in UTC', () => {
    expect(
      captureFromExif({
        DateTimeOriginal: '2026:06:03 14:30:00',
        OffsetTimeOriginal: '+02:00',
      }),
    ).toEqual({ takenAt: '2026-06-03T12:30:00.000Z', lat: null, lng: null });

    expect(
      captureFromExif({
        DateTimeOriginal: '2026:06:03 21:15:09',
        OffsetTimeOriginal: '-05:30',
      })?.takenAt,
    ).toBe('2026-06-04T02:45:09.000Z');
  });

  it('does not guess a zone for a wall clock that has none', () => {
    expect(captureFromExif({ DateTimeOriginal: '2026:06:03 14:30:00' })).toBeNull();
  });

  it('falls back to the GPS date and time, which EXIF defines as UTC', () => {
    expect(
      captureFromExif({
        DateTimeOriginal: '2026:06:03 14:30:00',
        GPSDateStamp: '2026:06:03',
        GPSTimeStamp: [12, 30, 15.5],
      })?.takenAt,
    ).toBe('2026-06-03T12:30:15.000Z');
  });

  it('prefers the offset clock to the GPS clock when both are there', () => {
    expect(
      captureFromExif({
        DateTimeOriginal: '2026:06:03 14:30:00',
        OffsetTimeOriginal: '+02:00',
        GPSDateStamp: '2026:06:03',
        GPSTimeStamp: [12, 29, 58],
      })?.takenAt,
    ).toBe('2026-06-03T12:30:00.000Z');
  });

  it.each([
    ['31 February', '2026:02:31 10:00:00', '+00:00'],
    ['month 13', '2026:13:01 10:00:00', '+00:00'],
    ['an unset camera clock', '0000:00:00 00:00:00', '+00:00'],
    ['hour 24', '2026:06:03 24:00:00', '+00:00'],
    ['a malformed clock', '2026-06-03T14:30:00', '+02:00'],
    ['an impossible offset', '2026:06:03 14:30:00', '+25:00'],
    ['a UTC year past 9999', '9999:12:31 23:59:59', '-12:00'],
  ])('records no time for %s', (_label, local, offset) => {
    expect(
      captureFromExif({ DateTimeOriginal: local, OffsetTimeOriginal: offset }),
    ).toBeNull();
  });

  it('records no GPS time for a malformed GPS stamp', () => {
    expect(
      captureFromExif({ GPSDateStamp: '2026:06:03', GPSTimeStamp: [25, 0, 0] }),
    ).toBeNull();
    expect(
      captureFromExif({ GPSDateStamp: 'yesterday', GPSTimeStamp: [12, 0, 0] }),
    ).toBeNull();
  });
});

describe('captureFromExif — position', () => {
  it('records a position as the pair of coordinates', () => {
    expect(captureFromExif({ latitude: 48.8583, longitude: 2.3522 })).toEqual({
      takenAt: null,
      lat: 48.8583,
      lng: 2.3522,
    });
  });

  it('records the time and the position together', () => {
    expect(
      captureFromExif({
        DateTimeOriginal: '2026:06:03 14:30:00',
        OffsetTimeOriginal: '+02:00',
        latitude: -33.8583,
        longitude: -70.3522,
      }),
    ).toEqual({ takenAt: '2026-06-03T12:30:00.000Z', lat: -33.8583, lng: -70.3522 });
  });

  it.each([
    ['0,0 — a camera with no fix', { latitude: 0, longitude: 0 }],
    ['half a pair', { latitude: 48.8583 }],
    ['a latitude past the pole', { latitude: 91, longitude: 2 }],
    ['a longitude past the antimeridian', { latitude: 48, longitude: 181 }],
    ['a number that is not one', { latitude: Number.NaN, longitude: 2 }],
  ])('records no position for %s', (_label, tags) => {
    expect(captureFromExif(tags)).toBeNull();
  });
});

describe('captureFromExif — what it is handed', () => {
  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'EXIF'],
    ['an empty block', {}],
  ])('answers null for %s', (_label, tags) => {
    expect(captureFromExif(tags)).toBeNull();
  });

  it('ignores a tag of the wrong type and keeps the rest', () => {
    expect(
      captureFromExif({
        DateTimeOriginal: 20260603,
        OffsetTimeOriginal: '+02:00',
        latitude: 47.3769,
        longitude: 8.5417,
      }),
    ).toEqual({ takenAt: null, lat: 47.3769, lng: 8.5417 });
  });
});

describe('isWireInstant', () => {
  it('admits every instant the contract’s ISO format can carry, and nothing else', () => {
    expect(isWireInstant(new Date('2026-06-03T12:30:00Z'))).toBe(true);
    expect(isWireInstant(new Date('9999-12-31T23:59:59Z'))).toBe(true);
    expect(isWireInstant(new Date('0000-01-01T00:00:00Z'))).toBe(true);
    expect(isWireInstant(new Date('9999-12-31T23:59:59-12:00'))).toBe(false);
    expect(isWireInstant(new Date('0000-01-01T00:00:00+01:00'))).toBe(false);
    expect(isWireInstant(new Date('not a date'))).toBe(false);
  });
});
