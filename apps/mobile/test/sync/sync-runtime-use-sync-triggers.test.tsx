/**
 * T135 — the hook that mounts the triggers for the signed-in shell.
 *
 * `startSyncTriggers` has its own suite; here it is a double, and what is
 * pinned is WHEN the shell binds it: only with a traveller AND an open
 * database, once per pair, and never past sign-out.
 */
import { renderHook } from '@testing-library/react-native';

import type { AppDatabase } from '@/db/client';
import { resetFirstLaunch, startSyncTriggers } from '@/sync/triggers';
import { useSyncTriggers } from '@/sync/use-sync-triggers';

jest.mock('@/sync/triggers', () => ({
  startSyncTriggers: jest.fn(),
  resetFirstLaunch: jest.fn(),
}));

const stop = jest.fn();
const dbA = { tag: 'a' } as unknown as AppDatabase;
const dbB = { tag: 'b' } as unknown as AppDatabase;

beforeEach(() => {
  (startSyncTriggers as jest.Mock).mockReset().mockReturnValue(stop);
  stop.mockReset();
});

type Props = { db: AppDatabase | null; userId: string | null };

describe('useSyncTriggers (T135)', () => {
  test('binds once the traveller AND their database exist, with both', async () => {
    await renderHook(({ db, userId }: Props) => useSyncTriggers(db, userId), {
      initialProps: { db: dbA, userId: 'ana' } as Props,
    });

    expect(startSyncTriggers).toHaveBeenCalledTimes(1);
    expect(startSyncTriggers).toHaveBeenCalledWith({ db: dbA, userId: 'ana' });
  });

  test('waits for the database to open', async () => {
    const { rerender } = await renderHook(
      ({ db, userId }: Props) => useSyncTriggers(db, userId),
      { initialProps: { db: null, userId: 'ana' } as Props },
    );
    expect(startSyncTriggers).not.toHaveBeenCalled();
    expect(resetFirstLaunch).not.toHaveBeenCalled();

    await rerender({ db: dbA, userId: 'ana' });

    expect(startSyncTriggers).toHaveBeenCalledTimes(1);
  });

  test('binds nothing for a signed-out shell, and forgets the first launch', async () => {
    await renderHook(({ db, userId }: Props) => useSyncTriggers(db, userId), {
      initialProps: { db: dbA, userId: null } as Props,
    });

    expect(startSyncTriggers).not.toHaveBeenCalled();
    expect(resetFirstLaunch).toHaveBeenCalledTimes(1);
  });

  test('a re-render with the same traveller and database does not restart it', async () => {
    const { rerender } = await renderHook(
      ({ db, userId }: Props) => useSyncTriggers(db, userId),
      { initialProps: { db: dbA, userId: 'ana' } as Props },
    );

    await rerender({ db: dbA, userId: 'ana' });

    expect(startSyncTriggers).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  test('unbinds on sign-out', async () => {
    const { rerender } = await renderHook(
      ({ db, userId }: Props) => useSyncTriggers(db, userId),
      { initialProps: { db: dbA, userId: 'ana' } as Props },
    );

    await rerender({ db: null, userId: null });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(resetFirstLaunch).toHaveBeenCalledTimes(1);
  });

  test('rebinds to a replaced database', async () => {
    const { rerender } = await renderHook(
      ({ db, userId }: Props) => useSyncTriggers(db, userId),
      { initialProps: { db: dbA, userId: 'ana' } as Props },
    );

    await rerender({ db: dbB, userId: 'ana' });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(startSyncTriggers).toHaveBeenLastCalledWith({ db: dbB, userId: 'ana' });
  });

  test('unbinds when the shell unmounts', async () => {
    const { unmount } = await renderHook(
      ({ db, userId }: Props) => useSyncTriggers(db, userId),
      { initialProps: { db: dbA, userId: 'ana' } as Props },
    );

    await unmount();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
