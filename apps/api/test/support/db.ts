import postgres from 'postgres';
import type { Sql } from 'postgres';

import { runMigrations } from '@/db/migrate';

/**
 * Connection helpers shared by the privacy and integration suites.
 *
 * Two roles, deliberately kept apart, because the distinction is the guarantee
 * (contracts/data-access-policy.md §1):
 *
 *   migrationSql() — the privileged role the container starts with. Owns the
 *                    tables, may alter policies. Used to build fixtures and to
 *                    read `pg_catalog`.
 *   apiSql()       — `triptrackr_api`: not a superuser, not the table owner,
 *                    no policy-alter rights. Every adversarial read must go
 *                    through this one. A suite that queries as the migration
 *                    role proves nothing, because RLS does not constrain it.
 */

const API_ROLE = 'triptrackr_api';
const API_PASSWORD = 'triptrackr_api_test_password';

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. The privacy suite runs against a real PostgreSQL ' +
        'started by test/setup.ts and has no mock path (Constitution III).',
    );
  }
  return url;
}

/** Privileged connection: schema owner, may read pg_catalog and seed fixtures. */
export function migrationSql(): Sql {
  return postgres(requireDatabaseUrl(), { max: 1, onnotice: () => {} });
}

/**
 * Connection as the API role. This is the only connection an adversarial test
 * may read through.
 */
export function apiSql(): Sql {
  const url = new URL(requireDatabaseUrl());
  url.username = API_ROLE;
  url.password = API_PASSWORD;
  return postgres(url.toString(), { max: 1, onnotice: () => {} });
}

let migrated = false;

/**
 * Arbitrary but fixed. Every Jest worker takes this same advisory lock, which is
 * what serialises them.
 */
const MIGRATION_LOCK_ID = 4_912_007;

/**
 * Applies every migration once, then gives the API role a password so `apiSql()`
 * can log in. 0003 creates the role without one, since production supplies
 * credentials out of band.
 *
 * Jest runs each spec file in its own worker process against the one container
 * started by globalSetup, so the in-process `migrated` flag only deduplicates
 * within a worker. Without the advisory lock, two workers race and the loser
 * fails on a duplicate `schema_migrations` table. The lock is session-scoped and
 * released when the connection closes, so a crashed worker cannot wedge the rest.
 */
export async function ensureMigrated(): Promise<void> {
  if (migrated) return;

  const sql = migrationSql();
  try {
    await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;

    // runMigrations is itself idempotent — it skips files already recorded in
    // schema_migrations — so the worker that loses the race applies nothing.
    await runMigrations({ databaseUrl: requireDatabaseUrl(), quiet: true });

    await sql.unsafe(`ALTER ROLE ${API_ROLE} WITH PASSWORD '${API_PASSWORD}'`);
  } finally {
    await sql.end();
  }

  migrated = true;
}

export { API_ROLE };
