import {
  SYNC_CLOCK_TOLERANCE_MS,
  clampToServerClock,
  resolveConflict,
  type ConflictVerdict,
} from '@/modules/sync/push-conflict';

/**
 * THE conflict rule (FR-040; research D-02; sync-protocol.md §2; tasks.md
 * T123, T125) as the pure function every table's push goes through.
 *
 * The table below is the whole rule. Every case names what the traveller would
 * see, because the point of writing it down as data is that a reviewer can read
 * it against scenarios 5 and 12 of the acceptance suite without reading code.
 */

const T0 = new Date('2026-08-26T10:00:00.000Z');
const at = (offsetMs: number): Date => new Date(T0.getTime() + offsetMs);

const live = (offsetMs: number) => ({ updatedAt: at(offsetMs), deleted: false });
const dead = (offsetMs: number) => ({ updatedAt: at(offsetMs), deleted: true });

const same = () => true;
const different = () => false;

describe('resolveConflict — the single implementation of last-write-wins', () => {
  describe('no stored row', () => {
    it('inserts a live record, keeping the incoming timestamp', () => {
      expect(resolveConflict(null, live(0), different)).toEqual({
        verdict: 'insert',
        updatedAt: at(0),
      });
    });

    it('inserts a tombstone too: a delete is an ordinary change (FR-039)', () => {
      expect(resolveConflict(null, dead(0), different)).toEqual({
        verdict: 'insert',
        updatedAt: at(0),
      });
    });
  });

  describe('a live stored row, a live incoming record', () => {
    it('applies an incoming record that is newer', () => {
      expect(resolveConflict(live(0), live(1), different)).toEqual({
        verdict: 'apply',
        updatedAt: at(1),
      });
    });

    it('applies a newer record even when the payload is identical (strictly newer wins)', () => {
      expect(resolveConflict(live(0), live(1), same)).toEqual({
        verdict: 'apply',
        updatedAt: at(1),
      });
    });

    it('answers an equal timestamp with an identical payload as a no-op: the lost-response retry', () => {
      expect(resolveConflict(live(0), live(0), same)).toEqual({ verdict: 'noop' });
    });

    it('refuses an equal timestamp with a different payload: the stored row wins', () => {
      expect(resolveConflict(live(0), live(0), different)).toEqual({
        verdict: 'conflict',
      });
    });

    it('refuses an older record whatever its payload', () => {
      expect(resolveConflict(live(10), live(9), different)).toEqual({
        verdict: 'conflict',
      });
      expect(resolveConflict(live(10), live(9), same)).toEqual({ verdict: 'conflict' });
    });

    it('does not compare payloads unless the timestamps tie', () => {
      const payload = jest.fn(() => true);

      resolveConflict(live(0), live(1), payload);
      resolveConflict(live(1), live(0), payload);

      expect(payload).not.toHaveBeenCalled();
    });
  });

  describe('a live stored row, a tombstone incoming (delete wins)', () => {
    it('applies a newer tombstone', () => {
      expect(resolveConflict(live(0), dead(5), different)).toEqual({
        verdict: 'apply',
        updatedAt: at(5),
      });
    });

    it('applies an OLDER tombstone too, moving the row past the version other devices hold', () => {
      // Scenario 12: device A deletes at 10:00:00, device B edited at 10:00:30
      // and synced first. The outcome must not depend on who synced first.
      const verdict = resolveConflict(live(30_000), dead(0), different);

      expect(verdict).toEqual({ verdict: 'apply', updatedAt: at(30_001) });
    });

    it('applies an equal-timestamp tombstone, strictly after what was stored', () => {
      expect(resolveConflict(live(0), dead(0), same)).toEqual({
        verdict: 'apply',
        updatedAt: at(1),
      });
    });
  });

  describe('a tombstoned stored row (no resurrection)', () => {
    it.each([
      ['newer than', 100],
      ['equal to', 0],
      ['older than', -100],
    ])('refuses a live record that is %s the tombstone', (_name, offset) => {
      expect(resolveConflict(dead(0), live(offset), different)).toEqual({
        verdict: 'conflict',
      });
      expect(resolveConflict(dead(0), live(offset), same)).toEqual({
        verdict: 'conflict',
      });
    });

    it.each([
      ['newer', 100],
      ['equal', 0],
      ['older', -100],
    ])(
      'answers a tombstone with a %s timestamp as a no-op: already deleted',
      (_name, offset) => {
        expect(resolveConflict(dead(0), dead(offset), different)).toEqual({
          verdict: 'noop',
        });
      },
    );
  });

  it('is deterministic: the same inputs give the same verdict', () => {
    const run = (): ConflictVerdict => resolveConflict(live(0), live(1), different);

    expect(run()).toEqual(run());
  });

  it('does not mutate what it is given', () => {
    const stored = Object.freeze(live(0));
    const incoming = Object.freeze(live(1));

    expect(() => resolveConflict(stored, incoming, different)).not.toThrow();
  });
});

describe('clampToServerClock — a wrong clock cannot win every conflict by living in the future', () => {
  const receivedAt = new Date('2026-08-26T12:00:00.000Z');

  it('publishes a tolerance of five minutes', () => {
    expect(SYNC_CLOCK_TOLERANCE_MS).toBe(5 * 60 * 1000);
  });

  it('leaves a past timestamp alone', () => {
    const incoming = new Date('2026-08-26T09:00:00.000Z');

    expect(clampToServerClock(incoming, receivedAt)).toEqual({
      updatedAt: incoming,
      clamped: false,
      skewSeconds: -10_800,
    });
  });

  it('leaves a timestamp inside the tolerance alone', () => {
    const incoming = new Date(receivedAt.getTime() + SYNC_CLOCK_TOLERANCE_MS);

    expect(clampToServerClock(incoming, receivedAt)).toMatchObject({
      updatedAt: incoming,
      clamped: false,
    });
  });

  it('clamps a timestamp one millisecond past the tolerance to the receipt time', () => {
    const incoming = new Date(receivedAt.getTime() + SYNC_CLOCK_TOLERANCE_MS + 1);

    expect(clampToServerClock(incoming, receivedAt)).toMatchObject({
      updatedAt: receivedAt,
      clamped: true,
    });
  });

  it('reports how far ahead the device was, in whole seconds', () => {
    const incoming = new Date(receivedAt.getTime() + 3_600_000);

    expect(clampToServerClock(incoming, receivedAt)).toEqual({
      updatedAt: receivedAt,
      clamped: true,
      skewSeconds: 3_600,
    });
  });

  it('honours an explicit tolerance', () => {
    const incoming = new Date(receivedAt.getTime() + 2_000);

    expect(clampToServerClock(incoming, receivedAt, 1_000)).toMatchObject({
      clamped: true,
    });
    expect(clampToServerClock(incoming, receivedAt, 2_000)).toMatchObject({
      clamped: false,
    });
  });
});
