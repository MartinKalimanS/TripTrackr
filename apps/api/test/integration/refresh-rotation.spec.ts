import { createHash, randomBytes } from 'node:crypto';
import postgres, { type Sql, type TransactionSql } from 'postgres';

import { requireEnv } from '../support/env';
import { createHarness, type Harness } from './harness';

/**
 * Atomic refresh-token rotation (FR-005; 0007 `auth_consume_refresh_token`).
 *
 * The defect this guards against is a race: two requests presenting the same
 * refresh token in the same instant. Under 0006's read-then-revoke, both read
 * `revoked_at IS NULL`, both revoked, both minted — a stolen token replayed at
 * the moment of the legitimate refresh produced two live chains and no alarm.
 *
 * The race is staged, not hoped for. The first caller consumes the token and
 * then holds its transaction open; the second is started and observed, via
 * `pg_stat_activity`, to be blocked on the row lock; only then is the first
 * released. Whichever ordering the scheduler picks, exactly one caller may win,
 * and the loser must be told it lost — that is what `reused` means.
 *
 * Runs as the API role without a session variable, exactly as `/auth/refresh`
 * does: these are SECURITY DEFINER keyholes, reachable before authentication.
 */

const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

interface ConsumeRow {
  readonly id: string;
  readonly user_id: string;
  readonly expired: boolean;
  readonly reused: boolean;
}

describe('refresh token rotation is atomic', () => {
  let harness: Harness;
  /** Two connections, so two transactions can genuinely overlap. */
  let pool: Sql;

  beforeAll(async () => {
    harness = await createHarness();
    pool = postgres(requireEnv('DATABASE_URL'), { max: 2, onnotice: () => {} });
  });

  afterAll(async () => {
    await pool?.end();
    await harness?.close();
  });

  /** Seeds a live token for account A and returns its plaintext and row id. */
  async function seedToken(ttl = '1 day'): Promise<{ token: string; id: string }> {
    const token = randomBytes(32).toString('base64url');
    const [row] = await harness.owner<{ id: string }[]>`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (${harness.accountA.id}::uuid, ${hash(token)}, now() + ${ttl}::interval)
      RETURNING id
    `;
    if (!row) throw new Error('could not seed a refresh token');
    return { token, id: row.id };
  }

  // postgres.js types a transaction handle and a pool handle separately even
  // though both are the same tagged template; either may run the keyhole.
  const consume = (tx: Sql | TransactionSql, token: string) =>
    tx<ConsumeRow[]>`SELECT * FROM auth_consume_refresh_token(${hash(token)})`;

  it('consumes a live token once, and reports every later presentation as reuse', async () => {
    // Arrange
    const { token, id } = await seedToken();

    // Act
    const first = await consume(harness.api, token);
    const second = await consume(harness.api, token);
    const third = await consume(harness.api, token);

    // Assert
    expect([...first]).toEqual([
      { id, user_id: harness.accountA.id, expired: false, reused: false },
    ]);
    expect(second[0]?.reused).toBe(true);
    expect(third[0]?.reused).toBe(true);

    const [row] = await harness.owner<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM refresh_tokens WHERE id = ${id}::uuid
    `;
    expect(row?.revoked_at).not.toBeNull();
  });

  it('returns nothing at all for a hash it has never seen', async () => {
    const rows = await consume(harness.api, 'never-issued');

    expect(rows).toHaveLength(0);
  });

  it('consumes an expired token but reports it expired, so it cannot be replayed either', async () => {
    const { token } = await seedToken('-1 minute');

    const rows = await consume(harness.api, token);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.expired).toBe(true);
    expect(rows[0]?.reused).toBe(false);
  });

  it('lets exactly one of two concurrent presentations win', async () => {
    // Arrange
    const { token } = await seedToken();

    let releaseWinner: () => void = () => undefined;
    const winnerHolds = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });

    // Act — caller 1 consumes and then keeps its transaction open.
    const winner = pool.begin(async (tx) => {
      const rows = await consume(tx, token);
      await winnerHolds;
      return rows;
    });

    // Caller 2 starts once caller 1 holds the row lock, and blocks on it.
    await waitUntil(() => isConsumeInFlight(harness.owner, 1));
    const loser = pool.begin((tx) => consume(tx, token));
    await waitUntil(() => isWaitingOnLock(harness.owner));

    // Only now does caller 1 commit; caller 2's UPDATE re-evaluates against the
    // committed row, finds revoked_at set, and falls through to the reuse path.
    releaseWinner();
    const [winnerRows, loserRows] = await Promise.all([winner, loser]);

    // Assert
    expect(winnerRows[0]?.reused).toBe(false);
    expect(loserRows[0]?.reused).toBe(true);
    expect(loserRows[0]?.user_id).toBe(harness.accountA.id);
  });

  it('links the retired token forward to its successor (data-model.md §2)', async () => {
    // Arrange
    const { id: oldId } = await seedToken();
    const successor = randomBytes(32).toString('base64url');

    // Act — as the API role, the way TokenService.issueRefreshToken does it.
    const [inserted] = await harness.api<{ id: string }[]>`
      SELECT auth_insert_refresh_token(
        ${harness.accountA.id}::uuid, ${hash(successor)}, NULL, '30 days'::interval, ${oldId}::uuid
      ) AS id
    `;

    // Assert — the OLD row names the NEW one; the new row points at nothing yet.
    const rows = await harness.owner<{ id: string; replaced_by_id: string | null }[]>`
      SELECT id, replaced_by_id FROM refresh_tokens
      WHERE id IN (${oldId}::uuid, ${inserted?.id ?? oldId}::uuid)
    `;

    const oldRow = rows.find((r) => r.id === oldId);
    const newRow = rows.find((r) => r.id === inserted?.id);
    expect(oldRow?.replaced_by_id).toBe(inserted?.id);
    expect(newRow?.replaced_by_id).toBeNull();
  });
});

/** True once `n` sessions are inside `auth_consume_refresh_token`. */
async function isConsumeInFlight(owner: Sql, n: number): Promise<boolean> {
  const [row] = await owner<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE query ILIKE '%auth_consume_refresh_token%'
      AND state IN ('active', 'idle in transaction')
      AND pid <> pg_backend_pid()
  `;
  return (row?.count ?? 0) >= n;
}

/** True once some session is blocked on a row lock inside the consume. */
async function isWaitingOnLock(owner: Sql): Promise<boolean> {
  const [row] = await owner<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE wait_event_type = 'Lock'
      AND query ILIKE '%auth_consume_refresh_token%'
  `;
  return (row?.count ?? 0) >= 1;
}

async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for the staged race to reach its checkpoint.');
}
