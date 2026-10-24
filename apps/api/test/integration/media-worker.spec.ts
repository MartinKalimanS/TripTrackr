import { randomUUID } from 'node:crypto';

import { StorageService } from '@/common/storage/storage.service';
import { processPhoto, type MediaDeps } from '@/workers/media.processor';
import { FailClosedPhotoScreening } from '@/workers/photo-screening';

import { applyDatabaseTestEnv } from '../support/env';
import { exifAt, inspect, jpeg } from '../support/images';
import { photosBucket, type PhotosBucket } from '../support/photos';
import { CITY, createHarness, type Harness } from './harness';

/**
 * The media worker against the real thing (tasks.md T113 with T210; FR-029,
 * FR-030, FR-056; research D-12, D-34): `processPhoto` on the API role with no
 * traveller identity, migration 0012's two `SECURITY DEFINER` keyholes on a real
 * PostgreSQL + PostGIS, and originals and thumbnails in a real RustFS bucket.
 * test/unit/media.processor.spec.ts pins the processor's decisions against
 * stand-ins; this proves the SQL those stand-ins claim to answer for.
 *
 * Photos are inserted through the owner connection in `uploaded` state with
 * their original already in the bucket — exactly what registration leaves
 * behind (test/integration/uploads.spec.ts is registration).
 */

const PARIS = { lat: 48.8566, lng: 2.3522 };
const VERSAILLES = { lat: 48.8049, lng: 2.1204 };
const ZURICH = { lat: 47.3769, lng: 8.5417 };
const TOKYO = { lat: 35.6895, lng: 139.6917 };

interface PhotoRow {
  readonly taken_at: Date | null;
  readonly exif_lat: number | null;
  readonly exif_lng: number | null;
  readonly city_id: number | null;
  readonly thumb_key: string | null;
  readonly moderation_state: string;
  readonly is_public: boolean;
  readonly upload_state: string;
  readonly deleted_at: Date | null;
  readonly updated_at: Date;
}

interface SeededPhoto {
  readonly id: string;
  readonly key: string;
  readonly bytes: Buffer;
}

interface PhotoSeed {
  readonly tripId?: string;
  readonly bytes?: Buffer;
  readonly cityId?: number;
  readonly takenAt?: string;
  readonly position?: { readonly lat: number; readonly lng: number };
  readonly uploadState?: 'pending' | 'uploaded' | 'failed';
  readonly deleted?: boolean;
}

