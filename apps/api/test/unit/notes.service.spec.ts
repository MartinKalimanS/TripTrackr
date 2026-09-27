import { HttpException, HttpStatus } from '@nestjs/common';
import {
  CreateNoteRequest,
  PatchNoteRequest,
  noteAnchored,
  type CreateNoteInput,
  type ListNotesQuery,
  type Trip,
} from '@triptrackr/contracts';

import type {
  NewNote,
  NotePatch,
  NoteRow,
  NotesRepository,
} from '@/modules/notes/notes.repository';
import { NotesService } from '@/modules/notes/notes.service';
import { tripNotFound, type TripsService } from '@/modules/trips/trips.service';

import { CITY, COUNTRY } from '../support/geography';

/**
 * Note decisions (rest-api.md §4; FR-017, FR-018, FR-019; tasks.md T079), against a
 * stubbed repository and owner view.
 *
 * test/integration/notes.spec.ts (T071) and notes-anchor.spec.ts (T072) prove the happy
 * paths and the anchor rule against PostgreSQL. Pinned here are the edges around them:
 *
 *   - a replayed create by client id is the same create (research D-15) and re-checks
 *     nothing; an id taken on another trip, or by a row the policy hides, is one
 *     identical 409 `NOTE_ID_UNAVAILABLE`;
 *   - FR-019 is evaluated on the pair of anchors the row will END UP with, with the
 *     wire's own predicate (`noteAnchored`), and each anchor present is checked to exist
 *     — unknown ones are `VALIDATION_FAILED` before any write (FR-072);
 *   - a move between levels keeps the body and the creation date (FR-018);
 *   - a note tombstoned between a patch's read and its write is the same
 *     `NOTE_NOT_FOUND` as one that never existed (contracts/README.md rule 1), and a
 *     stranger's trip is `TRIP_NOT_FOUND` before any note is looked at.
 */

const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TRIP_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_TRIP_ID = '44444444-4444-4444-8444-444444444444';
const NOTE_ID = '55555555-5555-4555-8555-555555555555';
const GENERATED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNKNOWN_COUNTRY = 999;
const UNKNOWN_CITY = 999_999;
const CREATED_AT = new Date('2026-06-02T08:00:00.000Z');
const UPDATED_AT = new Date('2026-06-03T09:30:00.000Z');

/** The caller's own trips; the owner view answers anything else with `TRIP_NOT_FOUND`. */
const OWN_TRIPS: ReadonlySet<string> = new Set([TRIP_ID, OTHER_TRIP_ID]);

function ownTrip(id: string): Trip {
  return {
    id,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    title: 'Swiss notes',
    home_currency: 'CHF',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    stops: [],
  };
}

/** A live country-level note, as the repository reads it. */
function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: NOTE_ID,
    tripId: TRIP_ID,
    countryId: COUNTRY.switzerland,
    cityId: null,
    title: null,
    body: 'Try the raclette in Valais.',
    isPublic: false,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** What `INSERT … RETURNING` hands back for an accepted row. */
function insertedRow(note: NewNote): NoteRow {
  return noteRow({
    id: note.id ?? GENERATED_ID,
    tripId: note.tripId,
    countryId: note.countryId,
    cityId: note.cityId,
    title: note.title,
    body: note.body,
    isPublic: note.isPublic,
  });
}

/** What `UPDATE … RETURNING` hands back: only the keys the patch sets change. */
function patchedRow(current: NoteRow, patch: NotePatch): NoteRow {
  return {
    ...current,
    ...(patch.countryId !== undefined && { countryId: patch.countryId }),
    ...(patch.cityId !== undefined && { cityId: patch.cityId }),
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.body !== undefined && { body: patch.body }),
    ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
    updatedAt: UPDATED_AT,
  };
}

interface World {
  /** Live notes the caller's policy lets them see. */
  readonly visible?: readonly NoteRow[];
  /** Ids held by notes the policy hides: another traveller's, or tombstoned. */
  readonly hiddenIds?: readonly string[];
  readonly knownCountries?: readonly number[];
  readonly knownCities?: readonly number[];
}

/**
 * The repository over a small world: policy-scoped reads, `ON CONFLICT DO NOTHING` inserts.
 * It stubs every method, so `satisfies` holds it to the real signatures — no cast needed.
 */
