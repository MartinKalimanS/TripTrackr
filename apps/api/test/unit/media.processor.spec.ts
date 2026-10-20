import { MAX_PHOTO_BYTES, type ModerationState } from '@triptrackr/contracts';
import { UnrecoverableError } from 'bullmq';
import type { Sql } from 'postgres';

import type { StorageBucket } from '@/common/storage/storage.service';
import {
  processPhoto,
  type MediaDeps,
  type MediaStorage,
} from '@/workers/media.processor';
import {
  FailClosedPhotoScreening,
  type PhotoScreening,
  type ScreeningSubject,
} from '@/workers/photo-screening';

import { exifAt, inspect, jpeg, transparentPng, webpWithExif } from '../support/images';

/**
 * The media worker's decisions (tasks.md T113; FR-029, FR-030, FR-056; research
 * D-12, D-34), against stand-ins for its two keyholes and the bucket, with the
 * real `sharp` and `exifr` on images made in the test.
 *
 * test/integration/media-worker.spec.ts proves the keyholes and the filing
 * against PostgreSQL and RustFS. Pinned here are the edges of the processor:
 *
 *   - the thumbnail is a JPEG no larger than 512 px on either edge, oriented,
 *     never enlarged, and carries no metadata at all;
 *   - EXIF is read only when registration carried no capture data, and what it
 *     yields is handed to the keyhole, which fills only what is empty;
 *   - the screener sees the thumbnail, never the original, and its verdict goes
 *     to the keyhole unaltered — the fail-closed one answers `pending`;
 *   - a photo that is gone finishes quietly; bytes that are missing are
 *     retried; bytes that can never make a thumbnail fail at once
 *     (`UnrecoverableError`), so BullMQ does not retry the impossible.
 */

const PHOTO_ID = '66666666-6666-4666-8666-666666666666';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const KEY = `${OWNER_ID}/77777777-7777-4777-8777-777777777777`;
const THUMB_KEY = `${KEY}.thumb.jpg`;

interface PhotoToProcessRow {
  readonly storage_key: string;
  readonly needs_exif: boolean;
}

interface RecordedRow {
  readonly photo_id: string;
  readonly thumbnail_key: string;
  readonly filed: boolean;
  readonly moderation: string;
}

interface Query {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** What `media_record_photo` answers when the photo is still there. */
function recordedFrom(values: readonly unknown[], filed = false): RecordedRow {
  return {
    photo_id: PHOTO_ID,
    thumbnail_key: THUMB_KEY,
    filed,
    moderation: String(values[4]),
  };
}

/**
 * The worker's connection, answering only the two keyholes. Any other
 * statement is a failure: the worker has no identity, and a plain query on
 * `photos` would be refused by RLS in production.
 */
function fakeSql(
  photo: PhotoToProcessRow | null,
  record: (values: readonly unknown[]) => RecordedRow | null = recordedFrom,
) {
  const queries: Query[] = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    queries.push({ text, values });
    if (text.includes('media_photo_for_processing')) {
      return Promise.resolve(photo ? [photo] : []);
    }
    if (text.includes('media_record_photo')) {
      const row = record(values);
      return Promise.resolve(row ? [row] : []);
    }
    return Promise.reject(new Error(`Unexpected statement: ${text}`));
  };
  const recordCall = () => queries.find((q) => q.text.includes('media_record_photo'));
  return { sql: sql as unknown as Sql, queries, recordCall };
}

