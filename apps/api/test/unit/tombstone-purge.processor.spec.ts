import type { Sql } from 'postgres';

import {
  TOMBSTONE_RETENTION_DAYS,
  purgeTombstones,
  type PurgeStorage,
} from '@/workers/tombstone-purge.processor';

/**
 * The tombstone purge processor (tasks.md T129; sync-protocol.md §5;
 * Constitution V) against a scripted connection and a scripted object store.
 *
 * What the database does — which rows are old enough, what is deleted in which
 * order, what a non-owner role may reach — is the integration suite's business
 * (test/integration/sync-tombstone-purge.spec.ts), because only a real engine
 * can answer it. What is pinned HERE is the processor's own contract, and it is
 * all ordering and failure:
 *
 *   - the window it asks for is the exported 90 days;
 *   - both keyholes run in ONE transaction, which is what lets the second one
 *     delete exactly the rows the first one listed and locked;
 *   - the objects go BEFORE the rows. A row is the only record of where its
 *     object is; the other order loses the key if the process dies in between,
 *     and the bytes outlive the row for good (Constitution V);
 *   - a delete the store refuses aborts the run before any row is touched, so
 *     BullMQ's retry finds every key where it left it.
 */

interface Call {
  readonly text: string;
  readonly values: unknown[];
}

interface Script {
  readonly objects?: { bucket: string; object_key: string }[];
  readonly counts?: { table_name: string; purged: string }[];
}

function scriptedSql(script: Script = {}, events: string[] = []) {
  const calls: Call[] = [];
  const begun: string[] = [];

  const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    calls.push({ text, values });

    if (text.includes('tombstone_purge_objects')) {
      events.push('list');
      return Promise.resolve(script.objects ?? []);
    }
    if (text.includes('tombstone_purge(')) {
      events.push('rows');
      return Promise.resolve(script.counts ?? []);
    }
    return Promise.reject(new Error(`Unscripted statement: ${text}`));
  };

  const sql = Object.assign(tx, {
    begin: (fn: (t: typeof tx) => Promise<unknown>) => {
      begun.push('begin');
      return fn(tx);
    },
  });

  return { sql: sql as unknown as Sql, calls, begun };
}

function recordingStorage(options: { failOn?: string } = {}) {
  const removed: string[] = [];
  const storage: PurgeStorage = {
    removeObject: (bucket, key) => {
      removed.push(`${bucket}/${key}`);
      return key === options.failOn
        ? Promise.reject(new Error('the store refused the delete'))
        : Promise.resolve();
    },
  };

  return { storage, removed };
}

describe('purgeTombstones', () => {
  it('retains tombstones for 90 days — the window the protocol states', () => {
    expect(TOMBSTONE_RETENTION_DAYS).toBe(90);
  });

  it('asks both keyholes for that window, inside one transaction', async () => {
    const { sql, calls, begun } = scriptedSql();

    await purgeTombstones({ sql, storage: recordingStorage().storage });

    expect(begun).toEqual(['begin']);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.text).toContain('tombstone_purge_objects(');
    expect(calls[1]?.text).toContain('tombstone_purge(');
    expect(calls.map((c) => c.values)).toEqual([
      [TOMBSTONE_RETENTION_DAYS],
      [TOMBSTONE_RETENTION_DAYS],
    ]);
  });

  it('removes every listed object, and only then purges the rows', async () => {
    const events: string[] = [];
    const { sql } = scriptedSql(
      {
        objects: [
          { bucket: 'photos', object_key: 'u/p1' },
          { bucket: 'photos', object_key: 'u/p1.thumb.jpg' },
          { bucket: 'documents', object_key: 'u/d1' },
        ],
        counts: [{ table_name: 'photos', purged: '1' }],
      },
      events,
    );
    const storage: PurgeStorage = {
      removeObject: (bucket, key) => {
        events.push(`remove ${bucket}/${key}`);
        return Promise.resolve();
      },
    };

    await purgeTombstones({ sql, storage });

    expect(events).toEqual([
      'list',
      'remove photos/u/p1',
      'remove photos/u/p1.thumb.jpg',
      'remove documents/u/d1',
      'rows',
    ]);
  });

  it('reports what it did: objects removed and rows purged per table, as numbers', async () => {
    const { sql } = scriptedSql({
      objects: [{ bucket: 'documents', object_key: 'u/d1' }],
      counts: [
        { table_name: 'trips', purged: '2' },
        { table_name: 'notes', purged: '0' },
        { table_name: 'documents', purged: '1' },
      ],
    });

    const result = await purgeTombstones({ sql, storage: recordingStorage().storage });

    expect(result).toEqual({
      retentionDays: 90,
      objectsRemoved: 1,
      purged: { trips: 2, notes: 0, documents: 1 },
    });
  });

  it('touches no bucket when no photo or document is due', async () => {
    const { sql } = scriptedSql({ counts: [{ table_name: 'notes', purged: '3' }] });
    const { storage, removed } = recordingStorage();

    const result = await purgeTombstones({ sql, storage });

    expect(removed).toEqual([]);
    expect(result.objectsRemoved).toBe(0);
    expect(result.purged).toEqual({ notes: 3 });
  });

  it('aborts before any row is purged when the store refuses a delete, and says why', async () => {
    const { sql, calls } = scriptedSql({
      objects: [
        { bucket: 'photos', object_key: 'u/p1' },
        { bucket: 'photos', object_key: 'u/p2' },
      ],
    });
    const { storage } = recordingStorage({ failOn: 'u/p2' });

    await expect(purgeTombstones({ sql, storage })).rejects.toThrow(
      'the store refused the delete',
    );

    // Only the listing ran: the rows — the only record of these keys — are still there.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('tombstone_purge_objects(');
  });

  it('refuses a bucket it does not know rather than deleting from wherever it names', async () => {
    const { sql, calls } = scriptedSql({
      objects: [{ bucket: 'somewhere-else', object_key: 'u/x' }],
    });
    const { storage, removed } = recordingStorage();

    await expect(purgeTombstones({ sql, storage })).rejects.toThrow(/bucket/i);

    expect(removed).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('removes a large batch in bounded groups, never all at once', async () => {
    const objects = Array.from({ length: 45 }, (_, i) => ({
      bucket: 'photos',
      object_key: `u/${i}`,
    }));
    const { sql } = scriptedSql({ objects });
    let inFlight = 0;
    let peak = 0;
    const storage: PurgeStorage = {
      removeObject: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
      },
    };

    const result = await purgeTombstones({ sql, storage });

    expect(result.objectsRemoved).toBe(45);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(16);
  });
});
