/**
 * T544 - what the trip's five areas say about themselves (spec FR-039, FR-043; research
 * D5-17): how many photos, notes, expenses and documents, the exact spending total, how many
 * photos failed to upload, a picture of each city the traveller has one of, and the trip's
 * cover. A pure function of rows the screens already read, plus a hook that composes the
 * existing live reads of each area. Private, local, never transmitted, nothing stored; it
 * reads the signed-in traveller's own rows only and shows no other person's content.
 */
import { renderHook } from '@testing-library/react-native';

import {
  summariseTripOverview,
  useTripOverview,
  type OverviewInput,
} from '@/features/trips/trip-overview';

jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///data/app/documents/' } },
  File: class {},
  Directory: class {},
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockLive = (data: unknown[]) => ({ data, loading: false, error: null });
const mockReads = {
  photos: mockLive([]),
  notes: mockLive([]),
  documents: mockLive([]),
  expenses: mockLive([]),
};
jest.mock('@/features/photos/use-photos', () => ({ usePhotos: () => mockReads.photos }));
jest.mock('@/features/notes/use-notes', () => ({ useNotes: () => mockReads.notes }));
jest.mock('@/features/documents/use-documents', () => ({
  useDocuments: () => mockReads.documents,
}));
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => mockReads.expenses,
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TRIP_ID = uuid(1);
const TRIP = { id: TRIP_ID, title: 'Portugal Road Trip', cover_photo_id: null };
const DOCS = 'file:///data/app/documents';
const thumb = (n: number) => `${DOCS}/photos/${TRIP_ID}/${uuid(100 + n)}.thumb.jpg`;

type Photo = OverviewInput['photos'][number];
function photo(n: number, overrides: Partial<Photo> = {}): Photo {
  return {
    id: uuid(100 + n),
    trip_id: TRIP_ID,
    city_id: null,
    taken_at: `2026-10-1${n}T10:00:00.000Z`,
    created_at: '2026-10-20T10:00:00.000Z',
    upload_state: 'uploaded',
    local_file_uri: `photos/${TRIP_ID}/${uuid(100 + n)}.jpg`,
    ...overrides,
  };
}

function input(overrides: Partial<OverviewInput> = {}): OverviewInput {
  return {
    trip: TRIP,
    status: 'active',
    photos: [],
    notes: [],
    documents: [],
    expenses: [],
    ...overrides,
  };
}

describe('summariseTripOverview: the counts', () => {
  test('counts each area, and zero for an empty one (the tiles show zeros with no stops)', () => {
    expect(summariseTripOverview(input()).counts).toEqual({
      photos: 0,
      notes: 0,
      expenses: 0,
      documents: 0,
    });
    const overview = summariseTripOverview(
      input({
        photos: [photo(1), photo(2)],
        notes: [{}, {}, {}],
        documents: [{}],
        expenses: [
          { amount_home: '5.50', fx_pending: false },
          { amount_home: null, fx_pending: true },
        ],
      }),
    );
    expect(overview.counts).toEqual({ photos: 2, notes: 3, expenses: 2, documents: 1 });
  });

  test('counts the photos that failed to upload, and only those', () => {
    const overview = summariseTripOverview(
      input({
        photos: [
          photo(1),
          photo(2, { upload_state: 'failed' }),
          photo(3, { upload_state: 'pending' }),
          photo(4, { upload_state: 'failed' }),
        ],
      }),
    );
    expect(overview.failedPhotos).toBe(2);
  });
});

describe('summariseTripOverview: the spending total is exact (SC-016)', () => {
  const row = (amount_home: string | null, fx_pending = false) => ({
    amount_home,
    fx_pending,
  });

  test('is a decimal string, two places, and "0.00" with nothing logged', () => {
    expect(summariseTripOverview(input()).spendingTotal).toBe('0.00');
  });

  test('adds in decimal, so 0.10 + 0.20 is 0.30 and not a float', () => {
    const overview = summariseTripOverview(
      input({ expenses: [row('0.10'), row('0.20'), row('841.70')] }),
    );
    expect(overview.spendingTotal).toBe('842.00');
    expect(
      summariseTripOverview(input({ expenses: [row('0.10'), row('0.20')] }))
        .spendingTotal,
    ).toBe('0.30');
  });

  test('leaves out what is not converted yet, as the spending screen does, but still counts it', () => {
    const overview = summariseTripOverview(
      input({ expenses: [row('10.00'), row(null, true), row('99.00', true)] }),
    );
    expect(overview.spendingTotal).toBe('10.00');
    expect(overview.counts.expenses).toBe(3);
  });

  test('never reaches for Number: a sum Number would round is still exact', () => {
    const overview = summariseTripOverview(
      input({ expenses: [row('9007199254740.99'), row('0.01')] }),
    );
    expect(overview.spendingTotal).toBe('9007199254741.00');
  });
});

