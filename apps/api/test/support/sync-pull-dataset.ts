import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DocumentParsedFields, SyncTable } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';
import { PASS_FIELDS, uploadDocument } from './documents';
import { createExpenseFor, createTripFor } from './expenses';
import { CITY, COUNTRY } from './geography';
import { registerPhoto } from './photos';

/**
 * One traveller's content in every one of the seven synchronised tables,
 * written through the real routes (Constitution III: fixtures go through the
 * code under test) — the dataset the snapshot, tombstone and read-one suites
 * assert against.
 *
 * The stop is dated in 2020, long past, so the trip's *derived* status is
 * `past` while the column `trips.status` still holds what the write path
 * cached: a suite can tell "derived on read" from "copied from the column".
 */
export interface PullDataset {
  readonly tripId: string;
  readonly stopId: string;
  readonly categoryId: string;
  readonly noteId: string;
  readonly expenseId: string;
  readonly photoId: string;
  readonly documentId: string;
  /** The same ids, keyed by the table they live in. */
  readonly byTable: Readonly<Record<SyncTable, string>>;
  /** The photo's object key — for suites that look into the bucket itself. */
  readonly storageKey: string;
}

export async function buildDataset(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  title = 'Dataset trip',
  boardingPass: DocumentParsedFields = PASS_FIELDS,
): Promise<PullDataset> {
  const auth = bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  const tripId = await createTripFor(app, traveller, 'CHF', title);

  const stopId = randomUUID();
  const stop = await server().post(`/v1/trips/${tripId}/stops`).set(auth).send({
    id: stopId,
    city_id: CITY.zurich,
    arrive_date: '2020-01-01',
    depart_date: '2020-01-05',
  });
  expectStatus(stop.status, 201, 'stop');

  const categoryId = randomUUID();
  const category = await server()
    .post('/v1/expense-categories')
    .set(auth)
    .send({ id: categoryId, name: `Coffee ${categoryId.slice(0, 8)}`, icon: 'cup' });
  expectStatus(category.status, 201, 'category');

  const noteId = randomUUID();
  const note = await server().post(`/v1/trips/${tripId}/notes`).set(auth).send({
    id: noteId,
    title: 'Cheese',
    body: 'Raclette.',
    country_id: COUNTRY.switzerland,
  });
  expectStatus(note.status, 201, 'note');

  const expense = await createExpenseFor(app, traveller, tripId, {
    id: randomUUID(),
    category_id: categoryId,
    amount: '12.50',
  });

  const registered = await registerPhoto(app, traveller, tripId, { id: randomUUID() });

  const document = await uploadDocument(app, traveller, tripId, {
    id: randomUUID(),
    type: 'boarding_pass',
    parsed_json: boardingPass,
    confirmed: true,
  });

  return {
    tripId,
    stopId,
    categoryId,
    noteId,
    expenseId: expense.id,
    photoId: registered.photo.id,
    documentId: document.id,
    storageKey: registered.storageKey,
    byTable: {
      trips: tripId,
      trip_stops: stopId,
      expense_categories: categoryId,
      notes: noteId,
      expenses: expense.id,
      photos: registered.photo.id,
      documents: document.id,
    },
  };
}

function expectStatus(actual: number, expected: number, what: string): void {
  if (actual !== expected) {
    throw new Error(
      `Dataset fixture (${what}) answered ${actual}, expected ${expected}.`,
    );
  }
}