/** The photos bucket as a map, every method a spy. */
function fakeStorage(objects: Readonly<Record<string, Buffer>> = {}) {
  const store = new Map(Object.entries(objects));
  const storage = {
    objectSize: jest.fn((_bucket: StorageBucket, key: string) =>
      Promise.resolve(store.get(key)?.length ?? null),
    ),
    getObject: jest.fn((_bucket: StorageBucket, key: string) =>
      Promise.resolve(store.get(key) ?? null),
    ),
    putObject: jest.fn(
      (_bucket: StorageBucket, key: string, body: Buffer, _type: string) => {
        store.set(key, body);
        return Promise.resolve();
      },
    ),
    deleteObject: jest.fn((_bucket: StorageBucket, key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  } satisfies MediaStorage;
  return { storage, store };
}

function deps(
  sql: Sql,
  storage: MediaStorage,
  screening: PhotoScreening = new FailClosedPhotoScreening(),
): MediaDeps {
  return { sql, storage, screening };
}

const needsNothing: PhotoToProcessRow = { storage_key: KEY, needs_exif: false };
const needsExif: PhotoToProcessRow = { storage_key: KEY, needs_exif: true };

describe('processPhoto — the thumbnail (FR-030)', () => {
  it('writes a metadata-free JPEG no larger than 512 px beside the original and records it', async () => {
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage, store } = fakeStorage({
      [KEY]: await jpeg({ width: 1600, height: 1200 }),
    });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toEqual({
      photoId: PHOTO_ID,
      outcome: 'processed',
      exif: 'not_needed',
      filed: false,
      moderationState: 'pending',
    });
    expect(storage.putObject).toHaveBeenCalledWith(
      'photos',
      THUMB_KEY,
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(await inspect(store.get(THUMB_KEY)!)).toMatchObject({
      format: 'jpeg',
      width: 512,
      height: 384,
      exif: undefined,
      icc: undefined,
      xmp: undefined,
      iptc: undefined,
    });
    // Nothing read from EXIF, so the keyhole is asked to fill nothing.
    expect(recordCall()?.values).toEqual([PHOTO_ID, null, null, null, 'pending']);
  });

  it('applies the camera’s orientation before resizing, and strips it', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage, store } = fakeStorage({
      [KEY]: await jpeg({ width: 1600, height: 1200, orientation: 6 }),
    });

    await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    const thumbnail = await inspect(store.get(THUMB_KEY)!);
    expect(thumbnail).toMatchObject({ width: 384, height: 512 });
    expect(thumbnail.orientation).toBeUndefined();
  });

  it('never enlarges a photo already smaller than a thumbnail', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage, store } = fakeStorage({
      [KEY]: await jpeg({ width: 300, height: 200 }),
    });

    await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(await inspect(store.get(THUMB_KEY)!)).toMatchObject({
      width: 300,
      height: 200,
    });
  });

  it('makes a JPEG thumbnail from a PNG with transparency', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage, store } = fakeStorage({ [KEY]: await transparentPng() });

    await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(await inspect(store.get(THUMB_KEY)!)).toMatchObject({
      format: 'jpeg',
      width: 120,
      height: 80,
    });
  });
});

describe('processPhoto — EXIF only when registration carried none (FR-029)', () => {
  const inVersailles = exifAt({
    lat: 48.8049,
    lng: 2.1204,
    local: '2026:06:03 14:30:00',
    offset: '+02:00',
  });

  it('reads time and position from the bytes and hands them to the keyhole', async () => {
    const { sql, recordCall } = fakeSql(needsExif, (values) =>
      recordedFrom(values, true),
    );
    const { storage } = fakeStorage({ [KEY]: await jpeg({ exif: inVersailles }) });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toMatchObject({ outcome: 'processed', exif: 'found', filed: true });
    const [id, takenAt, lat, lng, verdict] = recordCall()?.values ?? [];
    expect([id, takenAt, verdict]).toEqual([
      PHOTO_ID,
      '2026-06-03T12:30:00.000Z',
      'pending',
    ]);
    expect(lat).toBeCloseTo(48.8049, 5);
    expect(lng).toBeCloseTo(2.1204, 5);
  });

  it('does not read EXIF when registration carried capture data, even if the bytes have it', async () => {
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage } = fakeStorage({ [KEY]: await jpeg({ exif: inVersailles }) });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toMatchObject({ exif: 'not_needed' });
    expect(recordCall()?.values).toEqual([PHOTO_ID, null, null, null, 'pending']);
  });

  it('records nothing when the bytes carry no EXIF — the photo simply has none', async () => {
    const { sql, recordCall } = fakeSql(needsExif);
    const { storage } = fakeStorage({ [KEY]: await jpeg() });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toMatchObject({ outcome: 'processed', exif: 'absent' });
    expect(recordCall()?.values).toEqual([PHOTO_ID, null, null, null, 'pending']);
  });

  it('treats metadata it cannot parse as absent, and still makes the thumbnail', async () => {
    const { sql, recordCall } = fakeSql(needsExif);
    const { storage, store } = fakeStorage({ [KEY]: await webpWithExif(inVersailles) });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toMatchObject({ outcome: 'processed', exif: 'unreadable' });
    expect(recordCall()?.values).toEqual([PHOTO_ID, null, null, null, 'pending']);
    expect(await inspect(store.get(THUMB_KEY)!)).toMatchObject({
      format: 'jpeg',
      width: 512,
    });
  });
});

