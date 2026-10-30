import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentsResponse, type DocumentParsedFields } from '@triptrackr/contracts';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { PASS_FIELDS, uploadDocument } from '../support/documents';
import { FX, createTripFor, seedFxRates } from '../support/expenses';
import { CITY } from '../support/geography';
import { createHarness, type Harness } from '../integration/harness';
import {
  categoryRecord,
  documentRecord,
  expenseRecord,
  insertPhotoRow,
  minutesAgo,
  noteRecord,
  photoRecord,
  push,
  pushOne,
  requireRow,
  rowOf,
  stopRecord,
  tripRecord,
  updatedAtOf,
} from '../support/sync-push-fixtures';

/**
 * The rules the REST services enforce hold on the push path too — through the
 * same code, not a copy (tasks.md T128; FR-013, FR-019, FR-022, FR-027, FR-032,
 * FR-035, FR-041, FR-056; research D-08, D-10, D-33; Constitution I, V).
 *
 * A device that was offline has already made these decisions locally; the
 * server still decides them again, because the wire is not a trusted place to
 * have made them. Each block names the rule and where the REST path states it.
 */
describe('contract — the REST rules hold when a record arrives by push', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    await seedFxRates(harness.owner);
    a = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'Rules fixture');
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  const stored = (table: Parameters<typeof requireRow>[1], id: unknown) =>
    requireRow(harness.owner, table, id as string);
  const asA = () => bearer(a.tokens.access_token);

  describe('trips: status is derived, never set by the device (FR-013)', () => {
    it('stores a new trip as planning and lets its stops derive the status without moving updated_at', async () => {
      const trip = tripRecord({ updated_at: minutesAgo(60) });
      await push(app, a, 'trips', [trip]);
      expect((await stored('trips', trip.id)).status).toBe('planning');

      // A stop whose dates are long past makes the trip 'past'.
      await push(app, a, 'trip_stops', [
        stopRecord(trip.id as string, {
          arrive_date: '2020-01-01',
          depart_date: '2020-01-09',
        }),
      ]);

      const row = await stored('trips', trip.id);
      expect(row.status).toBe('past');
      // A cache refresh is not a change a device must pull (and not one that
      // could make the device's own next edit look stale).
      expect(updatedAtOf(row)).toBe(trip.updated_at);
    });

    it('takes the owner from the session, whatever else the record says', async () => {
      const trip = tripRecord();
      await push(app, a, 'trips', [trip]);

      expect((await stored('trips', trip.id)).owner_id).toBe(a.tokens.user.id);
    });

    it('stores the title trimmed and the literal characters of a hostile one', async () => {
      const hostile = "Robert'); DROP TABLE trips;--";
      const trip = tripRecord({ title: `  ${hostile}  ` });

      await push(app, a, 'trips', [trip]);

      expect((await stored('trips', trip.id)).title).toBe(hostile);
    });

    it('accepts a change of home currency and leaves recorded expenses as they were (FR-022)', async () => {
      const trip = tripRecord({ home_currency: 'CHF', updated_at: minutesAgo(60) });
      await push(app, a, 'trips', [trip]);
      const expense = expenseRecord(trip.id as string, {
        amount: '10.00',
        currency: 'EUR',
        fx_rate_to_home: '0.888889',
        amount_home: '8.89',
      });
      await push(app, a, 'expenses', [expense]);

      await push(app, a, 'trips', [
        { ...trip, home_currency: 'USD', updated_at: minutesAgo(30) },
      ]);

      expect((await stored('trips', trip.id)).home_currency).toBe('USD');
      expect(await stored('expenses', expense.id)).toMatchObject({
        fx_rate_to_home: '0.888889',
        amount_home: '8.89',
      });
    });
  });

  describe('stops: dates in order, positions as the device sent them (FR-010..FR-012)', () => {
    it('keeps the position the device chose, duplicates and gaps included', async () => {
      const first = stopRecord(tripId, { sort_order: 0 });
      const second = stopRecord(tripId, { sort_order: 0, city_id: CITY.paris });
      const third = stopRecord(tripId, { sort_order: 9, city_id: CITY.zurich });

      await push(app, a, 'trip_stops', [first, second, third]);

      expect((await stored('trip_stops', first.id)).sort_order).toBe(0);
      expect((await stored('trip_stops', second.id)).sort_order).toBe(0);
      expect((await stored('trip_stops', third.id)).sort_order).toBe(9);
      // Reads tolerate it: the owner's trip still loads, stops in a stable order.
      const response = await request(app.getHttpServer())
        .get(`/v1/trips/${tripId}`)
        .set(asA());
      expect(response.status).toBe(200);
    });

    it('accepts a stop whose departure equals its arrival', async () => {
      const result = await pushOne(
        app,
        a,
        'trip_stops',
        stopRecord(tripId, { arrive_date: '2026-10-01', depart_date: '2026-10-01' }),
      );

      expect(result).toMatchObject({ status: 'applied' });
    });

    it('changes the city of an existing stop when the device edited it', async () => {
      const stop = stopRecord(tripId, { updated_at: minutesAgo(60) });
      await push(app, a, 'trip_stops', [stop]);

      await push(app, a, 'trip_stops', [
        { ...stop, city_id: CITY.paris, updated_at: minutesAgo(30) },
      ]);

      expect((await stored('trip_stops', stop.id)).city_id).toBe(CITY.paris);
    });
  });

  describe('notes: independent visibility, and the anchor (FR-017..FR-019, FR-053)', () => {
    it('stores a public note on a private trip as sent: the trip stays the outer envelope', async () => {
      const note = noteRecord(tripId, { is_public: true });

      await push(app, a, 'notes', [note]);

      expect(await stored('notes', note.id)).toMatchObject({ is_public: true });
      const trip = await stored('trips', tripId);
      expect(trip.is_public).toBe(false);
    });

    it('moves a note between levels without losing the body or the creation date (FR-018)', async () => {
      const note = noteRecord(tripId, {
        body: 'Keep this',
        city_id: null,
        updated_at: minutesAgo(60),
      });
      await push(app, a, 'notes', [note]);
      const created = (await stored('notes', note.id)).created_at;

      await push(app, a, 'notes', [
        { ...note, city_id: CITY.tokyo, updated_at: minutesAgo(30) },
      ]);

      const row = await stored('notes', note.id);
      expect(row).toMatchObject({ body: 'Keep this', city_id: CITY.tokyo });
      expect(row.created_at).toEqual(created);
    });

    it('does not move a note to another trip', async () => {
      const other = await createTripFor(app, a, 'CHF', 'Other trip');
      const note = noteRecord(tripId, { updated_at: minutesAgo(60) });
      await push(app, a, 'notes', [note]);

      await push(app, a, 'notes', [
        { ...note, trip_id: other, body: 'Edited', updated_at: minutesAgo(30) },
      ]);

      expect(await stored('notes', note.id)).toMatchObject({
        trip_id: tripId,
        body: 'Edited',
      });
    });
  });

  describe('expenses: the conversion is frozen at entry and an edit never recomputes it (FR-021, FR-022; D-10)', () => {
    it('stores a client conversion as sent', async () => {
      const expense = expenseRecord(tripId, {
        amount: '10.00',
        currency: 'EUR',
        fx_rate_to_home: '0.900000',
        amount_home: '9.00',
      });

      await push(app, a, 'expenses', [expense]);

      expect(await stored('expenses', expense.id)).toMatchObject({
        fx_rate_to_home: '0.900000',
        amount_home: '9.00',
        fx_pending: false,
      });
    });

    it('converts from the latest snapshot when the device sent no conversion', async () => {
      const expense = expenseRecord(tripId, { amount: '10.00', currency: 'EUR' });

      await push(app, a, 'expenses', [expense]);

      // EUR → CHF through the seeded USD legs: 0.80 / 0.90 (support/expenses.ts).
      expect(FX.usd.CHF).toBe('0.800000');
      expect(await stored('expenses', expense.id)).toMatchObject({
        fx_rate_to_home: '0.888889',
        amount_home: '8.89',
        fx_pending: false,
      });
    });

    it('stores fx_pending, refusing nothing, when no rate can be had', async () => {
      const expense = expenseRecord(tripId, { amount: '10.00', currency: 'ZZZ' });

      const result = await pushOne(app, a, 'expenses', expense);

      expect(result).toMatchObject({ status: 'applied' });
      expect(await stored('expenses', expense.id)).toMatchObject({
        fx_rate_to_home: null,
        amount_home: null,
        fx_pending: true,
      });
    });

    it('keeps the stored rate on an edit and converts a new amount with it, whatever the device sends', async () => {
      const expense = expenseRecord(tripId, {
        amount: '10.00',
        currency: 'EUR',
        fx_rate_to_home: '0.900000',
        amount_home: '9.00',
        updated_at: minutesAgo(60),
      });
      await push(app, a, 'expenses', [expense]);

      await push(app, a, 'expenses', [
        {
          ...expense,
          amount: '20.00',
          fx_rate_to_home: '5.000000',
          amount_home: '100.00',
          updated_at: minutesAgo(30),
        },
      ]);

      expect(await stored('expenses', expense.id)).toMatchObject({
        amount: '20.00',
        fx_rate_to_home: '0.900000',
        amount_home: '18.00',
      });
    });

    it('leaves a pending row pending on an edit: the worker backfills, the device does not', async () => {
      const expense = expenseRecord(tripId, {
        amount: '10.00',
        currency: 'ZZZ',
        updated_at: minutesAgo(60),
      });
      await push(app, a, 'expenses', [expense]);

      await push(app, a, 'expenses', [
        {
          ...expense,
          amount: '11.00',
          fx_rate_to_home: '2.000000',
          amount_home: '22.00',
          updated_at: minutesAgo(30),
        },
      ]);

      expect(await stored('expenses', expense.id)).toMatchObject({
        amount: '11.00',
        fx_rate_to_home: null,
        amount_home: null,
        fx_pending: true,
      });
    });

    it('does not change the currency or the trip of a recorded expense: a different currency is a different conversion', async () => {
      const other = await createTripFor(app, a, 'CHF', 'Elsewhere');
      const expense = expenseRecord(tripId, {
        currency: 'CHF',
        updated_at: minutesAgo(60),
      });
      await push(app, a, 'expenses', [expense]);

      await push(app, a, 'expenses', [
        {
          ...expense,
          currency: 'JPY',
          trip_id: other,
          note: 'Edited',
          updated_at: minutesAgo(30),
        },
      ]);

      expect(await stored('expenses', expense.id)).toMatchObject({
        currency: 'CHF',
        trip_id: tripId,
        note: 'Edited',
      });
    });

    it('files an expense under a custom category pushed in the same cycle', async () => {
      const category = categoryRecord();
      await push(app, a, 'expense_categories', [category]);

      const result = await pushOne(
        app,
        a,
        'expenses',
        expenseRecord(tripId, { category_id: category.id }),
      );

      expect(result).toMatchObject({ status: 'applied' });
    });

    it('refuses a category name the traveller already uses, asking for a repair, not a new id', async () => {
      const first = categoryRecord({ name: 'Ferries' });
      await push(app, a, 'expense_categories', [first]);

      const result = await pushOne(
        app,
        a,
        'expense_categories',
        categoryRecord({ name: 'Ferries' }),
      );

      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
    });
  });

  describe('photos: metadata only, the bytes travel on the upload channel (FR-041, FR-056)', () => {
    it('takes is_public while moderation is pending, and the photo stays unreachable to anyone else', async () => {
      const b = await registerTraveller(app);
      const publicTrip = await createTripFor(app, a, 'CHF', 'Public trip');
      await request(app.getHttpServer())
        .patch(`/v1/trips/${publicTrip}`)
        .set(asA())
        .send({ is_public: true })
        .expect(200);
      const id = await insertPhotoRow(harness.owner, publicTrip);

      const result = await pushOne(
        app,
        a,
        'photos',
        photoRecord(publicTrip, id, { is_public: true, updated_at: minutesAgo(5) }),
      );

      expect(result).toEqual({ id, status: 'applied' });
      expect(await stored('photos', id)).toMatchObject({
        is_public: true,
        moderation_state: 'pending',
      });
      const visibleToB = await harness.asUser(
        b.tokens.user.id,
        (tx) => tx`SELECT id FROM photos WHERE id = ${id}::uuid`,
      );
      expect(visibleToB).toHaveLength(0);
    });

    it('ignores the fields that are immutable after registration, without an error', async () => {
      const id = await insertPhotoRow(harness.owner, tripId, {
        exifLat: 35.5,
        exifLng: 139.7,
        updatedAt: minutesAgo(90),
      });
      const before = await stored('photos', id);

      const result = await pushOne(
        app,
        a,
        'photos',
        photoRecord(tripId, id, {
          taken_at: '2020-01-01T00:00:00Z',
          exif_lat: -10,
          exif_lng: -20,
          is_public: true,
          updated_at: minutesAgo(5),
        }),
      );

      expect(result).toEqual({ id, status: 'applied' });
      const row = await stored('photos', id);
      expect(row).toMatchObject({ is_public: true, exif_lat: 35.5, exif_lng: 139.7 });
      expect(row.taken_at).toEqual(before.taken_at);
      expect(row.storage_key).toBe(before.storage_key);
      expect(row.upload_state).toBe('uploaded');
    });

    it('refiles a photo under a known city and refuses an unknown one', async () => {
      const id = await insertPhotoRow(harness.owner, tripId, {
        updatedAt: minutesAgo(90),
      });

      const filed = await pushOne(
        app,
        a,
        'photos',
        photoRecord(tripId, id, { city_id: CITY.paris, updated_at: minutesAgo(30) }),
      );
      const unknown = await pushOne(
        app,
        a,
        'photos',
        photoRecord(tripId, id, { city_id: 999_999, updated_at: minutesAgo(5) }),
      );

      expect(filed).toEqual({ id, status: 'applied' });
      expect(unknown).toMatchObject({ status: 'rejected', reason: 'invalid' });
      expect((await stored('photos', id)).city_id).toBe(CITY.paris);
    });

    it('tombstones a photo without touching anything else about it', async () => {
      const id = await insertPhotoRow(harness.owner, tripId, {
        updatedAt: minutesAgo(90),
      });

      await push(app, a, 'photos', [
        photoRecord(tripId, id, { deleted: true, updated_at: minutesAgo(5) }),
      ]);

      const row = await stored('photos', id);
      expect(row.deleted_at).toBeInstanceOf(Date);
      expect(row.storage_key).toBe(`fixture/${id}`);
    });

    it('answers a delete of a photo that never registered as applied, creating nothing', async () => {
      const id = '22222222-2222-4222-8222-00000000cccc';

      const result = await pushOne(
        app,
        a,
        'photos',
        photoRecord(tripId, id, { deleted: true }),
      );

      expect(result).toEqual({ id, status: 'applied' });
      expect(await rowOf(harness.owner, 'photos', id)).toBeUndefined();
    });
  });

  describe('documents: owner-only, sealed at rest, no visibility anywhere (FR-032, FR-033, FR-035; D-33)', () => {
    const makePass = async (
      overrides: Parameters<typeof uploadDocument>[3] = {},
    ): Promise<string> => {
      const document = await uploadDocument(app, a, tripId, {
        type: 'boarding_pass',
        parsed_json: PASS_FIELDS,
        ...overrides,
      });
      await harness.owner`
        UPDATE documents SET updated_at = ${minutesAgo(90)}::timestamptz
        WHERE id = ${document.id}::uuid
      `;

      return document.id;
    };

    const listed = async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/trips/${tripId}/documents`)
        .set(asA());

      return DocumentsResponse.parse(response.body).documents;
    };

    it('seals a corrected set of fields and confirms them with the device’s own time', async () => {
      const id = await makePass();
      const corrected: DocumentParsedFields = { ...PASS_FIELDS, flight_number: 'LX40' };
      const confirmedAt = minutesAgo(10);

      const result = await pushOne(
        app,
        a,
        'documents',
        documentRecord(tripId, id, {
          type: 'boarding_pass',
          parsed_json: corrected,
          parsed_confirmed_at: confirmedAt,
          updated_at: minutesAgo(5),
        }),
      );

      expect(result).toEqual({ id, status: 'applied' });
      const row = await stored('documents', id);
      // Sealed at rest: nothing readable in the column (research D-33).
      expect((row.parsed_sealed as Buffer).toString('latin1')).not.toContain('LX40');
      expect((row.parsed_sealed as Buffer).toString('latin1')).not.toContain('DESMARAIS');
      expect((row.parsed_confirmed_at as Date).toISOString()).toBe(confirmedAt);
      // And opened for the owner through the existing service.
      const document = (await listed()).find((candidate) => candidate.id === id);
      expect(document?.parsed_json).toEqual(corrected);
    });

    it('leaves the sealed bytes alone when the fields did not change', async () => {
      const id = await makePass();
      const before = await stored('documents', id);

      await push(app, a, 'documents', [
        documentRecord(tripId, id, {
          type: 'boarding_pass',
          parsed_json: PASS_FIELDS,
          updated_at: minutesAgo(5),
        }),
      ]);

      const row = await stored('documents', id);
      expect((row.parsed_sealed as Buffer).equals(before.parsed_sealed as Buffer)).toBe(
        true,
      );
    });

    it('clears the fields and the confirmation together', async () => {
      const id = await makePass();

      await push(app, a, 'documents', [
        documentRecord(tripId, id, {
          type: 'boarding_pass',
          parsed_json: null,
          parsed_confirmed_at: null,
          updated_at: minutesAgo(5),
        }),
      ]);

      expect(await stored('documents', id)).toMatchObject({
        parsed_sealed: null,
        parsed_confirmed_at: null,
      });
    });

    it('refuses extracted fields on anything that is not a boarding pass (rest-api.md §6)', async () => {
      const id = await makePass({ type: 'other', parsed_json: null });

      const result = await pushOne(
        app,
        a,
        'documents',
        documentRecord(tripId, id, {
          type: 'other',
          parsed_json: PASS_FIELDS,
          updated_at: minutesAgo(5),
        }),
      );

      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
      expect((await stored('documents', id)).parsed_sealed).toBeNull();
    });

    it('refuses a confirmation with no fields to confirm (Constitution IV)', async () => {
      const id = await makePass({ type: 'boarding_pass', parsed_json: null });

      const result = await pushOne(
        app,
        a,
        'documents',
        documentRecord(tripId, id, {
          type: 'boarding_pass',
          parsed_json: null,
          parsed_confirmed_at: minutesAgo(1),
          updated_at: minutesAgo(5),
        }),
      );

      expect(result).toMatchObject({ status: 'rejected', reason: 'invalid' });
    });

    it('tombstones a document and leaves its bytes for the storage sweep, as the REST delete does', async () => {
      const id = await makePass();
      const before = await stored('documents', id);

      await push(app, a, 'documents', [
        documentRecord(tripId, id, { deleted: true, updated_at: minutesAgo(5) }),
      ]);

      const row = await stored('documents', id);
      expect(row.deleted_at).toBeInstanceOf(Date);
      expect(row.storage_key).toBe(before.storage_key);
      expect(await listed()).not.toContainEqual(expect.objectContaining({ id }));
    });

    it('has no visibility column, and no push can invent one', async () => {
      const columns = await harness.owner<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name IN ('documents', 'expenses') AND column_name ~ '(public|visib|shared)'
      `;

      expect(columns).toEqual([]);
    });
  });
});
