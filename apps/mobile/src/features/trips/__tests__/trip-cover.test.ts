/**
 * Trip cover — tasks.md T429 (FR-011, FR-012; data-model.md §4; research D4-09).
 *
 * The rule is pure: it is handed the trip, the local photo rows that could be a
 * cover and the derived status, and answers with a thumbnail path on the device
 * or the typographic fallback. First match wins: (1) the designated photo of
 * THIS trip with a usable thumbnail; (2) the trip's earliest usable photo;
 * (3) the title's initial tinted by status. Nothing here reads or writes the
 * store, the network or the file system.
 *
 * Precondition: candidates arrive in `coverCandidatesQuery` order, so the first
 * usable one of a trip is its earliest. The rule does not sort; the ordering
 * itself (taken_at with undated last, created_at, id) is pinned against real
 * SQLite in test/db/photo-cover-candidates.test.ts.
 */
import type { CoverCandidate } from '@/db/repositories/photos';
import { resolveTripCover, typographicCover } from '@/features/trips/trip-cover';

// `thumbnailUri` joins the documents directory as a string; the module needs
// `expo-file-system` and Sentry to import, neither is used by the rule.
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TRIP = uuid(1);
const OTHER_TRIP = uuid(2);
const DOCUMENTS = 'file:///data/app/documents';

function candidate(n: number, overrides: Partial<CoverCandidate> = {}): CoverCandidate {
  const trip_id = overrides.trip_id ?? TRIP;
  return {
    id: uuid(100 + n),
    trip_id,
    taken_at: null,
    created_at: '2026-06-01T10:00:00.000Z',
    local_file_uri: `photos/${trip_id}/${uuid(100 + n)}.jpg`,
    ...overrides,
  };
}

const thumbnailOf = (photo: CoverCandidate) =>
  `${DOCUMENTS}/photos/${photo.trip_id}/${photo.id}.thumb.jpg`;

function trip(overrides: Partial<{ title: string; cover_photo_id: string | null }> = {}) {
  return { id: TRIP, title: 'Italy, spring 2026', cover_photo_id: null, ...overrides };
}

describe('resolveTripCover — designated photo', () => {
  test('uses the designated photo even when an earlier one exists', () => {
    const earlier = candidate(1, { taken_at: '2026-05-01T08:00:00.000Z' });
    const designated = candidate(2, { taken_at: '2026-05-20T08:00:00.000Z' });

    const cover = resolveTripCover(
      trip({ cover_photo_id: designated.id }),
      [earlier, designated],
      'past',
    );

    expect(cover).toEqual({
      kind: 'photo',
      photoId: designated.id,
      thumbnailUri: thumbnailOf(designated),
    });
  });

  test('ignores a designated photo that belongs to another trip, whatever the id says', () => {
    const foreign = candidate(1, {
      trip_id: OTHER_TRIP,
      taken_at: '2026-01-01T00:00:00.000Z',
    });
    const own = candidate(2, { taken_at: '2026-05-20T08:00:00.000Z' });

    const cover = resolveTripCover(
      trip({ cover_photo_id: foreign.id }),
      [foreign, own],
      'planning',
    );

    expect(cover).toEqual({
      kind: 'photo',
      photoId: own.id,
      thumbnailUri: thumbnailOf(own),
    });
  });

  test('never returns another trip’s photo: only that photo exists, so the cover is typographic', () => {
    const foreign = candidate(1, { trip_id: OTHER_TRIP });

    expect(
      resolveTripCover(trip({ cover_photo_id: foreign.id }), [foreign], 'planning'),
    ).toEqual({ kind: 'typographic', initial: 'I', status: 'planning' });
  });

  test('falls to the first usable photo when the designated one has no usable thumbnail', () => {
    const earliest = candidate(2, { taken_at: '2026-05-02T08:00:00.000Z' });
    const unusable = candidate(1, {
      taken_at: '2026-05-03T08:00:00.000Z',
      local_file_uri: 'not/a/photo/path.jpg',
    });
    const later = candidate(3, { taken_at: '2026-05-09T08:00:00.000Z' });

    const cover = resolveTripCover(
      trip({ cover_photo_id: unusable.id }),
      [earliest, unusable, later],
      'active',
    );

    expect(cover).toMatchObject({ kind: 'photo', photoId: earliest.id });
  });

  test('falls through when the designated photo is the first candidate and is unusable', () => {
    const unusable = candidate(1, { local_file_uri: null });
    const next = candidate(2, { taken_at: '2026-05-09T08:00:00.000Z' });

    expect(
      resolveTripCover(trip({ cover_photo_id: unusable.id }), [unusable, next], 'past'),
    ).toMatchObject({ photoId: next.id });
  });

  test('uses an undated designated photo even when dated photos come before it', () => {
    const dated = candidate(1, { taken_at: '2026-05-01T08:00:00.000Z' });
    const undatedDesignated = candidate(2, { taken_at: null });

    const cover = resolveTripCover(
      trip({ cover_photo_id: undatedDesignated.id }),
      [dated, undatedDesignated],
      'past',
    );

    expect(cover).toEqual({
      kind: 'photo',
      photoId: undatedDesignated.id,
      thumbnailUri: thumbnailOf(undatedDesignated),
    });
  });

  test('falls to the earliest photo when the designated id names no candidate (deleted or unknown)', () => {
    const only = candidate(1);

    expect(
      resolveTripCover(trip({ cover_photo_id: uuid(999) }), [only], 'past'),
    ).toMatchObject({ kind: 'photo', photoId: only.id });
  });
});

