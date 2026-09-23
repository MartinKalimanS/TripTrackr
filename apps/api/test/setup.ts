import { PostgreSqlContainer } from '@testcontainers/postgresql';

import { API_ROLE_PASSWORD, apiRoleUrl } from './support/constants';

/**
 * Boots a real PostgreSQL 17 + PostGIS 3.5 for the contract, integration, and
 * privacy suites.
 *
 * Constitution III: "Integration tests against a real database ... an RLS policy is
 * only real when the real engine evaluates it." There is deliberately no mock path
 * here — a suite that can run without a database is a suite that proves nothing
 * about row-level security.
 *
 * Two connection strings come out of one container, exactly as in production
 * (research D-20): the owner's for migrations and fixtures, the API role's for
 * everything a request would do. The API role does not exist until the
 * migrations have run — `ensureMigrated()` in test/support/db.ts applies them
 * and installs the password below — but a connection string is only a string,
 * and nothing dials it before then.
 *
 * The per-suite fixture (accounts A, B, C and their content) is built by the harness
 * in test/integration/harness.ts.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgis/postgis:17-3.5')
    .withDatabase('triptrackr_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const ownerUrl = container.getConnectionUri();

  process.env.MIGRATION_DATABASE_URL = ownerUrl;
  process.env.DATABASE_URL = apiRoleUrl(ownerUrl);
  process.env.API_DB_PASSWORD = API_ROLE_PASSWORD;

  // Stash the handle so teardown can stop it.
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
}
