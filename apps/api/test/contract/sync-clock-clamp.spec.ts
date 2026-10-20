import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { SYNC_CLOCK_TOLERANCE_MS } from '@/modules/sync/push-conflict';

import { bootTestApp, registerTraveller, type RegisteredTraveller } from '../support/app';
import { createTripFor } from '../support/expenses';
import { createHarness, type Harness } from '../integration/harness';
import {
  minutesAgo,
  noteRecord,
  pushOne,
  requireRow,
  tripRecord,
} from '../support/sync-push-fixtures';

/**
 * Contract test — an `updated_at` beyond the tolerance ahead of server time is
 * clamped to receipt time, and the clamping is logged (tasks.md T125;
 * sync-protocol.md §2 "Server clock decides, not device clock"; research D-02).
 *
 * This is the spec's "the device with the older clock syncs second" case seen
 * from the other side: a naive timestamp comparison lets a device whose clock
 * runs ahead win every conflict it ever touches, because its edits always look
 * newer. The server therefore never stores a time further ahead than the
 * tolerance, and says so in its log so a device that keeps doing it is found.
 *
 * What the log carries is pinned as tightly as what it does: the table, the
 * record id and the skew in seconds — never a field of the record. A note's
 * body is the traveller's journal.
 */
describe('contract — the server clock decides (clock clamp)', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let tripId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'Clock fixture');
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const inFuture = (ms: number): string => new Date(Date.now() + ms).toISOString();
  const stored = (table: 'notes' | 'trips', id: string) =>
    requireRow(harness.owner, table, id);

  /** The structured clamp lines logged so far, however many arguments carried them. */
  const clampLines = (warn: jest.SpyInstance): Record<string, unknown>[] =>
    warn.mock.calls
      .flat()
      .filter(
        (arg): arg is Record<string, unknown> =>
          typeof arg === 'object' &&
          arg !== null &&
          (arg as { event?: unknown }).event === 'sync.clock_clamped',
      );

  it('stores the receipt time for a record dated a day ahead, and logs it', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const note = noteRecord(tripId, {
      title: 'A private title',
      body: 'A private journal entry',
      updated_at: inFuture(24 * 3_600_000),
    });

    const before = Date.now();
    const result = await pushOne(app, a, 'notes', note);
    const after = Date.now();

    expect(result).toEqual({ id: note.id, status: 'applied' });
    const storedAt = (await stored('notes', note.id as string)).updated_at as Date;
    expect(storedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(storedAt.getTime()).toBeLessThanOrEqual(after);

    const lines = clampLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'sync.clock_clamped',
      table: 'notes',
      record_id: note.id,
    });
    expect(Math.abs((lines[0]?.skew_seconds as number) - 86_400)).toBeLessThan(30);
  });

  it('logs nothing of what the record says', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const note = noteRecord(tripId, {
      title: 'SECRET-TITLE',
      body: 'SECRET-BODY',
      updated_at: inFuture(3_600_000),
    });

    await pushOne(app, a, 'notes', note);

    const logged = JSON.stringify(warn.mock.calls);
    expect(clampLines(warn)).toHaveLength(1);
    expect(logged).not.toContain('SECRET-TITLE');
    expect(logged).not.toContain('SECRET-BODY');
  });

  it('clamps an insert of any table, not only notes', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const trip = tripRecord({ updated_at: inFuture(7 * 24 * 3_600_000) });

    const before = Date.now();
    await pushOne(app, a, 'trips', trip);

    expect(
      ((await stored('trips', trip.id as string)).updated_at as Date).getTime(),
    ).toBeLessThanOrEqual(Date.now());
    expect(
      ((await stored('trips', trip.id as string)).updated_at as Date).getTime(),
    ).toBeGreaterThanOrEqual(before);
    expect(clampLines(warn)).toEqual([
      expect.objectContaining({ table: 'trips', record_id: trip.id }),
    ]);
  });

  it('keeps a timestamp inside the tolerance exactly as sent, and logs nothing', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const sent = inFuture(SYNC_CLOCK_TOLERANCE_MS - 60_000);
    const note = noteRecord(tripId, { updated_at: sent });

    await pushOne(app, a, 'notes', note);

    expect(
      ((await stored('notes', note.id as string)).updated_at as Date).toISOString(),
    ).toBe(sent);
    expect(clampLines(warn)).toHaveLength(0);
  });

  it('never alters a timestamp in the past: an old clock loses, it is not corrected', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const sent = minutesAgo(60 * 24 * 400);
    const note = noteRecord(tripId, { updated_at: sent });

    await pushOne(app, a, 'notes', note);

    expect(
      ((await stored('notes', note.id as string)).updated_at as Date).toISOString(),
    ).toBe(sent);
    expect(clampLines(warn)).toHaveLength(0);
  });

  it('does not let a device living in the future shadow an honest edit made after it', async () => {
    // Device X's clock is a day fast; device Y is right. X pushes first.
    const note = noteRecord(tripId, {
      body: 'From the fast clock',
      updated_at: inFuture(24 * 3_600_000),
    });
    await pushOne(app, a, 'notes', note);

    // Y edits a second later by the real clock. Unclamped, X's "tomorrow"
    // would beat it; clamped, X's edit is dated when the server received it.
    const honest = {
      ...note,
      body: 'From the honest clock',
      updated_at: inFuture(2_000),
    };

    await expect(pushOne(app, a, 'notes', honest)).resolves.toEqual({
      id: note.id,
      status: 'applied',
    });
    expect((await stored('notes', note.id as string)).body).toBe('From the honest clock');
  });

  it('clamps a future-dated tombstone too: deleted_at is when the server learned of it', async () => {
    const note = noteRecord(tripId, { updated_at: minutesAgo(60) });
    await pushOne(app, a, 'notes', note);

    const before = Date.now();
    await pushOne(app, a, 'notes', {
      ...note,
      deleted: true,
      updated_at: inFuture(24 * 3_600_000),
    });

    const row = await stored('notes', note.id as string);
    expect((row.updated_at as Date).getTime()).toBeLessThanOrEqual(Date.now());
    expect((row.deleted_at as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((row.deleted_at as Date).getTime()).toBeLessThanOrEqual(Date.now());
  });
});