function stubRepository(world: World) {
  const live = new Map((world.visible ?? []).map((row) => [row.id, row]));
  const taken = new Set([...live.keys(), ...(world.hiddenIds ?? [])]);
  const countries = new Set(world.knownCountries ?? [COUNTRY.switzerland]);
  const cities = new Set(world.knownCities ?? [CITY.zurich]);

  return {
    listForTrip: jest.fn((tripId: string, _query: ListNotesQuery) =>
      Promise.resolve([...live.values()].filter((row) => row.tripId === tripId)),
    ),
    findLive: jest.fn((id: string) => Promise.resolve(live.get(id) ?? null)),
    insert: jest.fn((note: NewNote) =>
      Promise.resolve(
        note.id !== undefined && taken.has(note.id) ? null : insertedRow(note),
      ),
    ),
    update: jest.fn((id: string, patch: NotePatch) => {
      const current = live.get(id);
      return Promise.resolve(current ? patchedRow(current, patch) : null);
    }),
    tombstone: jest.fn((id: string) => Promise.resolve(live.delete(id))),
    countryExists: jest.fn((id: number) => Promise.resolve(countries.has(id))),
    cityExists: jest.fn((id: number) => Promise.resolve(cities.has(id))),
  } satisfies NotesRepository;
}

function harness(world: World = {}) {
  const repository = stubRepository(world);
  const trips = {
    loadOwned: jest.fn((tripId: string) =>
      OWN_TRIPS.has(tripId)
        ? Promise.resolve(ownTrip(tripId))
        : Promise.reject(tripNotFound()),
    ),
  };
  const service = new NotesService(repository, trips as unknown as TripsService);

  return { service, repository };
}

/** A create exactly as the validation pipe hands it over: parsed, defaults applied. */
function createRequest(input: Partial<CreateNoteInput> = {}): CreateNoteRequest {
  return CreateNoteRequest.parse({
    body: 'Lake swim at Seebad Utoquai.',
    country_id: COUNTRY.switzerland,
    ...input,
  });
}

function patchRequest(input: PatchNoteRequest): PatchNoteRequest {
  return PatchNoteRequest.parse(input);
}

/** The HttpException a call was refused with; a call that succeeds fails the test. */
async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;

  return { status: outcome.getStatus(), body: outcome.getResponse() };
}

/** The envelope the validation pipe answers with; an anchor check must read the same. */
function invalid(path: string, message: string) {
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message:
        'Some of the information provided is not valid. Please check it and try again.',
      details: { issues: [{ path, message }] },
    },
  };
}

describe('NotesService.create — a replayed create is the same create (research D-15)', () => {
  it('hands back the note already stored under the id on this trip, re-checking and inserting nothing', async () => {
    const { service, repository } = harness({ visible: [noteRow({ title: 'Cheese' })] });

    const replay = await service.create(
      TRIP_ID,
      createRequest({ id: NOTE_ID, body: 'Retyped on the retry.' }),
    );

    expect(replay).toEqual({
      id: NOTE_ID,
      created_at: '2026-06-02T08:00:00.000Z',
      updated_at: '2026-06-02T08:00:00.000Z',
      trip_id: TRIP_ID,
      country_id: COUNTRY.switzerland,
      city_id: null,
      title: 'Cheese',
      body: 'Try the raclette in Valais.',
      is_public: false,
    });
    expect(repository.countryExists).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses an id taken on another trip, or by a note the policy hides, with one identical 409', async () => {
    const elsewhere = harness({ visible: [noteRow({ tripId: OTHER_TRIP_ID })] });
    const hidden = harness({ hiddenIds: [NOTE_ID] });

    const onOtherTrip = await refusal(
      elsewhere.service.create(TRIP_ID, createRequest({ id: NOTE_ID })),
    );
    const heldByStranger = await refusal(
      hidden.service.create(TRIP_ID, createRequest({ id: NOTE_ID })),
    );

    expect(onOtherTrip).toEqual({
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'NOTE_ID_UNAVAILABLE',
          message: 'That note id is already in use. Please retry with a new id.',
        },
      },
    });
    expect(heldByStranger).toEqual(onOtherTrip);
  });
});

