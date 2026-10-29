import { createHarness, type Harness } from '../integration/harness';

/**
 * Adversarial suite: B reaches A's data exports by no route (spec 009; FR-007; migration 0015).
 *
 * An export row names the archive of A's whole life: its existence, its time and the object key of
 * a zip with A's documents in the clear. `data_exports_owner_only` is its one policy: no
 * public-read counterpart, no visibility column (the catalogue asserts both for every table), so as
 * B, against A, at the database through the API role, the row does not exist, for reading or for
 * writing, whatever a request path does. The keyholes of the daily cleanup are the only other door:
 * they answer only for archives that have already expired.
 *
 * The positive controls (A sees A's row; the keyhole lists an expired one) are what make "empty"
 * mean something.
 */
describe('privacy — data exports are reachable by no route but the owner’s', () => {
  let harness: Harness;
  let A: string;
  let B: string;
  let exportId: string;

  beforeAll(async () => {
    harness = await createHarness();
    A = harness.accountA.id;
    B = harness.accountB.id;
    const [row] = await harness.owner<{ id: string }[]>`
      INSERT INTO data_exports (user_id, status, object_key, expires_at)
      VALUES (${A}::uuid, 'ready', ${`${A}/exports/fixture.zip`}, now() + interval '1 hour')
      RETURNING id
    `;
    if (!row) throw new Error('The export fixture was not inserted.');
    exportId = row.id;
  });

  afterAll(async () => {
    if (!harness) return;
    await harness.owner`DELETE FROM data_exports WHERE id = ${exportId}::uuid`;
    await harness.close();
  });

  it('A sees their own export, including its object key (the control)', async () => {
    const asA = await harness.asUser(
      A,
      (tx) => tx`SELECT id, object_key FROM data_exports WHERE id = ${exportId}::uuid`,
    );
    expect(asA).toHaveLength(1);
  });

  it('B reading A’s export by id, by user or by listing gets nothing', async () => {
    for (const read of [
      (tx: Parameters<Parameters<typeof harness.asUser>[1]>[0]) =>
        tx`SELECT id FROM data_exports WHERE id = ${exportId}::uuid`,
      (tx: Parameters<Parameters<typeof harness.asUser>[1]>[0]) =>
        tx`SELECT id FROM data_exports WHERE user_id = ${A}::uuid`,
      (tx: Parameters<Parameters<typeof harness.asUser>[1]>[0]) =>
        tx`SELECT id, object_key FROM data_exports`,
    ]) {
      expect(await harness.asUser(B, read)).toHaveLength(0);
    }
  });

  it('with no identity at all the row does not exist either', async () => {
    // Without an identity the policy predicate either refuses or shows nothing; never the row.
    const rows = await harness.api<{ id: string }[]>`SELECT id FROM data_exports`.catch(
      () => [] as { id: string }[],
    );
    expect(rows).toHaveLength(0);
  });

  it('B’s UPDATE and DELETE of A’s export touch nothing, and B cannot write a row for A', async () => {
    const updated = await harness.asUser(
      B,
      (tx) => tx`
        UPDATE data_exports SET status = 'failed' WHERE id = ${exportId}::uuid RETURNING id
      `,
    );
    const deleted = await harness.asUser(
      B,
      (tx) => tx`DELETE FROM data_exports WHERE id = ${exportId}::uuid RETURNING id`,
    );
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);

    await expect(
      harness.asUser(
        B,
        (tx) => tx`INSERT INTO data_exports (user_id) VALUES (${A}::uuid)`,
      ),
    ).rejects.toThrow();

    const [still] = await harness.owner<{ status: string }[]>`
      SELECT status FROM data_exports WHERE id = ${exportId}::uuid
    `;
    expect(still?.status).toBe('ready');
  });

  it('the cleanup keyholes list only archives that have expired, and expire only those', async () => {
    const live = await harness.api<
      { export_id: string }[]
    >`SELECT export_id FROM data_exports_expired()`;
    expect(live.map((row) => row.export_id)).not.toContain(exportId);

    // Naming a live archive to the second keyhole expires nothing.
    const [result] = await harness.api<{ n: string }[]>`
      SELECT data_exports_mark_expired(ARRAY[${exportId}::uuid])::text AS n
    `;
    expect(result?.n).toBe('0');
    const [row] = await harness.owner<{ status: string }[]>`
      SELECT status FROM data_exports WHERE id = ${exportId}::uuid
    `;
    expect(row?.status).toBe('ready');
  });

  it('the keyholes are callable by the API role only, never by PUBLIC', async () => {
    const acls = await harness.owner<{ acl: string }[]>`
      SELECT proacl::text AS acl FROM pg_proc
      WHERE proname IN ('data_exports_expired', 'data_exports_mark_expired')
    `;
    expect(acls).toHaveLength(2);
    for (const { acl } of acls) {
      expect(acl).toContain('triptrackr_api=X');
      expect(acl).not.toMatch(/[{,]=X/);
    }
  });
});
