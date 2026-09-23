import { PostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Boots a real PostgreSQL 17 + PostGIS 3.5 for the contract, integration, and
 * privacy suites.
 *
 * Constitution III: "Integration tests against a real database ... an RLS policy is
 * only real when the real engine evaluates it." There is deliberately no mock path
 * here — a suite that can run without a database is a suite that proves nothing
 * about row-level security.
 *
 * The per-suite fixture (accounts A, B, C and their content) is built by the harness
 * in test/integration/harness.ts, which T037 adds.
 */
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgis/postgis:17-3.5')
    .withDatabase('triptrackr_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();

  // Stash the handle so teardown can stop it.
  (globalThis as Record<string, unknown>).__PG_CONTAINER__ = container;
}