describe('NotesService.create — every anchor present must exist (FR-017, FR-072)', () => {
  it('refuses an unknown country as VALIDATION_FAILED on country_id, before inserting', async () => {
    const { service, repository } = harness({ knownCountries: [COUNTRY.switzerland] });

    const { status, body } = await refusal(
      service.create(TRIP_ID, createRequest({ country_id: UNKNOWN_COUNTRY })),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('country_id', 'Unknown country'));
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('refuses an unknown city as VALIDATION_FAILED on city_id, before inserting', async () => {
    const { service, repository } = harness({ knownCities: [CITY.zurich] });

    const { status, body } = await refusal(
      service.create(TRIP_ID, createRequest({ city_id: UNKNOWN_CITY })),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('city_id', 'Unknown city'));
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('files a city-only note without a country lookup — one anchor satisfies FR-019', async () => {
    const { service, repository } = harness();

    const note = await service.create(
      TRIP_ID,
      createRequest({ country_id: null, city_id: CITY.zurich }),
    );

    expect(note).toMatchObject({
      id: GENERATED_ID,
      country_id: null,
      city_id: CITY.zurich,
    });
    expect(repository.countryExists).not.toHaveBeenCalled();
  });

  it("refuses a note on a stranger's trip as TRIP_NOT_FOUND before any note is looked at", async () => {
    const { service, repository } = harness({ visible: [noteRow()] });

    const { status, body } = await refusal(
      service.create(STRANGER_TRIP_ID, createRequest({ id: NOTE_ID })),
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(repository.findLive).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('NotesService.patch — the pair the row ends up with (FR-018, FR-019)', () => {
  it('refuses clearing the only anchor with the wire predicate, and leaves the row untouched', async () => {
    const { service, repository } = harness({
      visible: [noteRow({ countryId: COUNTRY.switzerland, cityId: null })],
    });

    const { status, body } = await refusal(
      service.patch(NOTE_ID, patchRequest({ country_id: null })),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('country_id', noteAnchored.params.message));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows clearing the country while the city remains, sending only the cleared key', async () => {
    const { service, repository } = harness({
      visible: [noteRow({ countryId: COUNTRY.switzerland, cityId: CITY.zurich })],
    });

    const note = await service.patch(NOTE_ID, patchRequest({ country_id: null }));

    expect(note).toMatchObject({ country_id: null, city_id: CITY.zurich });
    expect(repository.update).toHaveBeenCalledWith(NOTE_ID, {
      countryId: null,
      cityId: undefined,
      title: undefined,
      body: undefined,
      isPublic: undefined,
    });
  });

  it('moves a country-level note into a known city, keeping its body and creation date', async () => {
    const { service } = harness({
      visible: [noteRow({ body: 'Written at country level.' })],
    });

    const moved = await service.patch(NOTE_ID, patchRequest({ city_id: CITY.zurich }));

    expect(moved).toMatchObject({
      id: NOTE_ID,
      country_id: COUNTRY.switzerland,
      city_id: CITY.zurich,
      body: 'Written at country level.',
      created_at: CREATED_AT.toISOString(),
      updated_at: UPDATED_AT.toISOString(),
    });
  });

  it('refuses a move to a country or a city that does not exist, before writing', async () => {
    const { service, repository } = harness({
      visible: [noteRow()],
      knownCountries: [COUNTRY.switzerland],
      knownCities: [CITY.zurich],
    });

    const country = await refusal(
      service.patch(NOTE_ID, patchRequest({ country_id: UNKNOWN_COUNTRY })),
    );
    const city = await refusal(
      service.patch(NOTE_ID, patchRequest({ city_id: UNKNOWN_CITY })),
    );

    expect(country.body).toEqual(invalid('country_id', 'Unknown country'));
    expect(city.body).toEqual(invalid('city_id', 'Unknown city'));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('answers one NOTE_NOT_FOUND for a hidden note and for a note tombstoned between read and write', async () => {
    // Arrange — someone else's note (or none); and one a parallel DELETE removes
    // after the read but before the UPDATE, which then matches nothing.
    const hidden = harness({ hiddenIds: [NOTE_ID] });
    const racing = harness({ visible: [noteRow()] });
    racing.repository.update.mockResolvedValueOnce(null);

    // Act
    const unseen = await refusal(
      hidden.service.patch(NOTE_ID, patchRequest({ body: 'hijack' })),
    );
    const vanished = await refusal(
      racing.service.patch(NOTE_ID, patchRequest({ body: 'too late' })),
    );

    // Assert
    expect(unseen).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: {
        error: {
          code: 'NOTE_NOT_FOUND',
          message: 'Note does not exist or you do not have access.',
        },
      },
    });
    expect(vanished).toEqual(unseen);
    expect(hidden.repository.update).not.toHaveBeenCalled();
  });
});

describe('NotesService.remove and list', () => {
  it('tombstones a visible note once; deleting it again is NOTE_NOT_FOUND (FR-039)', async () => {
    const { service } = harness({ visible: [noteRow()] });

    await expect(service.remove(NOTE_ID)).resolves.toBeUndefined();
    const again = await refusal(service.remove(NOTE_ID));

    expect(again.status).toBe(HttpStatus.NOT_FOUND);
    expect(again.body).toMatchObject({ error: { code: 'NOTE_NOT_FOUND' } });
  });

  it("lists nothing from a stranger's trip: TRIP_NOT_FOUND before any note is read", async () => {
    const { service, repository } = harness({
      visible: [noteRow({ tripId: STRANGER_TRIP_ID })],
    });

    const { status, body } = await refusal(service.list(STRANGER_TRIP_ID, {}));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(repository.listForTrip).not.toHaveBeenCalled();
  });
});