describe('processPhoto — screening (FR-056; research D-34)', () => {
  it('shows the screener the thumbnail, not the original, and forwards its verdict unaltered', async () => {
    const seen: ScreeningSubject[] = [];
    const screening: PhotoScreening = {
      screen: (subject) => {
        seen.push(subject);
        return Promise.resolve<ModerationState>('rejected');
      },
    };
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage } = fakeStorage({
      [KEY]: await jpeg({
        width: 2048,
        height: 1536,
        exif: exifAt({ lat: 1, lng: 1, local: '2026:06:03 14:30:00', offset: '+00:00' }),
      }),
    });

    const result = await processPhoto(
      { photo_id: PHOTO_ID },
      deps(sql, storage, screening),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ photoId: PHOTO_ID, contentType: 'image/jpeg' });
    expect(await inspect(seen[0]!.image)).toMatchObject({ width: 512, exif: undefined });
    expect(recordCall()?.values.at(-1)).toBe('rejected');
    expect(result).toMatchObject({ moderationState: 'rejected' });
  });

  it('leaves every photo pending with the fail-closed screener', async () => {
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage } = fakeStorage({ [KEY]: await jpeg() });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(recordCall()?.values.at(-1)).toBe('pending');
    expect(result).toMatchObject({ moderationState: 'pending' });
  });
});

describe('processPhoto — what cannot be processed', () => {
  it('finishes quietly for a photo that is gone, deleted or not uploaded, touching nothing', async () => {
    const { sql, queries } = fakeSql(null);
    const { storage } = fakeStorage();

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toEqual({ photoId: PHOTO_ID, outcome: 'skipped' });
    expect(queries).toHaveLength(1);
    expect(storage.objectSize).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('refuses malformed job data outright, before any statement', async () => {
    const { sql, queries } = fakeSql(needsNothing);
    const { storage } = fakeStorage();

    await expect(
      processPhoto({ photo_id: 'not-a-uuid' }, deps(sql, storage)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    await expect(processPhoto(undefined, deps(sql, storage))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(queries).toHaveLength(0);
  });

  it('retries when the original is missing from the bucket — a plain error, not a final one', async () => {
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage } = fakeStorage();

    const failure = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(UnrecoverableError);
    expect((failure as Error).message).toContain(PHOTO_ID);
    expect((failure as Error).message).not.toContain(OWNER_ID);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(recordCall()).toBeUndefined();
  });

  it('retries when the object vanishes between measuring and reading it', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage } = fakeStorage();
    storage.objectSize.mockResolvedValueOnce(1_024);

    await expect(
      processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)),
    ).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it('never downloads an original replaced after registration by one over the limit', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage } = fakeStorage();
    storage.objectSize.mockResolvedValueOnce(MAX_PHOTO_BYTES + 1);

    await expect(
      processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('does not process bytes that grew past the limit between measuring and reading', async () => {
    const { sql } = fakeSql(needsNothing);
    const { storage } = fakeStorage();
    storage.objectSize.mockResolvedValueOnce(1_024);
    storage.getObject.mockResolvedValueOnce(Buffer.alloc(MAX_PHOTO_BYTES + 1));

    await expect(
      processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('fails at once, without retrying, on bytes that are not an image', async () => {
    const { sql, recordCall } = fakeSql(needsNothing);
    const { storage } = fakeStorage({ [KEY]: Buffer.from('definitely not a jpeg') });

    await expect(
      processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)),
    ).rejects.toThrow(UnrecoverableError);
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(recordCall()).toBeUndefined();
  });

  it('removes the thumbnail it wrote when the photo was deleted while it worked', async () => {
    const { sql } = fakeSql(needsNothing, () => null);
    const { storage, store } = fakeStorage({ [KEY]: await jpeg() });

    const result = await processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage));

    expect(result).toEqual({ photoId: PHOTO_ID, outcome: 'skipped' });
    expect(storage.deleteObject).toHaveBeenCalledWith('photos', THUMB_KEY);
    expect(store.has(THUMB_KEY)).toBe(false);
    expect(store.has(KEY)).toBe(true);
  });

  it('fails loudly if the keyhole recorded a thumbnail key other than the one written', async () => {
    const { sql } = fakeSql(needsNothing, (values) => ({
      ...recordedFrom(values),
      thumbnail_key: `${KEY}.thumbnail.jpeg`,
    }));
    const { storage } = fakeStorage({ [KEY]: await jpeg() });

    await expect(
      processPhoto({ photo_id: PHOTO_ID }, deps(sql, storage)),
    ).rejects.toThrow(/thumbnail key/i);
  });
});
