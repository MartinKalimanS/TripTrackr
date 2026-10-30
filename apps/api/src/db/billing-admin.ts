import postgres, { type Sql } from 'postgres';

import { loadMigrationEnv } from '@/common/config/env.schema';

/**
 * Owner tools for switching charging on (spec 014, FR-026 to FR-029; research D14-07). Run with the
 * migration (owner) role: the API role cannot write covers on a traveller's behalf and must not.
 *
 *   npm run billing:shadow-report -w apps/api   how many travellers would have been stopped
 *   npm run billing:grandfather   -w apps/api   run ONCE, just before BILLING_ENFORCED=true
 */

export interface ShadowReport {
  /** Travellers who tried to create a trip past the free number while charging was off. */
  readonly travellers: number;
  /** Their create attempts in total. */
  readonly attempts: number;
  /** All travellers with an account, so the share can be read. */
  readonly accounts: number;
}

export async function shadowReport(sql: Sql): Promise<ShadowReport> {
  const [row] = await sql<{ travellers: number; attempts: number; accounts: number }[]>`
    SELECT (SELECT count(*)::int FROM allowance_shadow) AS travellers,
           (SELECT COALESCE(sum(attempts), 0)::int FROM allowance_shadow) AS attempts,
           (SELECT count(*)::int FROM users) AS accounts`;
  if (!row) throw new Error('The shadow report query returned no row.');
  return row;
}

/**
 * Every live trip that has no cover becomes a `grandfathered` cover (FR-029, option A), so the early
 * travellers keep what they recorded and nothing is flagged on the day charging starts. The shadow
 * counts are cleared: they described a world that no longer applies. Idempotent. Returns the number
 * of trips grandfathered by this run.
 */
export async function grandfatherExistingTrips(sql: Sql): Promise<number> {
  return sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO trip_covers (user_id, trip_id, source)
      SELECT t.owner_id, t.id, 'grandfathered' FROM trips t
      WHERE t.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM trip_covers c WHERE c.trip_id = t.id)
      ON CONFLICT (trip_id) DO NOTHING
      RETURNING trip_id`;
    await tx`DELETE FROM allowance_shadow`;
    return inserted.length;
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const sql = postgres(loadMigrationEnv().MIGRATION_DATABASE_URL, { max: 1 });
  try {
    if (command === 'shadow-report') {
      const report = await shadowReport(sql);
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else if (command === 'grandfather') {
      const count = await grandfatherExistingTrips(sql);
      process.stdout.write(`Grandfathered ${count} trips.\n`);
    } else {
      throw new Error('Usage: billing-admin.ts shadow-report | grandfather');
    }
  } finally {
    await sql.end();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
