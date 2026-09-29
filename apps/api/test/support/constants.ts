/**
 * Values the database-backed suites and Jest's globalSetup must agree on.
 *
 * Kept free of `@/` imports on purpose: Jest loads `test/setup.ts` outside the
 * module registry that applies `moduleNameMapper`, so a path alias reached from
 * here would fail to resolve there and nowhere else.
 */

/** The non-superuser role the API connects as (0003_api_role.sql). */
export const API_ROLE = 'triptrackr_api';

/** The dev object store, pinned exactly as in infra/docker-compose.yml (research D-31). */
export const RUSTFS_IMAGE =
  'rustfs/rustfs:1.0.0@sha256:8cc9801755448b71a786705ce76692c77e14936cccd87cf2fc31842e58f4d1ff';

/** Credentials, region and buckets of the test object store. */
export const TEST_S3 = {
  accessKeyId: 'triptrackr-test',
  secretAccessKey: 'triptrackr-test-secret',
  region: 'us-east-1',
  buckets: { photos: 'test-photos', documents: 'test-documents' },
} as const;

/**
 * Password the migration runner sets on that role under test. Long enough to
 * satisfy the `API_DB_PASSWORD` minimum the environment schema enforces, so the
 * suites exercise the same validation production does.
 */
export const API_ROLE_PASSWORD = 'triptrackr_api_test_password';

/**
 * Rewrites the owner's connection string into the API role's.
 *
 * Same host, port and database — only the identity changes. This is the string
 * `DATABASE_URL` carries in every environment (research D-20): the API never
 * learns the owner's credentials.
 */
export function apiRoleUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl);
  url.username = API_ROLE;
  url.password = API_ROLE_PASSWORD;
  return url.toString();
}
