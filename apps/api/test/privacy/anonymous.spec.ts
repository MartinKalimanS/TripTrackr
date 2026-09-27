import type { Sql } from 'postgres';

import { apiSql, ensureMigrated, migrationSql } from '../support/db';

/**
 * Adversarial suite row 13 (contracts/data-access-policy.md §4).
 *
 * "Any query with no session variable set fails closed, never returns rows."
 *
 * The mechanism is that every policy predicate calls
 * `current_setting('app.current_user_id')` WITHOUT the missing_ok argument. With
 * no variable set the call raises, and the statement aborts. The alternative —
 * `current_setting(..., true)`, which returns NULL when unset — would make every
 * predicate NULL, which SQL treats as "not true", which also returns nothing.
 * That looks identical until someone writes a policy with an `OR` or a `NOT` in
 * it, at which point NULL stops meaning "deny". Raising has no such edge.
 *
 * The fixture matters as much as the assertion: these tables are seeded with real
 * rows first, so that "returned nothing" cannot be confused with "there was
 * nothing to return".
 */
describe('privacy — anonymous access fails closed', () => {
  let seeded: Sql;
  let anon: Sql;

  beforeAll(async () => {
    await ensureMigrated();

    seeded = migrationSql();

    // Seeded as the migration role, which owns the tables and is exempt from the
    // policies. That exemption is why every assertion below reads through
    // apiSql() instead.
    await seeded`
      INSERT INTO users (id, email, display_name, home_currency, is_profile_public)
      VALUES (
        '00000000-0000-4000-8000-00000000000a',
        'anon-fixture@example.com',
        'Fixture Traveller',
        'USD',
        true
      )
      ON CONFLICT DO NOTHING
    `;

    // Public on purpose. If anything is reachable without a session, the most
    // likely candidate is the row someone deliberately published — so that is
    // exactly what this asserts is still unreachable.
    await seeded`
      INSERT INTO trips (id, owner_id, title, home_currency, is_public)
      VALUES (
        '00000000-0000-4000-8000-00000000000b',
        '00000000-0000-4000-8000-00000000000a',
        'Fixture Trip',
        'USD',
        true
      )
      ON CONFLICT DO NOTHING
    `;

    anon = apiSql();
  });

  afterAll(async () => {
    await seeded?.end();
    await anon?.end();
  });

  it('confirms the fixture rows really exist, so an empty result means something', async () => {
    const users = await seeded`
      SELECT id FROM users WHERE id = '00000000-0000-4000-8000-00000000000a'
    `;
    const trips = await seeded`
      SELECT id FROM trips WHERE id = '00000000-0000-4000-8000-00000000000b'
    `;

    expect(users).toHaveLength(1);
    expect(trips).toHaveLength(1);
  });

  // Every traveller-owned table, not a representative sample. A policy is added
  // one table at a time, and this is the assertion that a new one cannot skip.
  const OWNED_TABLES = [
    'users',
    'oauth_identities',
    'refresh_tokens',
    'email_verification_tokens',
    'password_reset_tokens',
    'trips',
    'trip_stops',
    'notes',
    'photos',
    'documents',
    'expense_categories',
    'expenses',
    'itinerary_days',
    'itinerary_items',
    'planner_requests',
    'follows',
    'blocks',
    'reports',
    'subscriptions',
  ] as const;

  it.each(OWNED_TABLES)(
    'refuses a SELECT on %s when no session user id is set',
    async (table) => {
      await expect(anon.unsafe(`SELECT * FROM ${table}`)).rejects.toThrow(
        /unrecognized configuration parameter|app\.current_user_id/i,
      );
    },
  );

  it('refuses the published trip too — being public is not a way around the session', async () => {
    await expect(
      anon`SELECT id, title FROM trips WHERE is_public = true`,
    ).rejects.toThrow(/app\.current_user_id/i);
  });

  it('refuses a write as firmly as a read', async () => {
    await expect(
      anon`
        INSERT INTO trips (owner_id, title, home_currency)
        VALUES ('00000000-0000-4000-8000-00000000000a', 'Smuggled', 'USD')
      `,
    ).rejects.toThrow(/app\.current_user_id/i);
  });

  it('starts returning rows only once a session identity is set', async () => {
    // The mirror image of the assertions above. Without it, a policy that denied
    // everything unconditionally would pass this whole file while breaking the
    // product — "fails closed" has to mean closed to strangers, not closed to
    // everyone.
    const rows = await anon.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', '00000000-0000-4000-8000-00000000000a', true)`;
      return tx`SELECT id, title FROM trips WHERE id = '00000000-0000-4000-8000-00000000000b'`;
    });

    expect(rows).toHaveLength(1);
  });

  it('forgets the identity again once the transaction ends', async () => {
    // set_config(..., is_local => true) is the SQL spelling of SET LOCAL. This is
    // what stops a pooled connection carrying one traveller's identity into the
    // next request that borrows it (§1).
    await anon.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', '00000000-0000-4000-8000-00000000000a', true)`;
      return tx`SELECT 1`;
    });

    // Note the failure mode changes here, and the difference is worth naming.
    // Before the variable has ever been set, `current_setting` raises
    // "unrecognized configuration parameter". Afterwards the GUC is *known* to
    // the session and reverting it yields the EMPTY STRING rather than unsetting
    // it — so the predicate fails on `''::uuid` instead.
    //
    // Both fail closed, but only because of the `::uuid` cast in every policy.
    // An empty string is a value, and a predicate that compared it as text would
    // quietly stop failing. That cast is load-bearing on a pooled connection.
    await expect(anon`SELECT id FROM trips`).rejects.toThrow(
      /invalid input syntax for type uuid/i,
    );
  });

  it('never returns a row on a reused connection, whichever way it fails', async () => {
    // The property that actually matters, stated without reference to a message:
    // no sequence of set-then-release leaves a readable row behind.
    await anon.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', '00000000-0000-4000-8000-00000000000a', true)`;
      return tx`SELECT id FROM trips`;
    });

    await expect(anon`SELECT id FROM trips`).rejects.toThrow();
    await expect(anon`SELECT id FROM users`).rejects.toThrow();
  });
});
