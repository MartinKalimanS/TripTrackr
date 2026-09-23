import type { Sql } from 'postgres';

import { API_ROLE, ensureMigrated, migrationSql } from '../support/db';

/**
 * Adversarial suite rows 14, 15 and 16 (contracts/data-access-policy.md §4).
 *
 * These assert on `pg_catalog` rather than on behaviour, and that is the whole
 * point of them. The three configuration mistakes in §1 — a superuser API role,
 * a missing FORCE, a public-read policy on a private table — are *silent*: every
 * behavioural privacy test still passes while the guarantee is entirely absent.
 * A behavioural suite cannot detect its own disablement, so this file watches
 * the configuration the other files depend on.
 */

/**
 * Tables that are reference data, not traveller data. RLS is deliberately absent
 * on these: a country's name belongs to everyone.
 *
 * The assertion below is written as "everything NOT on this list must be policed"
 * rather than as a list of tables that must be. A new traveller-owned table then
 * fails this suite the moment it is created, instead of waiting for someone to
 * remember to extend a list. Adding a name here is a privacy decision and must be
 * reviewed as one.
 */
const UNPOLICED_BY_DESIGN = new Set([
  'countries',
  'cities',
  'fx_rates',
  'schema_migrations',
  // PostGIS ships this and owns it; it holds the spatial reference systems, not
  // anyone's data, and the extension expects it to be readable.
  'spatial_ref_sys',
]);

/** Tables with no public-read path, ever (FR-027, FR-032). */
const OWNER_ONLY_TABLES = ['expenses', 'documents'] as const;

describe('privacy — catalogue assertions', () => {
  let sql: Sql;

  beforeAll(async () => {
    await ensureMigrated();
    sql = migrationSql();
  });

  afterAll(async () => {
    await sql?.end();
  });

  // Row 14 — FR-027, FR-032
  describe('row 14: no public-read policy exists on expenses or documents', () => {
    it.each(OWNER_ONLY_TABLES)(
      'has exactly one owner-scoped policy on %s and no other',
      async (table) => {
        const policies = await sql<{ policyname: string; qual: string | null }[]>`
          SELECT policyname, qual
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = ${table}
        `;

        expect(policies).toHaveLength(1);

        // A public-read policy is recognisable by what its predicate does NOT
        // do: constrain the row to the current session's user.
        const policy = policies[0];
        expect(policy?.qual).toContain('app.current_user_id');
      },
    );

    it.each(OWNER_ONLY_TABLES)(
      'exposes no is_public column on %s that a policy could later key off',
      async (table) => {
        const columns = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
        `;

        const names = columns.map((c) => c.column_name);
        expect(names.length).toBeGreaterThan(0);
        expect(names).not.toContain('is_public');
        expect(names).not.toContain('visibility');
      },
    );
  });

  // Row 15 — data-access-policy.md §1
  describe('row 15: RLS is enabled AND forced on every traveller-owned table', () => {
    it('leaves no traveller-owned table unpoliced', async () => {
      const tables = await sql<
        { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`
        SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname
      `;

      expect(tables.length).toBeGreaterThan(0);

      const unprotected = tables
        .filter((t) => !UNPOLICED_BY_DESIGN.has(t.relname))
        .filter((t) => !t.relrowsecurity || !t.relforcerowsecurity)
        .map((t) => t.relname);

      expect(unprotected).toEqual([]);
    });

    it('gives every policed table at least one policy', async () => {
      const withoutPolicies = await sql<{ relname: string }[]>`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relrowsecurity
          AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
        ORDER BY c.relname
      `;

      // RLS enabled with no policy denies everything, which fails safe but would
      // silently break a story. Enabled means policed, not merely closed.
      expect(withoutPolicies.map((t) => t.relname)).toEqual([]);
    });
  });

  // Row 16 — data-access-policy.md §1
  describe('row 16: the API role is not a superuser and cannot alter policies', () => {
    it('exists, and is neither superuser nor able to bypass RLS', async () => {
      const roles = await sql<
        {
          rolsuper: boolean;
          rolbypassrls: boolean;
          rolcreaterole: boolean;
          rolcreatedb: boolean;
        }[]
      >`
        SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
        FROM pg_roles
        WHERE rolname = ${API_ROLE}
      `;

      expect(roles).toHaveLength(1);

      const role = roles[0];
      expect(role?.rolsuper).toBe(false);
      expect(role?.rolbypassrls).toBe(false);
      expect(role?.rolcreaterole).toBe(false);
      expect(role?.rolcreatedb).toBe(false);
    });

    it('does not own any table, so FORCE is not the only thing standing in the way', async () => {
      const owned = await sql<{ relname: string }[]>`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_roles r ON r.oid = c.relowner
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND r.rolname = ${API_ROLE}
      `;

      expect(owned.map((t) => t.relname)).toEqual([]);
    });

    it('cannot create a table in public, and so cannot manufacture an unpoliced one', async () => {
      const rows = await sql<{ has_create: boolean }[]>`
        SELECT has_schema_privilege(${API_ROLE}, 'public', 'CREATE') AS has_create
      `;

      expect(rows[0]?.has_create).toBe(false);
    });
  });
});
