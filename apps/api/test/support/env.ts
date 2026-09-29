import { resetEnvCache } from '@/common/config/env.schema';

import { API_ROLE_PASSWORD } from './constants';

/**
 * A complete, valid environment for tests.
 *
 * `loadEnv()` refuses to start with anything missing, which is the right
 * behaviour for the process and an obstacle for a unit test that only wants to
 * exercise one service. Every required variable is supplied here once, so a
 * spec overrides the one or two it cares about rather than restating forty.
 *
 * The values are deliberately unusable — a connection string for a database
 * that is not there, a key that unlocks nothing — so a unit test that reaches
 * for real I/O fails immediately instead of quietly touching something.
 */
const UNIT_DEFAULTS: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://triptrackr_api:unused@localhost:5432/unused',
  MIGRATION_DATABASE_URL: 'postgres://owner:unused@localhost:5432/unused',
  API_DB_PASSWORD: API_ROLE_PASSWORD,
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  JWT_REFRESH_SECRET: 'y'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET_PHOTOS: 'photos',
  S3_BUCKET_DOCUMENTS: 'documents',
  // 32 zero bytes, base64. Valid in shape; specs that care supply their own.
  DOCUMENT_MASTER_KEY: Buffer.alloc(32).toString('base64'),
  DOCUMENT_MASTER_KEY_ID: 'v1',
  MAPBOX_ACCESS_TOKEN: 't',
  ANTHROPIC_API_KEY: 't',
  RESEND_API_KEY: 't',
  REVENUECAT_API_KEY: 't',
  REVENUECAT_WEBHOOK_SECRET: 't',
};

/**
 * The variables Jest's globalSetup provisions from the Testcontainers database and
 * object store (test/setup.ts).
 */
const PROVISIONED_BY_GLOBAL_SETUP = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'API_DB_PASSWORD',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET_PHOTOS',
  'S3_BUCKET_DOCUMENTS',
] as const;

/**
 * Installs the unit-test environment, overwriting whatever was there, and
 * clears the memoised copy so the next `loadEnv()` reads it.
 */
export function applyUnitTestEnv(overrides: Readonly<Record<string, string>> = {}): void {
  resetEnvCache();
  Object.assign(process.env, { ...UNIT_DEFAULTS, ...overrides });
}

/**
 * The same, but keeps the connection variables `test/setup.ts` pointed at the
 * real containers. For suites that boot the application against PostgreSQL and
 * the object store and need everything else merely present.
 */
export function applyDatabaseTestEnv(
  overrides: Readonly<Record<string, string>> = {},
): void {
  const provisioned = Object.fromEntries(
    PROVISIONED_BY_GLOBAL_SETUP.map((name) => [name, requireEnv(name)]),
  );

  applyUnitTestEnv({ ...provisioned, ...overrides });
}

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. The database-backed suites run against a real PostgreSQL ` +
        'started by test/setup.ts and have no mock path (Constitution III).',
    );
  }

  return value;
}
