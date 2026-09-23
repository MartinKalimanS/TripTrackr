import type { Sql, TransactionSql } from 'postgres';

import { apiSql, ensureMigrated, migrationSql } from '../support/db';

/**
 * The integration fixture: a real PostgreSQL 17 + PostGIS 3.5, every migration
 * applied, and two unrelated travellers with content of their own
 * (Constitution III).
 *
 * **Two accounts, not one.** A single-account fixture can only ever prove that a
 * traveller reaches their own rows, which is the uninteresting half of the
 * guarantee. Nearly every claim in data-access-policy.md is of the form "B cannot
 * see A's X", and that is unwritable without a B who genuinely owns nothing of
 * A's. Traveller B therefore has their own trip, so a test that finds one row can
 * distinguish "the policy filtered correctly" from "the table happened to have
 * one row in it".
 *
 * **Queries run through {@link Harness.asUser}, not through the raw connection.**
 * `app.current_user_id` is set with `SET LOCAL`, which lives and dies with a
 * transaction, exactly as RlsSessionMiddleware does it in production. A test that
 * set the variable on a pooled session instead would be testing a configuration
 * the server never runs in.
 */

/** Geography ids the seed installs; specs reference them by name, not by number. */
export const CITY = {
  /** Zürich — accent-bearing on purpose, for the FR-014 folding tests. */
  zurich: 1,
  paris: 2,
  tokyo: 3,
} as const;

export interface SeededAccount {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  /** A private trip owned by this account. */
  readonly privateTripId: string;
  /** A public trip owned by this account. */
  readonly publicTripId: string;
}

export interface Harness {
  /** Privileged connection. Fixture construction and `pg_catalog` reads only. */
  readonly owner: Sql;
  /**
   * The non-superuser API role. **Every assertion about what a traveller can see
   * must read through this**, because RLS does not constrain the owning role at
   * all — a suite that queried as `owner` would pass with every policy dropped.
   */
  readonly api: Sql;
  readonly accountA: SeededAccount;
  readonly accountB: SeededAccount;
  /** Runs `fn` in a transaction identifying as `userId`, or as nobody for null. */
  asUser<T>(userId: string | null, fn: (tx: TransactionSql) => Promise<T>): Promise<T>;
  /** Closes both connections. Call from `afterAll`. */
  close(): Promise<void>;
}

/**
 * Fixed uuids rather than generated ones.
 *
 * A failing assertion then names a constant a reader can grep for, instead of a
 * uuid that differs on every run and appears nowhere else in the repository.
 */
const ACCOUNT_A_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B_ID = '22222222-2222-4222-8222-222222222222';

export async function createHarness(): Promise<Harness> {
  await ensureMigrated();

  const owner = migrationSql();
  const api = apiSql();

  await seedGeography(owner);
  const accountA = await seedAccount(
    owner,
    ACCOUNT_A_ID,
    'a@example.test',
    'Traveller A',
  );
  const accountB = await seedAccount(
    owner,
    ACCOUNT_B_ID,
    'b@example.test',
    'Traveller B',
  );

  return {
    owner,
    api,
    accountA,
    accountB,

    asUser<T>(userId: string | null, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
      return api.begin(async (tx) => {
        if (userId) {
          // Parameterised via set_config rather than `SET LOCAL x = $1`, which
          // does not accept a bind parameter. Identical to the middleware.
          await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
        }
        // For a null userId nothing is set at all — not an empty string, not a
        // sentinel. That is the fail-closed case, and giving it a value here
        // would quietly make the anonymous tests pass for the wrong reason.

        return fn(tx);
      }) as Promise<T>;
    },

    async close(): Promise<void> {
      await Promise.all([owner.end(), api.end()]);
    },
  };
}

/**
 * Three cities in three countries. Reference data, unpoliced by design — a
 * country's name belongs to everyone.
 *
 * Idempotent, because each Jest worker builds the fixture against the one shared
 * container and would otherwise collide on the primary key.
 */
async function seedGeography(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO countries (id, iso_code, name, continent) VALUES
      (1, 'CH', 'Switzerland', 'Europe'),
      (2, 'FR', 'France', 'Europe'),
      (3, 'JP', 'Japan', 'Asia')
    ON CONFLICT (id) DO NOTHING
  `;

  await sql`
    INSERT INTO cities (id, country_id, name, ascii_name, location, timezone, population) VALUES
      (${CITY.zurich}, 1, 'Zürich', 'Zurich',
       ST_SetSRID(ST_MakePoint(8.5417, 47.3769), 4326)::geography, 'Europe/Zurich', 421878),
      (${CITY.paris}, 2, 'Paris', 'Paris',
       ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography, 'Europe/Paris', 2148000),
      (${CITY.tokyo}, 3, 'Tokyo', 'Tokyo',
       ST_SetSRID(ST_MakePoint(139.6917, 35.6895), 4326)::geography, 'Asia/Tokyo', 13960000)
    ON CONFLICT (id) DO NOTHING
  `;

  // serial columns do not advance when ids are supplied explicitly, so the next
  // insert from application code would collide on 1. Resynchronising here saves
  // every future spec from a failure that has nothing to do with what it tests.
  await sql`SELECT setval('cities_id_seq', (SELECT MAX(id) FROM cities))`;
  await sql`SELECT setval('countries_id_seq', (SELECT MAX(id) FROM countries))`;
}

/** One traveller, one private trip, one public trip, each with a single stop. */
async function seedAccount(
  sql: Sql,
  id: string,
  email: string,
  displayName: string,
): Promise<SeededAccount> {
  await sql`
    INSERT INTO users (id, email, display_name, password_hash, home_currency, is_profile_public)
    VALUES (${id}::uuid, ${email}, ${displayName}, ${'$argon2id$seeded$notarealhash'}, 'CHF', false)
    ON CONFLICT (id) DO NOTHING
  `;

  const privateTripId = await seedTrip(
    sql,
    id,
    `${displayName}'s private trip`,
    false,
    CITY.zurich,
  );
  const publicTripId = await seedTrip(
    sql,
    id,
    `${displayName}'s public trip`,
    true,
    CITY.paris,
  );

  return { id, email, displayName, privateTripId, publicTripId };
}

async function seedTrip(
  sql: Sql,
  ownerId: string,
  title: string,
  isPublic: boolean,
  cityId: number,
): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO trips (owner_id, title, is_public, home_currency, status)
    VALUES (${ownerId}::uuid, ${title}, ${isPublic}, 'CHF', 'planning')
    RETURNING id
  `;

  const tripId = (rows[0] as { id: string }).id;

  await sql`
    INSERT INTO trip_stops (trip_id, city_id, sort_order, arrive_date, depart_date)
    VALUES (${tripId}::uuid, ${cityId}, 0, '2026-06-01', '2026-06-08')
  `;

  return tripId;
}
