import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  PushResponse,
  SYNC_TABLES,
  type PushResult,
  type SyncTable,
} from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';
import { FOOD } from './expenses';
import { CITY, COUNTRY } from './geography';

/**
 * Fixtures for the `POST /sync/push` suites (tasks.md T123–T125, T199, T200).
 *
 * Records are plain objects, not contract types, on purpose: the suites must be
 * able to hand the endpoint a record the contract refuses — an `is_public` on an
 * expense, a `status` on a trip — and a typed factory would not compile one.
 * Each factory returns a record the strict `*PushRecord` schema accepts unless
 * the caller overrides a field, and a spec that depends on that says so by
 * parsing the body with `PushRequest`.
 *
 * Timestamps are built from the wall clock, in the past, never beyond the
 * server's clock tolerance: a record dated in the future would be clamped
 * (sync-protocol.md §2) and every assertion about what was stored would then be
 * an assertion about the clamp.
 */

export type Wire = Record<string, unknown>;

/** An ISO instant `minutes` before now — the default age of a device's edit. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** `POST /sync/push`, unasserted: the caller reads the status and the body. */
export function pushRaw(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  body: unknown,
) {
  return request(app.getHttpServer())
    .post('/v1/sync/push')
    .set(bearer(traveller.tokens.access_token))
    .send(body as object);
}

/** One push request, insisting on a 200 and a body the contract accepts. */
export async function push(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  table: SyncTable,
  records: readonly Wire[],
): Promise<PushResult[]> {
  const response = await pushRaw(app, traveller, { table, records });

  if (response.status !== 200) {
    throw new Error(
      `Push fixture failed: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return PushResponse.parse(response.body).results;
}

/** The only result of a one-record push. */
export async function pushOne(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  table: SyncTable,
  record: Wire,
): Promise<PushResult> {
  const [result] = await push(app, traveller, table, [record]);
  if (!result) throw new Error('A one-record push returned no result.');

  return result;
}

// ---------------------------------------------------------------------------
// Record factories — one per table, each valid against its strict push schema
// ---------------------------------------------------------------------------

const meta = (overrides: Wire): Wire => ({
  id: randomUUID(),
  updated_at: minutesAgo(60),
  deleted: false,
  ...overrides,
});

export function tripRecord(overrides: Wire = {}): Wire {
  return meta({
    title: 'Autumn in Japan',
    home_currency: 'CHF',
    is_public: false,
    cover_photo_id: null,
    ...overrides,
  });
}

export function stopRecord(tripId: string, overrides: Wire = {}): Wire {
  return meta({
    trip_id: tripId,
    city_id: CITY.tokyo,
    sort_order: 0,
    arrive_date: '2026-10-01',
    depart_date: '2026-10-05',
    ...overrides,
  });
}

export function categoryRecord(overrides: Wire = {}): Wire {
  const id = randomUUID();

  return meta({ id, name: `Coffee ${id.slice(0, 8)}`, icon: null, ...overrides });
}

export function noteRecord(tripId: string, overrides: Wire = {}): Wire {
  return meta({
    trip_id: tripId,
    country_id: COUNTRY.japan,
    city_id: null,
    title: 'Day one',
    body: 'Landed at Haneda and found the right train.',
    is_public: false,
    ...overrides,
  });
}

export function expenseRecord(tripId: string, overrides: Wire = {}): Wire {
  return meta({
    trip_id: tripId,
    city_id: null,
    category_id: FOOD,
    amount: '12.50',
    currency: 'CHF',
    spent_at: '2026-06-02',
    note: null,
    ...overrides,
  });
}

/** A photo's pushed shape. The row must already exist: push never creates one. */
export function photoRecord(tripId: string, id: string, overrides: Wire = {}): Wire {
  return meta({
    id,
    trip_id: tripId,
    city_id: null,
    taken_at: null,
    exif_lat: null,
    exif_lng: null,
    is_public: false,
    ...overrides,
  });
}

/** A document's pushed shape. The row must already exist: push never creates one. */
export function documentRecord(tripId: string, id: string, overrides: Wire = {}): Wire {
  return meta({
    id,
    trip_id: tripId,
    type: 'other',
    parsed_json: null,
    parsed_confirmed_at: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Reading the stored rows back, around the API, as the table owner
// ---------------------------------------------------------------------------

function assertTable(table: string): asserts table is SyncTable {
  if (!(SYNC_TABLES as readonly string[]).includes(table)) {
    throw new Error(`${table} is not a synchronised table.`);
  }
}

/** The raw stored row — tombstones included — or undefined. Owner connection: RLS does not apply. */
export async function rowOf(
  owner: Sql,
  table: SyncTable,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  assertTable(table);
  const rows = await owner.unsafe<Record<string, unknown>[]>(
    `SELECT * FROM ${table} WHERE id = $1::uuid`,
    [id],
  );

  return rows[0];
}

/** The stored row, or a failure naming the table and id. */
export async function requireRow(
  owner: Sql,
  table: SyncTable,
  id: string,
): Promise<Record<string, unknown>> {
  const row = await rowOf(owner, table, id);
  if (!row) throw new Error(`No ${table} row ${id}.`);

  return row;
}

/** A stored row's `updated_at` as an ISO string. */
export function updatedAtOf(row: Record<string, unknown>): string {
  return (row.updated_at as Date).toISOString();
}

/**
 * Inserts a photo row as registration would have left it — uploaded, private,
 * unscreened — without a byte going anywhere. Push never creates a photo, so a
 * suite that pushes one needs a row to push against, and this is the cheap way
 * to have it. The registration route is exercised for real in the upload suites.
 */
export async function insertPhotoRow(
  owner: Sql,
  tripId: string,
  overrides: {
    id?: string;
    updatedAt?: string;
    isPublic?: boolean;
    moderationState?: 'pending' | 'approved' | 'rejected';
    cityId?: number | null;
    exifLat?: number | null;
    exifLng?: number | null;
  } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();

  await owner`
    INSERT INTO photos (
      id, trip_id, storage_key, upload_state, moderation_state, is_public,
      city_id, exif_lat, exif_lng, updated_at
    ) VALUES (
      ${id}::uuid, ${tripId}::uuid, ${`fixture/${id}`}, 'uploaded',
      ${overrides.moderationState ?? 'pending'}, ${overrides.isPublic ?? false},
      ${overrides.cityId ?? null}, ${overrides.exifLat ?? null}, ${overrides.exifLng ?? null},
      ${overrides.updatedAt ?? minutesAgo(90)}::timestamptz
    )
  `;

  return id;
}
