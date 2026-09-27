import { createHarness, type Harness } from './harness';

/**
 * Proves the fixture itself (T037) before any suite relies on it.
 *
 * A broken harness produces failures in every downstream spec that look like
 * policy bugs, so it is worth one file establishing that the two accounts exist,
 * that reads go through the API role, and that identity actually reaches the
 * policies.
 */
describe('integration harness', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    // Guarded: if createHarness threw, every test already failed for that reason,
    // and an unguarded close() would bury it under a second, unrelated error.
    await harness?.close();
  });

  it('seeds two distinct accounts, each with a private and a public trip', () => {
    expect(harness.accountA.id).not.toBe(harness.accountB.id);
    expect(harness.accountA.privateTripId).toBeTruthy();
    expect(harness.accountB.publicTripId).toBeTruthy();
  });

  it('connects as the non-superuser API role, which RLS actually constrains', async () => {
    // Arrange + Act
    const rows = await harness.api<{ role: string; superuser: boolean }[]>`
      SELECT current_user AS role, usesuper AS superuser
      FROM pg_user WHERE usename = current_user
    `;

    // Assert — reading as a superuser would silently bypass every policy.
    expect(rows[0]?.role).toBe('triptrackr_api');
    expect(rows[0]?.superuser).toBe(false);
  });

  it('gives a traveller their own trips when identified', async () => {
    // Arrange + Act
    const rows = await harness.asUser(
      harness.accountA.id,
      (tx) =>
        tx<
          { id: string }[]
        >`SELECT id FROM trips WHERE owner_id = ${harness.accountA.id}::uuid`,
    );

    // Assert — both of this fixture's trips, and only A's. Every spec file
    // builds its own harness against the shared database, so A may own more
    // trips than these two by the time this runs; none of them may be B's.
    const ids = rows.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        harness.accountA.privateTripId,
        harness.accountA.publicTripId,
      ]),
    );
    expect(ids).not.toContain(harness.accountB.privateTripId);
    expect(ids).not.toContain(harness.accountB.publicTripId);
  });

  it("does not give traveller B traveller A's private trip", async () => {
    // Arrange + Act — the assertion the two-account fixture exists for.
    const rows = await harness.asUser(
      harness.accountB.id,
      (tx) =>
        tx<
          { id: string }[]
        >`SELECT id FROM trips WHERE id = ${harness.accountA.privateTripId}::uuid`,
    );

    // Assert
    expect(rows).toHaveLength(0);
  });

  it('installs PostGIS geography, not bare coordinates', async () => {
    // Arrange + Act
    const rows = await harness.owner<{ srid: number; kind: string }[]>`
      SELECT ST_SRID(location) AS srid, ST_GeometryType(location::geometry) AS kind
      FROM cities WHERE id = 1
    `;

    // Assert
    expect(rows[0]?.srid).toBe(4326);
    expect(rows[0]?.kind).toBe('ST_Point');
  });
});
