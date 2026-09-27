import postgres from 'postgres';
import type { Sql } from 'postgres';

import { runMigrations } from '@/db/migrate';

import { API_ROLE } from './constants';
import { requireEnv } from './env';

/**
 * Connection helpers shared by the privacy and integration suites.
 *
 * Two roles, deliberately kept apart, because the distinction is the guarantee
 * (contracts/data-access-policy.md §1, research D-20):
 *
 *   migrationSql() — MIGRATION_DATABASE_URL: the privileged role the container
 *                    starts with. Owns the tables, may alter policies. Used to
 *                    build fixtures and to read `pg_catalog`.
 *   apiSql()       — DATABASE_URL: `triptrackr_api`, not a superuser, not the
 *                    table owner, no policy-alter rights. Every adversarial
 *                    read must go through this one. A suite that queries as
 *                    the migration role proves nothing, because RLS does not
 *                    constrain it.
 *
 * Both strings are read from the same variables the application reads, so the
 * suites exercise the deployment shape rather than a test-only arrangement of
 * it — and adversarial test 17 can assert on `DATABASE_URL` itself.
 */

/** Privileged connection: schema owner, may read pg_catalog and seed fixtures. */
export function migrationSql(): Sql {
  return postgres(requireEnv('MIGRATION_DATABASE_URL'), { max: 1, onnotice: () => {} });
}

/**
 * Connection as the API role, from the very string the API would use. This is
 * the only connection an adversarial test may read through.
 */
export function apiSql(): Sql {
  return postgres(requireEnv('DATABASE_URL'), { max: 1, onnotice: () => {} });
}

let migrated = false;

/**
 * Arbitrary but fixed. Every Jest worker takes this same advisory lock, which is
 * what serialises them.
 */
const MIGRATION_LOCK_ID = 4_912_007;

/**
 * Applies every migration once. The runner also installs `API_DB_PASSWORD` on
 * the API role, exactly as it does in a deployment, which is what lets
 * `apiSql()` log in: 0003 creates the role without a password.
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
    await runMigrations({
      migrationDatabaseUrl: requireEnv('MIGRATION_DATABASE_URL'),
      apiRolePassword: requireEnv('API_DB_PASSWORD'),
      quiet: true,
    });
  } finally {
    await sql.end();
  }

  migrated = true;
}

export { API_ROLE };
