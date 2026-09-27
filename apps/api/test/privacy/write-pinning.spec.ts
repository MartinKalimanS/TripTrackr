import type { Sql } from 'postgres';

import { API_ROLE } from '../support/db';
import { createHarness, type Harness } from '../integration/harness';

/**
 * Adversarial suite rows 18, 19 and 20 — "Write policies must pin the actor"
 * (contracts/data-access-policy.md §2, added 2026-09-23; migration 0007).
 *
 * A permissive policy written with `USING` alone doubles as its own
 * `WITH CHECK`. That is correct where the column being tested *is* the
 * ownership column, and wrong wherever a row names two parties or has a shared
 * variant: under the scaffold's `follows_participant`, B could insert a row
 * claiming A as the follower, and under `expense_categories_owner_or_default`
 * anyone could rewrite the system rows everyone sees.
 *
 * Written as B, against A. The positive controls at the end of each block are
 * not decoration — a policy that denied *everything* would pass every refusal
 * below while breaking the product, and "fails closed" has to mean closed to the
 * wrong party rather than to everyone.
 *
 * Two shapes of refusal appear here and both are the intended one:
 *
 *   - an INSERT that fails `WITH CHECK` raises
 *     `new row violates row-level security policy`;
 *   - an UPDATE or DELETE whose target row the `USING` clause hides matches
 *     zero rows and raises nothing. Nothing about the row is disclosed, and the
 *     row is unchanged — the assertion is on both.
 */

/** Fixed, so a failure names something greppable. */
const SYSTEM_CATEGORY_ID = '33333333-3333-4333-8333-333333333333';

