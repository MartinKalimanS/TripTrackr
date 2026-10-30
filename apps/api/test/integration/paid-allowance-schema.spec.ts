import { randomUUID } from 'node:crypto';

import type { Sql } from 'postgres';

import { apiSql, ensureMigrated, migrationSql } from '../support/db';

/**
 * The schema of the paid trip allowance (spec 014; data-model.md; research D14-02, D14-04, D14-05).
 *
 * The guarantees are in the database, not only in the service: a credit can be spent once, a Tier 1
 * year cannot be over-spent or spent after it ends, a spent cover survives the tombstone purge of its
 * trip, and the API role can write nothing but the cover and its own shadow row.
 */
const TABLES = [
  'trip_credits',
  'subscription_periods',
  'trip_covers',
  'allowance_shadow',
] as const;

describe('paid allowance schema', () => {
  let owner: Sql;
  let api: Sql;

  beforeAll(async () => {
    await ensureMigrated();
    owner = migrationSql();
    api = apiSql();
  });

  afterAll(async () => {
    await api?.end();
    await owner?.end();
  });

  async function newUser(): Promise<string> {
    const id = randomUUID();
    await owner`
      INSERT INTO users (id, email, display_name, home_currency)
      VALUES (${id}::uuid, ${`${id}@example.test`}, 'Schema test', 'EUR')`;
    return id;
  }

  async function newCredit(userId: string): Promise<string> {
    const [row] = await owner<{ id: string }[]>`
      INSERT INTO trip_credits (user_id, provider, transaction_id, product_id, purchased_at)
      VALUES (${userId}::uuid, 'app_store', ${randomUUID()}, 'single_trip', now())
      RETURNING id`;
    return (row as { id: string }).id;
  }

  async function newPeriod(
    userId: string,
    options: { tier?: string; uses?: number | null; endsInDays?: number } = {},
  ): Promise<string> {
    const tier = options.tier ?? 'tier1';
    const uses = options.uses === undefined ? 10 : options.uses;
    const endsInDays = options.endsInDays ?? 365;
    const [row] = await owner<{ id: string }[]>`
      INSERT INTO subscription_periods
        (user_id, provider, tier, ladder_step, original_transaction_id, transaction_id, starts_at, ends_at, uses_total)
      VALUES (${userId}::uuid, 'app_store', ${tier}, 1, ${randomUUID()}, ${randomUUID()},
              now() + ${`${endsInDays - 365} days`}::interval, now() + ${`${endsInDays} days`}::interval, ${uses})
      RETURNING id`;
    return (row as { id: string }).id;
  }

  const cover = (
    userId: string,
    source: string,
    ids: { credit?: string; period?: string } = {},
  ) => owner`
    INSERT INTO trip_covers (user_id, trip_id, source, credit_id, period_id)
    VALUES (${userId}::uuid, ${randomUUID()}::uuid, ${source},
            ${ids.credit ?? null}, ${ids.period ?? null})`;

  describe('row level security and grants (D14-05)', () => {
    test.each(TABLES)('%s has row level security enabled and forced', async (table) => {
      const [row] = await owner<{ on: boolean; forced: boolean }[]>`
        SELECT relrowsecurity AS on, relforcerowsecurity AS forced
        FROM pg_class WHERE relname = ${table} AND relkind = 'r'`;

      expect(row).toEqual({ on: true, forced: true });
    });

    test('the API role holds exactly the privileges the design gives it', async () => {
      const rows = await owner<{ table_name: string; privilege_type: string }[]>`
        SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'triptrackr_api' AND table_name = ANY(${[...TABLES]})
        ORDER BY table_name, privilege_type`;

      const grants: Record<string, string[]> = {};
      for (const row of rows) {
        (grants[row.table_name] ??= []).push(row.privilege_type);
      }
      expect(grants).toEqual({
        allowance_shadow: ['INSERT', 'SELECT', 'UPDATE'],
        subscription_periods: ['SELECT'],
        trip_covers: ['INSERT', 'SELECT'],
        trip_credits: ['SELECT'],
      });
    });

    test('the API role cannot read another traveller commerce rows', async () => {
      const mine = await newUser();
      const theirs = await newUser();
      await newCredit(theirs);

      const rows = await api.begin(async (tx) => {
        await tx`SELECT set_config('app.current_user_id', ${mine}, true)`;
        return tx`SELECT id FROM trip_credits`;
      });

      expect(rows).toHaveLength(0);
    });
  });

  describe('single-trip credits (FR-023)', () => {
    test('a store transaction id can be granted only once', async () => {
      const userId = await newUser();
      const txn = randomUUID();
      const insert = () => owner`
        INSERT INTO trip_credits (user_id, provider, transaction_id, product_id, purchased_at)
        VALUES (${userId}::uuid, 'play_store', ${txn}, 'single_trip', now())`;

      await insert();

      await expect(insert()).rejects.toThrow(/trip_credits_transaction_id/);
    });

    test('a credit can be spent by one trip only', async () => {
      const userId = await newUser();
      const credit = await newCredit(userId);

      await cover(userId, 'credit', { credit });

      await expect(cover(userId, 'credit', { credit })).rejects.toThrow(
        /trip_covers_credit_id/,
      );
    });
  });

  describe('trip covers', () => {
    test('a trip can be covered once, whatever covered it', async () => {
      const userId = await newUser();
      const tripId = randomUUID();
      const insert = () => owner`
        INSERT INTO trip_covers (user_id, trip_id, source)
        VALUES (${userId}::uuid, ${tripId}::uuid, 'grandfathered')`;

      await insert();

      await expect(insert()).rejects.toThrow(/trip_covers_trip_id/);
    });

    test.each([
      ['credit without a credit id', 'credit', {}],
      ['year without a period', 'year', {}],
      ['grandfathered with a credit', 'grandfathered', 'credit'],
    ])('refuses %s', async (_label, source, ids) => {
      const userId = await newUser();
      const extra = ids === 'credit' ? { credit: await newCredit(userId) } : {};

      await expect(cover(userId, source as string, extra)).rejects.toThrow(
        /trip_covers_source_check/,
      );
    });
  });

  describe('Tier 1 year guard (D14-04)', () => {
    test('the eleventh cover of a year of ten is refused', async () => {
      const userId = await newUser();
      const period = await newPeriod(userId);
      for (let i = 0; i < 10; i += 1) await cover(userId, 'year', { period });

      await expect(cover(userId, 'year', { period })).rejects.toThrow(/no uses left/);
    });

    test('a cover after the year ended is refused', async () => {
      const userId = await newUser();
      const period = await newPeriod(userId, { endsInDays: -1 });

      await expect(cover(userId, 'year', { period })).rejects.toThrow(/not active/);
    });

    test('an Unlimited period has no use count to exceed', async () => {
      const userId = await newUser();
      const period = await newPeriod(userId, { tier: 'unlimited', uses: null });

      for (let i = 0; i < 25; i += 1) await cover(userId, 'unlimited', { period });
    });

    test('a refunded year covers nothing more', async () => {
      const userId = await newUser();
      const period = await newPeriod(userId);
      await owner`UPDATE subscription_periods SET refunded_at = now() WHERE id = ${period}::uuid`;

      await expect(cover(userId, 'year', { period })).rejects.toThrow(/not active/);
    });

    test('a Tier 1 period must carry a use count and an Unlimited one must not', async () => {
      const userId = await newUser();

      await expect(newPeriod(userId, { tier: 'tier1', uses: null })).rejects.toThrow(
        /subscription_periods_uses_check/,
      );
      await expect(newPeriod(userId, { tier: 'unlimited', uses: 10 })).rejects.toThrow(
        /subscription_periods_uses_check/,
      );
    });
  });

  describe('the API role cannot mint or alter commerce', () => {
    test.each([
      [
        'a credit',
        "INSERT INTO trip_credits (user_id, provider, transaction_id, product_id, purchased_at) VALUES ($1::uuid, 'app_store', 'x', 'p', now())",
      ],
      [
        'a subscription year',
        "INSERT INTO subscription_periods (user_id, provider, tier, ladder_step, original_transaction_id, transaction_id, starts_at, ends_at, uses_total) VALUES ($1::uuid, 'app_store', 'tier1', 1, 'o', 't', now(), now() + interval '1 year', 10)",
      ],
      ['an erased cover', 'DELETE FROM trip_covers WHERE user_id = $1::uuid'],
      [
        'an edited cover',
        "UPDATE trip_covers SET source = 'unlimited' WHERE user_id = $1::uuid",
      ],
    ])('refuses %s', async (_label, statement) => {
      const userId = await newUser();

      await expect(
        api.begin(async (tx) => {
          await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
          await tx.unsafe(statement, [userId]);
        }),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('the spend ledger outlives its trip (D14-02)', () => {
    test('deleting the trip row leaves the cover', async () => {
      const userId = await newUser();
      const credit = await newCredit(userId);
      const [trip] = await owner<{ id: string }[]>`
        INSERT INTO trips (owner_id, title, home_currency)
        VALUES (${userId}::uuid, 'Purged', 'EUR') RETURNING id`;
      const tripId = (trip as { id: string }).id;
      await owner`
        INSERT INTO trip_covers (user_id, trip_id, source, credit_id)
        VALUES (${userId}::uuid, ${tripId}::uuid, 'credit', ${credit}::uuid)`;

      await owner`DELETE FROM trips WHERE id = ${tripId}::uuid`;

      const rows = await owner`SELECT 1 FROM trip_covers WHERE trip_id = ${tripId}::uuid`;
      expect(rows).toHaveLength(1);
    });

    test('deleting the account removes every commerce row', async () => {
      const userId = await newUser();
      const credit = await newCredit(userId);
      const period = await newPeriod(userId);
      await cover(userId, 'credit', { credit });
      await cover(userId, 'year', { period });
      await owner`INSERT INTO allowance_shadow (user_id, first_blocked_at, attempts)
                  VALUES (${userId}::uuid, now(), 1)`;

      await owner`DELETE FROM users WHERE id = ${userId}::uuid`;

      for (const table of TABLES) {
        const rows = await owner.unsafe(
          `SELECT 1 FROM ${table} WHERE user_id = $1::uuid`,
          [userId],
        );
        expect(rows).toHaveLength(0);
      }
    });
  });
});
