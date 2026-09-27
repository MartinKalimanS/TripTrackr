import type { Sql } from 'postgres';

import { API_ROLE, apiSql, ensureMigrated, migrationSql } from '../support/db';

/**
 * Adversarial suite rows 14 to 17 (contracts/data-access-policy.md §4).
 *
 * These assert on `pg_catalog` and on the live connection rather than on
 * behaviour, and that is the whole point of them. The configuration mistakes in
 * §1 — a superuser API role, a missing FORCE, a public-read policy on a private
 * table, an API pointed at the owner's connection string — are *silent*: every
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

  // Row 17 — data-access-policy.md §1 "Deployment obligation" (research D-20)
  describe('row 17: DATABASE_URL connects as the API role, not the owner', () => {
    // Row 16 inspects the role as it is defined. This row inspects the role the
    // API is actually *using*. The scaffold passed 16 while every service ran as
    // the superuser owner, because 16 cannot see which connection string a
    // process was handed — only a query from inside that connection can.
    let api: Sql;

    beforeAll(() => {
      api = apiSql();
    });

    afterAll(async () => {
      await api?.end();
    });

    it('identifies as triptrackr_api from inside its own pool', async () => {
      // Arrange + Act — the connection is built from DATABASE_URL and nothing else.
      const rows = await api<
        { role: string; rolsuper: boolean; rolbypassrls: boolean }[]
      >`
        SELECT current_user AS role, r.rolsuper, r.rolbypassrls
        FROM pg_roles r
        WHERE r.rolname = current_user
      `;

      // Assert
      expect(rows).toHaveLength(1);
      expect(rows[0]?.role).toBe(API_ROLE);
      expect(rows[0]?.rolsuper).toBe(false);
      expect(rows[0]?.rolbypassrls).toBe(false);
    });

    it('is a different identity from the one the migrations connect as', async () => {
      // Two strings naming the same role would pass row 16 and the test above
      // while the API held every DDL and policy right the owner does.
      const [apiRow] = await api<{ role: string }[]>`SELECT current_user AS role`;
      const [ownerRow] = await sql<{ role: string }[]>`SELECT current_user AS role`;

      expect(apiRow?.role).toBe(API_ROLE);
      expect(ownerRow?.role).not.toBe(API_ROLE);
    });

    it('cannot see the owner-only policy machinery well enough to change it', async () => {
      // A policy-alter right is a table-owner right; being able to name the
      // policies is fine, being able to drop one is not.
      await expect(
        api.unsafe('DROP POLICY IF EXISTS expenses_owner_only ON expenses'),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });
  });
});
