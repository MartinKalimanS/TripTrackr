/**
 * Values the database-backed suites and Jest's globalSetup must agree on.
 *
 * Kept free of `@/` imports on purpose: Jest loads `test/setup.ts` outside the
 * module registry that applies `moduleNameMapper`, so a path alias reached from
 * here would fail to resolve there and nowhere else.
 */

/** The non-superuser role the API connects as (0003_api_role.sql). */
export const API_ROLE = 'triptrackr_api';

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
