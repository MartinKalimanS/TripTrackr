import type { NestExpressApplication } from '@nestjs/platform-express';
import { NoteResponse, TripResponse, type ApiError } from '@triptrackr/contracts';
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
 * FR-019 — a note must have at least a country anchor — tasks.md T072.
 *
 * Refused on create by the wire schema, and refused on patch by the service
 * evaluating the pair the row would END UP with, because a client clearing
 * one anchor cannot see the other in the same request. The database CHECK
 * (data-model.md §4) stands behind both, but it must never be what answers:
 * a raised constraint would poison the request transaction (0008's header).
 */
describe('notes — anchor rule (FR-019)', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let traveller: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);

    const response = await request(app.getHttpServer())
      .post('/v1/trips')
      .set(bearer(traveller.tokens.access_token))
      .send({ title: 'Anchors', home_currency: 'CHF' });
    tripId = TripResponse.parse(response.body).trip.id;
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  it('refuses a note with neither anchor as a validation problem naming country_id', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send({ body: 'Floating free' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    const details = (response.body as ApiError).error.details as {
      issues: { path: string }[];
    };
    expect(details.issues.map((i) => i.path)).toContain('country_id');
  });

  it('refuses explicit nulls for both anchors', async () => {
    const response = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send({ body: 'Nulls', country_id: null, city_id: null });

    expect(response.status).toBe(400);
  });

  it('refuses a patch that would leave the note with no anchor, and leaves the row untouched', async () => {
    const created = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send({ body: 'Country only', country_id: COUNTRY.switzerland });
    const note = NoteResponse.parse(created.body).note;

    const response = await server()
      .patch(`/v1/notes/${note.id}`)
      .set(auth())
      .send({ country_id: null });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    expect(JSON.stringify(response.body)).not.toMatch(/check constraint|violates/i);

    const [row] = await owner<{ country_id: number | null; updated_at: Date }[]>`
      SELECT country_id, updated_at FROM notes WHERE id = ${note.id}::uuid
    `;
    expect(row?.country_id).toBe(COUNTRY.switzerland);
    expect(row?.updated_at.toISOString()).toBe(note.updated_at);
  });

  it('allows clearing the country when a city remains, and the reverse', async () => {
    const created = await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(auth())
      .send({ body: 'Both', country_id: COUNTRY.switzerland, city_id: CITY.zurich });
    const note = NoteResponse.parse(created.body).note;

    const cityOnly = await server()
      .patch(`/v1/notes/${note.id}`)
      .set(auth())
      .send({ country_id: null });
    expect(cityOnly.status).toBe(200);
    expect(NoteResponse.parse(cityOnly.body).note).toMatchObject({
      country_id: null,
      city_id: CITY.zurich,
    });

    const countryBack = await server()
      .patch(`/v1/notes/${note.id}`)
      .set(auth())
      .send({ country_id: COUNTRY.switzerland, city_id: null });
    expect(countryBack.status).toBe(200);
    expect(NoteResponse.parse(countryBack.body).note).toMatchObject({
      country_id: COUNTRY.switzerland,
      city_id: null,
    });
  });
});