describe('privacy — write policies pin the actor', () => {
  let harness: Harness;
  let owner: Sql;
  let A: string;
  let B: string;

  beforeAll(async () => {
    harness = await createHarness();
    owner = harness.owner;
    A = harness.accountA.id;
    B = harness.accountB.id;

    // A system category — user_id IS NULL — readable by every traveller and
    // writable by none (data-model.md §6).
    await owner`
      INSERT INTO expense_categories (id, user_id, name, icon)
      VALUES (${SYSTEM_CATEGORY_ID}::uuid, NULL, 'Fixture Food', 'fork')
      ON CONFLICT DO NOTHING
    `;

    // A pending request from B to A, seeded by the owner so the test below can
    // try to accept it from the wrong side.
    await owner`
      INSERT INTO follows (follower_id, followee_id, status)
      VALUES (${B}::uuid, ${A}::uuid, 'pending')
      ON CONFLICT DO NOTHING
    `;
  });

  afterAll(async () => {
    await harness?.close();
  });

  // Row 18 — follows
  describe('row 18: a follow can only be requested as oneself and accepted by its target', () => {
    it('refuses B inserting a row that names A as the follower', async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO follows (follower_id, followee_id, status)
            VALUES (${A}::uuid, ${B}::uuid, 'pending')
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('refuses B creating a request that is already accepted', async () => {
      // FR-058: acceptance is the followee's decision. A request that arrives
      // pre-accepted has skipped it.
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO follows (follower_id, followee_id, status)
            VALUES (${B}::uuid, ${A}::uuid, 'accepted')
            ON CONFLICT (follower_id, followee_id) DO UPDATE SET status = 'accepted'
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('refuses B accepting the request B sent to A', async () => {
      // Act — B is the follower; only the followee may move it out of pending.
      const updated = await harness.asUser(
        B,
        (tx) => tx`
          UPDATE follows SET status = 'accepted'
          WHERE follower_id = ${B}::uuid AND followee_id = ${A}::uuid
        `,
      );

      // Assert — zero rows touched, and the row is exactly as seeded.
      expect(updated.count).toBe(0);

      const [row] = await owner<{ status: string }[]>`
        SELECT status FROM follows
        WHERE follower_id = ${B}::uuid AND followee_id = ${A}::uuid
      `;
      expect(row?.status).toBe('pending');
    });

    it('still lets B see the request they sent, and A the request they received', async () => {
      // Positive control for the read policy.
      const asB = await harness.asUser(
        B,
        (tx) => tx<{ status: string }[]>`
          SELECT status FROM follows WHERE follower_id = ${B}::uuid AND followee_id = ${A}::uuid
        `,
      );
      const asA = await harness.asUser(
        A,
        (tx) => tx<{ status: string }[]>`
          SELECT status FROM follows WHERE follower_id = ${B}::uuid AND followee_id = ${A}::uuid
        `,
      );

      expect(asB).toHaveLength(1);
      expect(asA).toHaveLength(1);
    });

    it('lets A, the followee, accept it', async () => {
      // Positive control for the update policy — the same statement B was
      // refused, from the party it is meant for.
      const updated = await harness.asUser(
        A,
        (tx) => tx`
          UPDATE follows SET status = 'accepted'
          WHERE follower_id = ${B}::uuid AND followee_id = ${A}::uuid
        `,
      );

      expect(updated.count).toBe(1);
    });
  });

  // Row 19 — expense_categories
  describe('row 19: system expense categories are read-only for every traveller', () => {
    it('refuses inserting a row with user_id IS NULL', async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO expense_categories (user_id, name) VALUES (NULL, 'Smuggled System Row')
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('refuses updating a system row', async () => {
      const updated = await harness.asUser(
        B,
        (tx) => tx`
          UPDATE expense_categories SET name = 'Hijacked'
          WHERE id = ${SYSTEM_CATEGORY_ID}::uuid
        `,
      );

      expect(updated.count).toBe(0);

      const [row] = await owner<{ name: string }[]>`
        SELECT name FROM expense_categories WHERE id = ${SYSTEM_CATEGORY_ID}::uuid
      `;
      expect(row?.name).toBe('Fixture Food');
    });

    it('refuses deleting a system row', async () => {
      const deleted = await harness.asUser(
        B,
        (tx) => tx`DELETE FROM expense_categories WHERE user_id IS NULL`,
      );

      expect(deleted.count).toBe(0);

      const remaining = await owner`
        SELECT id FROM expense_categories WHERE id = ${SYSTEM_CATEGORY_ID}::uuid
      `;
      expect(remaining).toHaveLength(1);
    });

    it("refuses B inserting a category in A's name", async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO expense_categories (user_id, name) VALUES (${A}::uuid, 'Planted On A')
          `,
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('still lets B read the system rows and manage their own', async () => {
      // Positive controls: the shared rows are visible, and a traveller's own
      // custom category goes in, changes, and comes out.
      const system = await harness.asUser(
        B,
        (tx) => tx<{ id: string }[]>`
          SELECT id FROM expense_categories WHERE id = ${SYSTEM_CATEGORY_ID}::uuid
        `,
      );
      expect(system).toHaveLength(1);

      const own = await harness.asUser(B, async (tx) => {
        const [inserted] = await tx<{ id: string }[]>`
          INSERT INTO expense_categories (user_id, name)
          VALUES (${B}::uuid, 'B Custom Category') RETURNING id
        `;
        if (!inserted) throw new Error('B could not create their own category');

        const updated = await tx`
          UPDATE expense_categories SET name = 'B Custom Category (renamed)'
          WHERE id = ${inserted.id}::uuid
        `;
        return updated.count;
      });

      expect(own).toBe(1);
    });
  });

  // Row 20 — refresh_tokens and subscriptions
  describe('row 20: credentials and entitlements cannot be written directly', () => {
    // The writes to these two tables go through SECURITY DEFINER functions
    // owned by the migration role (0006, 0007). A request path holding a valid
    // session must still be unable to mint itself a credential or an
    // entitlement by writing the row.

    it('refuses an authenticated INSERT into refresh_tokens', async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
            VALUES (${B}::uuid, 'minted-by-hand', now() + interval '30 days')
          `,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('refuses an authenticated INSERT into subscriptions', async () => {
      await expect(
        harness.asUser(
          B,
          (tx) => tx`
            INSERT INTO subscriptions (user_id, is_active, current_period_end)
            VALUES (${B}::uuid, true, now() + interval '1 year')
          `,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('refuses UPDATE and DELETE on both, even for rows the caller could read', async () => {
      // Seeded as the owner: a real subscription row for B, so the refusal is a
      // grant refusal and not an RLS "nothing matched".
      await owner`
        INSERT INTO subscriptions (user_id, is_active) VALUES (${B}::uuid, false)
        ON CONFLICT (user_id) DO NOTHING
      `;

      await expect(
        harness.asUser(
          B,
          (tx) =>
            tx`UPDATE subscriptions SET is_active = true WHERE user_id = ${B}::uuid`,
        ),
      ).rejects.toThrow(/permission denied/i);

      await expect(
        harness.asUser(
          B,
          (tx) => tx`DELETE FROM subscriptions WHERE user_id = ${B}::uuid`,
        ),
      ).rejects.toThrow(/permission denied/i);

      await expect(
        harness.asUser(
          B,
          (tx) =>
            tx`UPDATE refresh_tokens SET revoked_at = NULL WHERE user_id = ${B}::uuid`,
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('holds in the catalogue: the API role has no write privilege on either table', async () => {
      // The behavioural refusals above could also be produced by a policy. This
      // pins the mechanism the contract specifies — the grant is absent.
      const rows = await owner<
        { table_name: string; privilege: string; granted: boolean }[]
      >`
        SELECT t.table_name, p.privilege,
               has_table_privilege(${API_ROLE}, t.table_name, p.privilege) AS granted
        FROM (VALUES ('refresh_tokens'), ('subscriptions')) AS t(table_name)
        CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('SELECT')) AS p(privilege)
        ORDER BY t.table_name, p.privilege
      `;

      const writes = rows.filter((r) => r.privilege !== 'SELECT');
      const reads = rows.filter((r) => r.privilege === 'SELECT');

      expect(writes.every((r) => !r.granted)).toBe(true);
      expect(reads.every((r) => r.granted)).toBe(true);
    });

    it('still lets B read their own subscription row', async () => {
      // Positive control: SELECT-only means SELECT works.
      const rows = await harness.asUser(
        B,
        (tx) => tx<{ is_active: boolean }[]>`
          SELECT is_active FROM subscriptions WHERE user_id = ${B}::uuid
        `,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.is_active).toBe(false);
    });
  });
});