// The earliest-photo rule does not sort: `coverCandidatesQuery` already returns
// each trip's photos earliest-taken first (dated before undated, then earliest
// added, then id — pinned by test/db/photo-cover-candidates.test.ts), so the
// first usable candidate IS the earliest. These inputs are in that order.
describe('resolveTripCover — first usable photo in query order', () => {
  test('is the first candidate of the trip', () => {
    const earliest = candidate(1, { taken_at: '2026-05-02T08:00:00.000Z' });
    const middle = candidate(2, { taken_at: '2026-05-05T08:00:00.000Z' });
    const latest = candidate(3, { taken_at: '2026-05-09T08:00:00.000Z' });

    expect(resolveTripCover(trip(), [earliest, middle, latest], 'past')).toEqual({
      kind: 'photo',
      photoId: earliest.id,
      thumbnailUri: thumbnailOf(earliest),
    });
  });

  test('trusts the order it is handed instead of sorting again (precondition: query order)', () => {
    const first = candidate(1, { taken_at: '2026-05-09T08:00:00.000Z' });
    const second = candidate(2, { taken_at: '2026-05-02T08:00:00.000Z' });

    expect(resolveTripCover(trip(), [first, second], 'past')).toMatchObject({
      photoId: first.id,
    });
  });

  test('an undated photo is the cover when the query put it first', () => {
    const undated = candidate(1);
    const dated = candidate(2, { taken_at: '2026-05-09T08:00:00.000Z' });

    expect(resolveTripCover(trip(), [undated, dated], 'past')).toMatchObject({
      photoId: undated.id,
    });
  });

  test('skips candidates without a usable thumbnail, even the first', () => {
    const noFile = candidate(1, { local_file_uri: null });
    const notAPhoto = candidate(2, { local_file_uri: 'elsewhere/x.jpg' });
    const usable = candidate(3, { taken_at: '2026-05-08T08:00:00.000Z' });
    const later = candidate(4, { taken_at: '2026-05-09T08:00:00.000Z' });

    expect(
      resolveTripCover(trip(), [noFile, notAPhoto, usable, later], 'past'),
    ).toMatchObject({ photoId: usable.id });
  });

  test('looks only at this trip’s photos when handed every trip’s candidates', () => {
    const foreign = candidate(1, {
      trip_id: OTHER_TRIP,
      taken_at: '2020-01-01T00:00:00.000Z',
    });
    const own = candidate(2, { taken_at: '2026-05-08T08:00:00.000Z' });

    expect(resolveTripCover(trip(), [foreign, own], 'past')).toMatchObject({
      photoId: own.id,
    });
    expect(resolveTripCover(trip(), [own, foreign], 'past')).toMatchObject({
      photoId: own.id,
    });
  });

  test('does not reorder or change the rows it is given', () => {
    const rows = [
      candidate(1, { taken_at: '2026-05-09T08:00:00.000Z' }),
      candidate(2, { taken_at: '2026-05-02T08:00:00.000Z' }),
    ];
    const snapshot = JSON.stringify(rows);

    resolveTripCover(trip(), rows, 'past');

    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe('resolveTripCover — typographic', () => {
  test('with no candidates the cover is the title’s initial and the derived status', () => {
    expect(resolveTripCover(trip(), [], 'active')).toEqual({
      kind: 'typographic',
      initial: 'I',
      status: 'active',
    });
  });

  test('with only unusable candidates the cover is typographic', () => {
    const rows = [
      candidate(1, { local_file_uri: null }),
      candidate(2, { local_file_uri: 'elsewhere/x.jpg' }),
    ];

    expect(resolveTripCover(trip(), rows, 'planning')).toEqual({
      kind: 'typographic',
      initial: 'I',
      status: 'planning',
    });
  });
});

describe('typographicCover', () => {
  const cover = (title: string) => typographicCover({ title }, 'past');

  test('is the first letter, uppercased', () => {
    expect(cover('italy')).toEqual({ kind: 'typographic', initial: 'I', status: 'past' });
  });

  test('ignores leading whitespace', () => {
    expect(cover('   \n Lisboa')).toMatchObject({ initial: 'L' });
  });

  test('is Unicode-aware: accents and non-Latin scripts', () => {
    expect(cover('ísland')).toMatchObject({ initial: 'Í' });
    expect(cover('ñandú')).toMatchObject({ initial: 'Ñ' });
    expect(cover('東京')).toMatchObject({ initial: '東' });
    expect(cover('θάλασσα')).toMatchObject({ initial: 'Θ' });
  });

  test('keeps an astral code point whole instead of half a surrogate pair', () => {
    expect(cover('🌍 World tour')).toMatchObject({ initial: '🌍' });
    expect(cover('𝒜lpha')).toMatchObject({ initial: '𝒜' });
  });

  test('is one code point even where uppercasing would expand it', () => {
    expect(Array.from((cover('ßeach') as { initial: string }).initial)).toHaveLength(1);
  });

  test('is “?” for an empty or blank title', () => {
    expect(cover('')).toMatchObject({ initial: '?' });
    expect(cover('  \t ')).toMatchObject({ initial: '?' });
  });

  test('carries the status it is given', () => {
    expect(typographicCover({ title: 'Peru' }, 'planning')).toMatchObject({
      status: 'planning',
    });
    expect(typographicCover({ title: 'Peru' }, 'active')).toMatchObject({
      status: 'active',
    });
  });
});