describe('the media worker on PostgreSQL and RustFS', () => {
  let harness: Harness;
  let bucket: PhotosBucket;
  let storage: StorageService;
  let A: string;

  beforeAll(async () => {
    applyDatabaseTestEnv();
    harness = await createHarness();
    bucket = photosBucket();
    storage = new StorageService();
    A = harness.accountA.id;
  });

  afterAll(async () => {
    bucket?.close();
    await harness?.close();
  });

  const deps = (overrides: Partial<MediaDeps> = {}): MediaDeps => ({
    sql: harness.api,
    storage,
    screening: new FailClosedPhotoScreening(),
    ...overrides,
  });

  /** A photo as registration leaves it, with its original in the bucket. */
  async function seedPhoto(seed: PhotoSeed = {}): Promise<SeededPhoto> {
    const bytes = seed.bytes ?? (await jpeg());
    const key = `${A}/${randomUUID()}`;
    await storage.putObject('photos', key, bytes, 'image/jpeg');

    const [row] = await harness.owner<{ id: string }[]>`
      INSERT INTO photos (trip_id, storage_key, city_id, taken_at, exif_lat, exif_lng,
                          upload_state, deleted_at)
      VALUES (${seed.tripId ?? harness.accountA.publicTripId}::uuid, ${key},
              ${seed.cityId ?? null}, ${seed.takenAt ?? null},
              ${seed.position?.lat ?? null}, ${seed.position?.lng ?? null},
              ${seed.uploadState ?? 'uploaded'}, ${seed.deleted ? new Date() : null})
      RETURNING id
    `;
    if (!row) throw new Error('The photo fixture was not inserted.');

    return { id: row.id, key, bytes };
  }

  /** A trip of A's with one stop, for the filing rules. */
  async function seedTrip(options: {
    stopCity: number;
    stopDeleted?: boolean;
    tripDeleted?: boolean;
  }): Promise<string> {
    const [trip] = await harness.owner<{ id: string }[]>`
      INSERT INTO trips (owner_id, title, home_currency, status, deleted_at)
      VALUES (${A}::uuid, 'Filing trip', 'CHF', 'planning',
              ${options.tripDeleted ? new Date() : null})
      RETURNING id
    `;
    if (!trip) throw new Error('The trip fixture was not inserted.');
    await harness.owner`
      INSERT INTO trip_stops (trip_id, city_id, sort_order, arrive_date, depart_date,
                              deleted_at)
      VALUES (${trip.id}::uuid, ${options.stopCity}, 0, '2026-06-01', '2026-06-08',
              ${options.stopDeleted ? new Date() : null})
    `;
    return trip.id;
  }

  async function rowOf(photoId: string): Promise<PhotoRow> {
    const [row] = await harness.owner<PhotoRow[]>`
      SELECT taken_at, exif_lat, exif_lng, city_id, thumb_key, moderation_state,
             is_public, upload_state, deleted_at, updated_at
      FROM photos WHERE id = ${photoId}::uuid
    `;
    if (!row) throw new Error(`Photo ${photoId} has no row.`);
    return row;
  }

  describe('the two keyholes (migration 0012)', () => {
    const FOR_PROCESSING = 'media_photo_for_processing(uuid)';
    const RECORD =
      'media_record_photo(uuid, timestamptz, double precision, double precision, text)';

    it('are SECURITY DEFINER with a pinned search_path, executable by the API role and nobody else', async () => {
      for (const signature of [FOR_PROCESSING, RECORD]) {
        const [fn] = await harness.owner<
          {
            definer: boolean;
            path: string[] | null;
            public_can: boolean;
            api_can: boolean;
          }[]
        >`
          SELECT p.prosecdef AS definer,
                 p.proconfig AS path,
                 has_function_privilege('public', p.oid, 'EXECUTE') AS public_can,
                 has_function_privilege('triptrackr_api', p.oid, 'EXECUTE') AS api_can
          FROM pg_proc p WHERE p.oid = ${signature}::regprocedure
        `;

        expect(fn).toEqual({
          definer: true,
          path: ['search_path=public, pg_temp'],
          public_can: false,
          api_can: true,
        });
      }
    });

    it('are the worker’s only way in: with no traveller identity a plain query on photos is refused', async () => {
      const photo = await seedPhoto();

      await expect(
        harness.api`SELECT id FROM photos WHERE id = ${photo.id}::uuid`,
      ).rejects.toThrow();
      const viaKeyhole = await harness.api<{ storage_key: string }[]>`
        SELECT storage_key FROM media_photo_for_processing(${photo.id}::uuid)
      `;
      expect(viaKeyhole).toEqual([{ storage_key: photo.key }]);
    });

    describe('media_photo_for_processing', () => {
      const forProcessing = (id: string) =>
        harness.api<Record<string, unknown>[]>`
          SELECT * FROM media_photo_for_processing(${id}::uuid)
        `;

      it('gives a live, uploaded photo’s key and whether EXIF is needed — and nothing else about it', async () => {
        const bare = await seedPhoto();
        const timed = await seedPhoto({ takenAt: '2026-06-02T10:00:00Z' });
        const placed = await seedPhoto({ position: PARIS });

        expect(await forProcessing(bare.id)).toEqual([
          { id: bare.id, storage_key: bare.key, needs_exif: true },
        ]);
        expect((await forProcessing(timed.id))[0]).toMatchObject({ needs_exif: false });
        expect((await forProcessing(placed.id))[0]).toMatchObject({ needs_exif: false });
      });

      it('gives nothing for a photo that is tombstoned, unconfirmed, or on a tombstoned trip', async () => {
        const tombstoned = await seedPhoto({ deleted: true });
        const waiting = await seedPhoto({ uploadState: 'pending' });
        const failed = await seedPhoto({ uploadState: 'failed' });
        const goneTrip = await seedTrip({ stopCity: CITY.paris, tripDeleted: true });
        const onGoneTrip = await seedPhoto({ tripId: goneTrip });

        for (const photo of [tombstoned, waiting, failed, onGoneTrip]) {
          expect(await forProcessing(photo.id)).toHaveLength(0);
        }
        expect(await forProcessing(randomUUID())).toHaveLength(0);
      });
    });

    describe('media_record_photo', () => {
      const record = (
        id: string,
        capture: { takenAt?: string; lat?: number; lng?: number } = {},
        verdict = 'pending',
      ) =>
        harness.api<
          {
            photo_id: string;
            thumbnail_key: string;
            filed: boolean;
            moderation: string;
          }[]
        >`
          SELECT * FROM media_record_photo(
            ${id}::uuid,
            ${capture.takenAt ?? null}::timestamptz,
            ${capture.lat ?? null}::double precision,
            ${capture.lng ?? null}::double precision,
            ${verdict}::text
          )
        `;

      it('answers nothing for a photo that is not live and uploaded, and changes nothing', async () => {
        const tombstoned = await seedPhoto({ deleted: true });
        const waiting = await seedPhoto({ uploadState: 'pending' });

        for (const photo of [tombstoned, waiting]) {
          const before = await rowOf(photo.id);
          expect(await record(photo.id, PARIS, 'rejected')).toHaveLength(0);
          expect(await rowOf(photo.id)).toEqual(before);
        }
      });

      it('derives the thumbnail key itself, beside the original', async () => {
        const photo = await seedPhoto();

        const [recorded] = await record(photo.id);

        expect(recorded?.thumbnail_key).toBe(`${photo.key}.thumb.jpg`);
        expect((await rowOf(photo.id)).thumb_key).toBe(`${photo.key}.thumb.jpg`);
      });

      it('fills a position only as a pair inside the coordinate ranges', async () => {
        const half = await seedPhoto();
        const outOfRange = await seedPhoto();

        await record(half.id, { lat: 48.8 });
        await record(outOfRange.id, { lat: 95, lng: 2.3 });

        for (const photo of [half, outOfRange]) {
          expect(await rowOf(photo.id)).toMatchObject({ exif_lat: null, exif_lng: null });
        }
      });

      it('never overwrites what the traveller’s device sent', async () => {
        const photo = await seedPhoto({
          takenAt: '2026-06-01T08:00:00Z',
          position: ZURICH,
        });

        await record(photo.id, { takenAt: '2026-06-02T12:30:00Z', ...PARIS });

        const row = await rowOf(photo.id);
        expect(row.taken_at?.toISOString()).toBe('2026-06-01T08:00:00.000Z');
        expect(row.exif_lat).toBeCloseTo(ZURICH.lat, 6);
        expect(row.exif_lng).toBeCloseTo(ZURICH.lng, 6);
      });

      it('moves updated_at, so a device learns of it on its next pull', async () => {
        const photo = await seedPhoto();
        const before = (await rowOf(photo.id)).updated_at;
        // Postgres keeps microseconds, a JS Date milliseconds: two writes inside one millisecond
        // would read as equal, so leave a gap the comparison can see.
        await harness.owner`SELECT pg_sleep(0.02)`;

        await record(photo.id, PARIS);

        expect((await rowOf(photo.id)).updated_at.getTime()).toBeGreaterThan(
          before.getTime(),
        );
      });

      it.each([
        ['pending', 'pending', 'pending'],
        ['pending', 'approved', 'approved'],
        ['pending', 'rejected', 'rejected'],
        ['approved', 'pending', 'approved'],
        ['approved', 'rejected', 'rejected'],
        ['rejected', 'approved', 'rejected'],
        ['rejected', 'pending', 'rejected'],
      ])(
        'a photo that is %s given the verdict %s is %s: a rejection always lands, an approval only lifts pending',
        async (current, verdict, expected) => {
          const photo = await seedPhoto();
          await harness.owner`
            UPDATE photos SET moderation_state = ${current} WHERE id = ${photo.id}::uuid
          `;

          const [recorded] = await record(photo.id, {}, verdict);

          expect(recorded?.moderation).toBe(expected);
          expect((await rowOf(photo.id)).moderation_state).toBe(expected);
        },
      );

      it('cannot make a photo public: the owner’s choice is not the keyhole’s to change', async () => {
        const photo = await seedPhoto();

        await record(photo.id, PARIS, 'approved');

        expect((await rowOf(photo.id)).is_public).toBe(false);
      });
    });
  });

  describe('processPhoto with the real bucket', () => {
    it('makes a metadata-free thumbnail beside the original, reads EXIF, files the photo, and leaves it pending', async () => {
      const original = await jpeg({
        width: 2400,
        height: 1600,
        exif: exifAt({ ...VERSAILLES, local: '2026:06:03 14:30:00', offset: '+02:00' }),
      });
      const photo = await seedPhoto({ bytes: original });
      const before = await rowOf(photo.id);

      const result = await processPhoto({ photo_id: photo.id }, deps());

      expect(result).toEqual({
        photoId: photo.id,
        outcome: 'processed',
        exif: 'found',
        filed: true,
        moderationState: 'pending',
      });
      const row = await rowOf(photo.id);
      expect(row).toMatchObject({
        city_id: CITY.paris,
        thumb_key: `${photo.key}.thumb.jpg`,
        moderation_state: 'pending',
        is_public: false,
        upload_state: 'uploaded',
      });
      expect(row.taken_at?.toISOString()).toBe('2026-06-03T12:30:00.000Z');
      expect(row.exif_lat).toBeCloseTo(VERSAILLES.lat, 4);
      expect(row.exif_lng).toBeCloseTo(VERSAILLES.lng, 4);
      expect(row.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());

      const thumbnail = await bucket.read(`${photo.key}.thumb.jpg`);
      expect(thumbnail).not.toBeNull();
      const seen = await inspect(thumbnail as Buffer);
      expect(seen).toMatchObject({ format: 'jpeg', width: 512, height: 341 });
      expect([seen.exif, seen.xmp, seen.iptc, seen.icc]).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      // The original is not touched.
      expect((await bucket.read(photo.key))?.equals(original)).toBe(true);
    });

    it('is idempotent under BullMQ’s retries: the same thumbnail, the same row, nothing filed twice', async () => {
      const photo = await seedPhoto({
        bytes: await jpeg({
          exif: exifAt({ ...PARIS, local: '2026:06:03 09:00:00', offset: '+02:00' }),
        }),
      });
      await processPhoto({ photo_id: photo.id }, deps());
      const first = await rowOf(photo.id);
      const firstThumbnail = await bucket.read(`${photo.key}.thumb.jpg`);

      const again = await processPhoto({ photo_id: photo.id }, deps());

      expect(again).toMatchObject({ outcome: 'processed', filed: false });
      const second = await rowOf(photo.id);
      expect({ ...second, updated_at: undefined }).toEqual({
        ...first,
        updated_at: undefined,
      });
      expect(
        (await bucket.read(`${photo.key}.thumb.jpg`))?.equals(firstThumbnail as Buffer),
      ).toBe(true);
    });

    it('does not read EXIF when registration carried the capture data, and keeps it', async () => {
      const inZurich = await seedTrip({ stopCity: CITY.zurich });
      const photo = await seedPhoto({
        tripId: inZurich,
        // The pixels' EXIF says Paris; the device said Zurich.
        bytes: await jpeg({
          exif: exifAt({ ...PARIS, local: '2026:06:03 09:00:00', offset: '+02:00' }),
        }),
        takenAt: '2026-06-01T08:00:00Z',
        position: ZURICH,
      });

      const result = await processPhoto({ photo_id: photo.id }, deps());

      expect(result).toMatchObject({ outcome: 'processed', exif: 'not_needed' });
      const row = await rowOf(photo.id);
      expect(row.exif_lat).toBeCloseTo(ZURICH.lat, 6);
      expect(row.taken_at?.toISOString()).toBe('2026-06-01T08:00:00.000Z');
      expect(row.city_id).toBe(CITY.zurich);
    });

    it('keeps the traveller’s own filing over the nearest stop', async () => {
      const photo = await seedPhoto({ cityId: CITY.tokyo, position: PARIS });

      const result = await processPhoto({ photo_id: photo.id }, deps());

      expect(result).toMatchObject({ outcome: 'processed', filed: false });
      expect((await rowOf(photo.id)).city_id).toBe(CITY.tokyo);
    });

    it.each([
      ['further than 50 km from every stop', TOKYO, false],
      ['near only a stop that is tombstoned', PARIS, true],
    ])('files nothing for a photo %s', async (_name, position, stopDeleted) => {
      const trip = await seedTrip({ stopCity: CITY.paris, stopDeleted });
      const photo = await seedPhoto({ tripId: trip, position });

      const result = await processPhoto({ photo_id: photo.id }, deps());

      expect(result).toMatchObject({ outcome: 'processed', filed: false });
      const row = await rowOf(photo.id);
      expect(row.city_id).toBeNull();
      expect(row.exif_lat).toBeCloseTo(position.lat, 6);
    });

    it('finishes quietly for a photo that is gone or unconfirmed, and writes nothing to the bucket', async () => {
      const tombstoned = await seedPhoto({ deleted: true });
      const waiting = await seedPhoto({ uploadState: 'pending' });

      for (const photo of [tombstoned, waiting]) {
        expect(await processPhoto({ photo_id: photo.id }, deps())).toEqual({
          photoId: photo.id,
          outcome: 'skipped',
        });
        expect(await bucket.size(`${photo.key}.thumb.jpg`)).toBeNull();
      }
    });

    it('removes the thumbnail it wrote when the photo is tombstoned while being processed', async () => {
      const photo = await seedPhoto();
      const racing: MediaDeps['storage'] = {
        objectSize: (...args) => storage.objectSize(...args),
        getObject: (...args) => storage.getObject(...args),
        deleteObject: (...args) => storage.deleteObject(...args),
        async putObject(...args) {
          await storage.putObject(...args);
          await harness.owner`
            UPDATE photos SET deleted_at = now() WHERE id = ${photo.id}::uuid
          `;
        },
      };

      const result = await processPhoto(
        { photo_id: photo.id },
        deps({ storage: racing }),
      );

      expect(result).toEqual({ photoId: photo.id, outcome: 'skipped' });
      expect(await bucket.size(`${photo.key}.thumb.jpg`)).toBeNull();
      expect((await rowOf(photo.id)).thumb_key).toBeNull();
    });

    it('records a rejection from a screener, and an approval only over a pending photo', async () => {
      const rejected = await seedPhoto();
      const approved = await seedPhoto();

      const one = await processPhoto(
        { photo_id: rejected.id },
        deps({ screening: { screen: () => Promise.resolve('rejected') } }),
      );
      const two = await processPhoto(
        { photo_id: approved.id },
        deps({ screening: { screen: () => Promise.resolve('approved') } }),
      );

      expect(one).toMatchObject({ moderationState: 'rejected' });
      expect(two).toMatchObject({ moderationState: 'approved' });
      expect((await rowOf(rejected.id)).moderation_state).toBe('rejected');
      expect((await rowOf(approved.id)).moderation_state).toBe('approved');
      // Approval is the screener's; the owner's visibility choice is untouched.
      expect((await rowOf(approved.id)).is_public).toBe(false);
    });
  });
});
