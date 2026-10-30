import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { Sql } from 'postgres';

import { ensureMigrated, migrationSql } from '../support/db';

/**
 * Entitlement neutrality (research D-08, D14-12; FR-020, FR-021; tasks T177; Constitution V).
 *
 * A lapsed subscription, a refund or a spent credit must not be able to change what a traveller can
 * see, keep or export, so nothing but the allowance may read the commerce tables. Two watchers,
 * because each fails differently: the database one catches a policy, view or function that joins
 * them; the source one catches a read path that does. The functions named `billing_*` (the webhook's
 * keyholes) and `trip_covers_guard` are the only functions allowed to name them.
 */
const SRC = join(__dirname, '..', '..', 'src');
const COMMERCE_TABLES = [
  'subscriptions',
  'trip_credits',
  'subscription_periods',
  'trip_covers',
  'allowance_shadow',
];
const COMMERCE_WORDS = new RegExp(
  `\\b(${[
    ...COMMERCE_TABLES,
    'tripCredits',
    'subscriptionPeriods',
    'tripCovers',
    'allowanceShadow',
  ].join('|')})\\b`,
);
const ALLOWED_FILES = new Set([
  join('db', 'schema', 'commerce.ts'),
  join('db', 'schema', 'index.ts'),
]);
const BILLING_DIR = join('modules', 'billing') + sep;

const isAllowedReader = (file: string): boolean =>
  ALLOWED_FILES.has(file) || file.startsWith(BILLING_DIR);

/** SQL: a policy, view or function body that mentions any of the commerce tables. */
const mentionsCommerce = (column: string): string =>
  COMMERCE_TABLES.map((table) => `coalesce(${column}, '') ILIKE '%${table}%'`).join(
    ' OR ',
  );

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'migrations' ? [] : sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('privacy — entitlement neutrality', () => {
  let owner: Sql;

  beforeAll(async () => {
    await ensureMigrated();
    owner = migrationSql();
  });

  afterAll(async () => {
    await owner?.end();
  });

  test('no policy of another table mentions a commerce table', async () => {
    const rows = await owner.unsafe<{ tablename: string; policyname: string }[]>(
      `SELECT tablename, policyname FROM pg_policies
       WHERE tablename <> ALL ($1::text[])
         AND (${mentionsCommerce('qual')} OR ${mentionsCommerce('with_check')})`,
      [COMMERCE_TABLES],
    );

    expect(rows).toEqual([]);
  });

  test('no view reads a commerce table', async () => {
    const rows = await owner.unsafe<{ viewname: string }[]>(
      `SELECT viewname FROM pg_views
       WHERE schemaname = 'public' AND (${mentionsCommerce('definition')})`,
    );

    expect(rows).toEqual([]);
  });

  test('only the billing keyholes and the cover guard read a commerce table', async () => {
    const rows = await owner.unsafe<{ proname: string }[]>(
      `SELECT p.proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname NOT LIKE 'billing\\_%'
         AND p.proname <> 'trip_covers_guard'
         AND (${mentionsCommerce('p.prosrc')})`,
    );

    expect(rows).toEqual([]);
  });

  test('the API role can read its own row and cannot write it', async () => {
    const rows = await owner<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = 'subscriptions' AND grantee = 'triptrackr_api'`;

    expect(rows.map((row) => row.privilege_type)).toEqual(['SELECT']);
  });

  test('only the billing module reads a commerce table in application code', () => {
    const readers = sourceFiles(SRC)
      .filter((file) => COMMERCE_WORDS.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file));

    expect(readers.filter((file) => !isAllowedReader(file))).toEqual([]);
  });
});
