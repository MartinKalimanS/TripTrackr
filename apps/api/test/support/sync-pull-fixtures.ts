import type { NestExpressApplication } from '@nestjs/platform-express';
import { PullResponse, SYNC_TABLES, type SyncTable } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { bearer, type RegisteredTraveller } from './app';
import { FOOD } from './expenses';
import { COUNTRY } from './geography';

/**
 * Fixtures for the pull suites (tasks.md T121, T122, T126; sync-protocol.md §1).
 *
 * Two jobs. One is driving `GET /sync/pull` the way a device does — a page, or
 * pages until `has_more` is false — with every answer parsed through the
 * contract's `PullResponse`, so a suite cannot pass on a body the wire format
 * would refuse. The other is writing rows **around the API, as the owner**,
 * because the cursor suites need what no route can produce: several rows whose
 * `updated_at` is the same instant, to the microsecond.
 */

export interface PullParams {
  readonly cursor?: string;
  readonly tables?: readonly string[];
}

/** `GET /v1/sync/pull`, unasserted: the caller reads the status and the body. */
export function pullOnce(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  params: PullParams = {},
) {
  const query: Record<string, string> = {};
  if (params.cursor !== undefined) query.cursor = params.cursor;
  if (params.tables !== undefined) query.tables = params.tables.join(',');

  return request(app.getHttpServer())
    .get('/v1/sync/pull')
    .query(query)
    .set(bearer(traveller.tokens.access_token));
}

/** One page, insisting on a 200 that satisfies `PullResponse`. */
export async function pullPage(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  params: PullParams = {},
): Promise<PullResponse> {
  const response = await pullOnce(app, traveller, params);
  if (response.status !== 200) {
    throw new Error(`Pull failed: ${response.status} ${JSON.stringify(response.body)}`);
  }

  return PullResponse.parse(response.body);
}

/** One record, flattened out of its table's array. */
export interface Pulled {
  readonly table: SyncTable;
  readonly id: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
  readonly record: Record<string, unknown>;
}

/** Every record of a page, in table order, each tagged with its table. */
export function flatten(page: PullResponse): Pulled[] {
  return SYNC_TABLES.flatMap((table) =>
    page.changes[table].map((record) => {
      const fields = record as Record<string, unknown>;
      return {
        table,
        id: fields.id as string,
        updated_at: fields.updated_at as string,
        deleted_at: (fields.deleted_at as string | null) ?? null,
        record: fields,
      };
    }),
  );
}

export interface PulledToEnd {
  readonly pages: PullResponse[];
  /** Every record across every page, in the order the server sent them. */
  readonly records: Pulled[];
}

/** Follows `next_cursor` until `has_more` is false, never more than `maxPages` times. */
export async function pullToEnd(
  app: NestExpressApplication,
  traveller: RegisteredTraveller,
  params: PullParams = {},
  maxPages = 200,
): Promise<PulledToEnd> {
  const pages: PullResponse[] = [];
  let cursor = params.cursor;

  for (let attempt = 0; attempt < maxPages; attempt += 1) {
    const page = await pullPage(app, traveller, { ...params, cursor });
    pages.push(page);
    if (!page.has_more) return { pages, records: pages.flatMap(flatten) };
    cursor = page.next_cursor;
  }

  throw new Error(
    `Pull did not finish in ${maxPages} pages — a cursor is not advancing.`,
  );
}

/**
 * An instant within ONE millisecond (`…:00.120`) whose microsecond digits are
 * `micros` (0–999): `microInstant(7)` is `2026-07-01T12:00:00.120007Z`. A cursor
 * that rounds through a JavaScript `Date` cannot tell any two of these apart.
 */
export function microInstant(micros: number, second = '2026-07-01T12:00:00'): string {
  return `${second}.120${String(micros).padStart(3, '0')}Z`;
}

/** Note row written as the owner, with the exact `updated_at` the caller names. */
export async function insertNoteAt(
  owner: Sql,
  tripId: string,
  updatedAt: string,
  overrides: { id?: string; deletedAt?: string | null; body?: string } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  await owner`
    INSERT INTO notes (id, trip_id, country_id, body, created_at, updated_at, deleted_at)
    VALUES (${id}::uuid, ${tripId}::uuid, ${COUNTRY.switzerland}, ${overrides.body ?? 'seeded'},
            ${updatedAt}::text::timestamptz, ${updatedAt}::text::timestamptz,
            ${overrides.deletedAt ?? null}::text::timestamptz)
  `;
  return id;
}

/** Expense row written as the owner, with the exact `updated_at` the caller names. */
export async function insertExpenseAt(
  owner: Sql,
  tripId: string,
  updatedAt: string,
  overrides: { id?: string } = {},
): Promise<string> {
  const id = overrides.id ?? randomUUID();
  await owner`
    INSERT INTO expenses (id, trip_id, category_id, amount, currency, fx_pending, spent_at,
                          created_at, updated_at)
    VALUES (${id}::uuid, ${tripId}::uuid, ${FOOD}::uuid, 10.00, 'CHF', true, '2026-06-02',
            ${updatedAt}::text::timestamptz, ${updatedAt}::text::timestamptz)
  `;
  return id;
}
