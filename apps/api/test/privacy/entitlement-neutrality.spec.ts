import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import type { Sql } from 'postgres';

import { ensureMigrated, migrationSql } from '../support/db';

/**
 * Entitlement neutrality (research D-08; FR-076, FR-080; tasks T177; Constitution V).
 *
 * A lapsed subscription must not be able to change what a traveller can see, keep or export, so
 * nothing but the allowance may read it. Two watchers, because each fails differently: the database
 * one catches a policy, view or function that joins `subscriptions`; the source one catches a read
 * path that does.
 */
const SRC = join(__dirname, '..', '..', 'src');
const ALLOWED_READERS = new Set([
  join('modules', 'billing', 'allowance.service.ts'),
  join('db', 'schema', 'commerce.ts'),
  join('db', 'schema', 'index.ts'),
]);

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

  test('no policy of another table mentions subscriptions', async () => {
    const rows = await owner<{ tablename: string; policyname: string }[]>`
      SELECT tablename, policyname FROM pg_policies
      WHERE tablename <> 'subscriptions'
        AND (coalesce(qual, '') ILIKE '%subscriptions%'
          OR coalesce(with_check, '') ILIKE '%subscriptions%')`;

    expect(rows).toEqual([]);
  });

  test('no view reads subscriptions', async () => {
    const rows = await owner<{ viewname: string }[]>`
      SELECT viewname FROM pg_views
      WHERE schemaname = 'public' AND definition ILIKE '%subscriptions%'`;

    expect(rows).toEqual([]);
  });

  test('no function in public reads subscriptions', async () => {
    const rows = await owner<{ proname: string }[]>`
      SELECT p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosrc ILIKE '%subscriptions%'`;

    expect(rows).toEqual([]);
  });

  test('the API role can read its own row and cannot write it', async () => {
    const rows = await owner<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE table_name = 'subscriptions' AND grantee = 'triptrackr_api'`;

    expect(rows.map((row) => row.privilege_type)).toEqual(['SELECT']);
  });

  test('only the allowance service reads the subscriptions table in application code', () => {
    const readers = sourceFiles(SRC)
      .filter((file) => /\bsubscriptions\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).split(sep).join(sep));

    const unexpected = readers.filter((file) => !ALLOWED_READERS.has(file));
    expect(unexpected).toEqual([]);
  });
});
