import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  NoteResponse,
  NotesResponse,
  TripResponse,
  type Note,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { migrationSql } from '../support/db';
import { CITY, COUNTRY, seedGeography } from '../support/geography';

/**
 * Notes through HTTP (rest-api.md §4; FR-017, FR-018) — tasks.md T071.
 *
 * A note lives at one of three levels — trip, country, or city — and FR-018
 * says a traveller may move it between them without losing its content or
 * its creation date. The data model makes that an update of two nullable
 * anchors (data-model.md §4); these tests hold it to that.
 */
describe('notes', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);

    const response = await server()
      .post('/v1/trips')
      .set(auth())
      .send({ title: 'Swiss notes', home_currency: 'CHF' });
    tripId = TripResponse.parse(response.body).trip.id;
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  async function createNote(body: Record<string, unknown>): Promise<Note> {
    const response = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send(body);
    expect(response.status).toBe(201);
    return NoteResponse.parse(response.body).note;
  }

  describe('POST /trips/:tripId/notes (FR-017)', () => {
    it('creates a country-level note, private by default, with the body intact', async () => {
      const note = await createNote({
        title: 'Cheese',
        body: 'Try the raclette in Valais.',
        country_id: COUNTRY.switzerland,
      });

      expect(note).toMatchObject({
        trip_id: tripId,
        country_id: COUNTRY.switzerland,
        city_id: null,
        title: 'Cheese',
        body: 'Try the raclette in Valais.',
        is_public: false,
      });
    });

    it('creates a city-level note carrying both anchors', async () => {
      const note = await createNote({
        body: 'Lake swim at Seebad Utoquai.',
        country_id: COUNTRY.switzerland,
        city_id: CITY.zurich,
      });

      expect(note.country_id).toBe(COUNTRY.switzerland);
      expect(note.city_id).toBe(CITY.zurich);
      expect(note.title).toBeNull();
    });

    it('honours a client-chosen id, and a retried create is the same create (D-15)', async () => {
      const id = randomUUID();

      const first = await createNote({
        id,
        body: 'once',
        country_id: COUNTRY.switzerland,
      });
      const retry = await server()
        .post(`/v1/trips/${tripId}/notes`)
        .set(auth())
        .send({ id, body: 'once', country_id: COUNTRY.switzerland });

      expect(first.id).toBe(id);
      expect(retry.status).toBe(201);
      expect(NoteResponse.parse(retry.body).note.id).toBe(id);

      const listed = await server().get(`/v1/trips/${tripId}/notes`).set(auth());
      expect(
        NotesResponse.parse(listed.body).notes.filter((note) => note.id === id),
      ).toHaveLength(1);
    });

    it('refuses an unknown city or country as a validation problem, not a database error', async () => {
      const response = await server()
        .post(`/v1/trips/${tripId}/notes`)
        .set(auth())
        .send({ body: 'x', country_id: COUNTRY.switzerland, city_id: 999_999 });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      expect(JSON.stringify(response.body)).not.toMatch(
        /foreign key|constraint|violates/i,
      );
    });

    it("refuses a note on someone else's trip with the trip's not-found, disclosing nothing", async () => {
      const stranger = await registerTraveller(app);

      const response = await server()
        .post(`/v1/trips/${tripId}/notes`)
        .set(bearer(stranger.tokens.access_token))
        .send({ body: 'intruding', country_id: COUNTRY.switzerland });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    });
  });

  describe('GET /trips/:tripId/notes', () => {
    it('lists live notes newest first and filters by city or country', async () => {
      const scoped = await createNote({
        body: 'Only in Paris',
        country_id: COUNTRY.france,
        city_id: CITY.paris,
      });

      const all = await server().get(`/v1/trips/${tripId}/notes`).set(auth());
      const byCity = await server()
        .get(`/v1/trips/${tripId}/notes?city_id=${CITY.paris}`)
        .set(auth());
      const byCountry = await server()
        .get(`/v1/trips/${tripId}/notes?country_id=${COUNTRY.france}`)
        .set(auth());

      expect(all.status).toBe(200);
      const notes = NotesResponse.parse(all.body).notes;
      expect(notes[0]?.id).toBe(scoped.id);
      expect(NotesResponse.parse(byCity.body).notes.map((n) => n.id)).toEqual([
        scoped.id,
      ]);
      expect(NotesResponse.parse(byCountry.body).notes.map((n) => n.id)).toEqual([
        scoped.id,
      ]);
    });
  });

  describe('PATCH /notes/:id (FR-018)', () => {
    it('moves a country-level note into a city, keeping body and created_at', async () => {
      const note = await createNote({
        title: 'Move me',
        body: 'Written at country level.',
        country_id: COUNTRY.switzerland,
      });

      const moved = await server()
        .patch(`/v1/notes/${note.id}`)
        .set(auth())
        .send({ city_id: CITY.zurich });

      expect(moved.status).toBe(200);
      const after = NoteResponse.parse(moved.body).note;
      expect(after).toMatchObject({
        id: note.id,
        country_id: COUNTRY.switzerland,
        city_id: CITY.zurich,
        body: 'Written at country level.',
        created_at: note.created_at,
      });
      expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
        new Date(note.updated_at).getTime(),
      );

      // And it now appears under that city (Independent Test for US2).
      const byCity = await server()
        .get(`/v1/trips/${tripId}/notes?city_id=${CITY.zurich}`)
        .set(auth());
      expect(NotesResponse.parse(byCity.body).notes.map((n) => n.id)).toContain(note.id);
    });

    it('moves a city-level note back up to its country by clearing the city', async () => {
      const note = await createNote({
        body: 'Down then up',
        country_id: COUNTRY.switzerland,
        city_id: CITY.zurich,
      });

      const moved = await server()
        .patch(`/v1/notes/${note.id}`)
        .set(auth())
        .send({ city_id: null });

      expect(moved.status).toBe(200);
      expect(NoteResponse.parse(moved.body).note).toMatchObject({
        country_id: COUNTRY.switzerland,
        city_id: null,
        body: 'Down then up',
      });
    });

    it('edits title, body and visibility', async () => {
      const note = await createNote({ body: 'draft', country_id: COUNTRY.switzerland });

      const edited = await server()
        .patch(`/v1/notes/${note.id}`)
        .set(auth())
        .send({ title: 'Final', body: 'final text', is_public: true });

      expect(edited.status).toBe(200);
      expect(NoteResponse.parse(edited.body).note).toMatchObject({
        title: 'Final',
        body: 'final text',
        is_public: true,
      });
    });

    it('refuses an empty patch and an unknown key', async () => {
      const note = await createNote({ body: 'x', country_id: COUNTRY.switzerland });

      const empty = await server().patch(`/v1/notes/${note.id}`).set(auth()).send({});
      const smuggled = await server()
        .patch(`/v1/notes/${note.id}`)
        .set(auth())
        .send({ trip_id: randomUUID() });

      expect(empty.status).toBe(400);
      expect(smuggled.status).toBe(400);
    });

    it("answers not-found for a stranger's note and for a note that does not exist", async () => {
      const note = await createNote({ body: 'mine', country_id: COUNTRY.switzerland });
      const stranger = await registerTraveller(app);

      const theirs = await server()
        .patch(`/v1/notes/${note.id}`)
        .set(bearer(stranger.tokens.access_token))
        .send({ body: 'hijack' });
      const missing = await server()
        .patch(`/v1/notes/${randomUUID()}`)
        .set(auth())
        .send({ body: 'ghost' });

      expect(theirs.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(theirs.body).toEqual(missing.body);
    });
  });

  describe('DELETE /notes/:id (FR-039)', () => {
    it('tombstones the note: gone from reads, kept in the row', async () => {
      const note = await createNote({ body: 'doomed', country_id: COUNTRY.switzerland });

      const deleted = await server().delete(`/v1/notes/${note.id}`).set(auth());
      expect(deleted.status).toBe(204);

      const listed = await server().get(`/v1/trips/${tripId}/notes`).set(auth());
      expect(NotesResponse.parse(listed.body).notes.map((n) => n.id)).not.toContain(
        note.id,
      );

      const [row] = await owner<{ deleted_at: Date | null }[]>`
        SELECT deleted_at FROM notes WHERE id = ${note.id}::uuid
      `;
      expect(row?.deleted_at).not.toBeNull();

      const again = await server().delete(`/v1/notes/${note.id}`).set(auth());
      expect(again.status).toBe(404);
      expect(again.body).toMatchObject({ error: { code: 'NOTE_NOT_FOUND' } });
    });
  });
});