describe('summariseTripOverview: a picture of each city', () => {
  test('is the thumbnail of the earliest photo filed under that city', () => {
    const overview = summariseTripOverview(
      input({
        photos: [
          photo(3, { city_id: 7 }),
          photo(1, { city_id: 7 }),
          photo(2, { city_id: 8 }),
        ],
      }),
    );
    expect(overview.cityThumbs.get(7)).toBe(thumb(1));
    expect(overview.cityThumbs.get(8)).toBe(thumb(2));
  });

  test('has none for a city with no photograph, for photographs filed under no city, or with no file', () => {
    const overview = summariseTripOverview(
      input({
        photos: [
          photo(1, { city_id: null }),
          photo(2, { city_id: 9, local_file_uri: null }),
        ],
      }),
    );
    expect(overview.cityThumbs.size).toBe(0);
  });

  test('an undated photograph comes after every dated one', () => {
    const overview = summariseTripOverview(
      input({
        photos: [
          photo(1, { city_id: 7, taken_at: null }),
          photo(2, { city_id: 7, taken_at: '2026-10-12T10:00:00.000Z' }),
        ],
      }),
    );
    expect(overview.cityThumbs.get(7)).toBe(thumb(2));
  });
});

describe('summariseTripOverview: the cover follows the 004 rule', () => {
  test('is the earliest photograph on the device, whatever order the rows come in', () => {
    const overview = summariseTripOverview(
      input({ photos: [photo(3), photo(1), photo(2)] }),
    );
    expect(overview.cover).toEqual({
      kind: 'photo',
      photoId: uuid(101),
      thumbnailUri: thumb(1),
    });
  });

  test('is the designated photograph when the trip names one', () => {
    const overview = summariseTripOverview(
      input({
        trip: { ...TRIP, cover_photo_id: uuid(103) },
        photos: [photo(1), photo(3)],
      }),
    );
    expect(overview.cover).toMatchObject({ kind: 'photo', photoId: uuid(103) });
  });

  test('is the typographic cover with no usable photograph', () => {
    expect(summariseTripOverview(input()).cover).toEqual({
      kind: 'typographic',
      initial: 'P',
      status: 'active',
    });
  });

  test('does not change the rows it was given', () => {
    const photos = [photo(3), photo(1)];
    summariseTripOverview(input({ photos }));
    expect(photos.map((p) => p.id)).toEqual([uuid(103), uuid(101)]);
  });
});

describe('useTripOverview: composes the existing live reads of each area', () => {
  beforeEach(() => {
    mockReads.photos = mockLive([photo(1, { city_id: 7 })]);
    mockReads.notes = mockLive([{}, {}]);
    mockReads.documents = mockLive([{}]);
    mockReads.expenses = mockLive([{ amount_home: '12.50', fx_pending: false }]);
  });

  test('answers the same overview, and says it is loaded', async () => {
    const { result } = await renderHook(() => useTripOverview(TRIP, 'planning'));
    expect(result.current.counts).toEqual({
      photos: 1,
      notes: 2,
      expenses: 1,
      documents: 1,
    });
    expect(result.current.spendingTotal).toBe('12.50');
    expect(result.current.cityThumbs.get(7)).toContain('.thumb.jpg');
    expect(result.current.loading).toBe(false);
  });

  test('is loading while any area has not answered, and keeps what it has', async () => {
    mockReads.notes = { data: [], loading: true, error: null };
    const { result } = await renderHook(() => useTripOverview(TRIP, 'planning'));
    expect(result.current.loading).toBe(true);
    expect(result.current.counts.photos).toBe(1);
  });

  test('returns the same object while nothing it reads has changed', async () => {
    const { result, rerender } = await renderHook(() =>
      useTripOverview(TRIP, 'planning'),
    );
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
