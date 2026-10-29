import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExportResponse } from '@triptrackr/contracts';
import { unzipSync, strFromU8 } from 'fflate';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Sql } from 'postgres';
import request from 'supertest';

import { EnvelopeService } from '@/common/crypto/envelope.service';
import { QUEUE_NAMES } from '@/common/queue/queue.constants';
import { StorageService } from '@/common/storage/storage.service';
import { BoardingPassService } from '@/modules/documents/boarding-pass.service';
import {
  cleanupExpiredExports,
  processAccountExport,
  type AccountExportDeps,
} from '@/workers/account-export.processor';

import {
  bearer,
  bootTestApp,
  enqueuedJobs,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { apiSql, migrationSql } from '../support/db';
import {
  boardingPassJpeg,
  documentsBucket,
  uploadDocument,
  type DocumentsBucket,
} from '../support/documents';
import { createExpenseFor, createTripFor } from '../support/expenses';
import { CITY, seedGeography } from '../support/geography';
import { photosBucket, registerPhoto, type PhotosBucket } from '../support/photos';

/**
 * Export my data (tasks.md T190; FR-007; spec 009). The route, the job and the cleanup on the real
 * things: PostgreSQL with the migrations applied, RustFS, and the envelope that seals documents.
 *
 * The archive is opened and read like a traveller would read it: unzipped, the JSON parsed. What is
 * pinned: what is in it, what is not (another traveller, a deleted photo), that the plaintext
 * document is in it only because the owner asked, that a failed job leaves no temporary file and
 * no half-state, and that an expired archive goes.
 */
describe('POST /me/export, the job and the cleanup', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let api: Sql;
  let storage: StorageService;
  let photos: PhotosBucket;
  let documents: DocumentsBucket;
  let envelope: EnvelopeService;
  let sent: { to: string; subject: string; text: string }[];

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    api = apiSql();
    await seedGeography(owner);
    storage = new StorageService();
    photos = photosBucket();
    documents = documentsBucket();
    envelope = new EnvelopeService();
  });

  afterAll(async () => {
    photos?.close();
    documents?.close();
    await api?.end();
    await owner?.end();
    await app?.close();
  });

  beforeEach(() => {
    sent = [];
  });

  const server = () => request(app.getHttpServer());
  const deps = (overrides: Partial<AccountExportDeps> = {}): AccountExportDeps => ({
    sql: api,
    storage,
    envelope,
    boardingPass: new BoardingPassService(envelope),
    email: {
      send: (email) => {
        sent.push(email);
        return Promise.resolve();
      },
    },
    ...overrides,
  });

  const start = (traveller: RegisteredTraveller, body: unknown) =>
    server()
      .post('/v1/me/export')
      .set(bearer(traveller.tokens.access_token))
      .send(body as object);

  const status = (traveller: RegisteredTraveller, id: string) =>
    server().get(`/v1/me/export/${id}`).set(bearer(traveller.tokens.access_token));

  const idOf = async (traveller: RegisteredTraveller) =>
    (
      await owner<{ id: string }[]>`SELECT id FROM users WHERE email = ${traveller.email}`
    )[0]!.id;

  interface Content {
    readonly userId: string;
    readonly tripId: string;
    readonly photoId: string;
    readonly photoBytes: Buffer;
    readonly documentId: string;
    readonly documentBytes: Buffer;
  }

  async function fillAccount(
    traveller: RegisteredTraveller,
    title: string,
  ): Promise<Content> {
    const userId = await idOf(traveller);
    const token = bearer(traveller.tokens.access_token);
    const tripId = await createTripFor(app, traveller, 'CHF', title);
    await server()
      .post(`/v1/trips/${tripId}/stops`)
      .set(token)
      .send({
        city_id: CITY.zurich,
        arrive_date: '2026-06-01',
        depart_date: '2026-06-03',
      })
      .expect(201);
    await server()
      .post(`/v1/trips/${tripId}/notes`)
      .set(token)
      .send({ title: `${title} note`, body: 'Fondue, twice.', city_id: CITY.zurich })
      .expect(201);
    await createExpenseFor(app, traveller, tripId, {
      amount: '12.50',
      note: 'Lunch, with a "quote"',
    });
    const live = await registerPhoto(app, traveller, tripId);
    const gone = await registerPhoto(app, traveller, tripId);
    await server().delete(`/v1/photos/${gone.photo.id}`).set(token).expect(204);
    const documentBytes = boardingPassJpeg();
    const document = await uploadDocument(app, traveller, tripId, {
      content_base64: documentBytes.toString('base64'),
    });
    return {
      userId,
      tripId,
      photoId: live.photo.id,
      photoBytes: live.bytes,
      documentId: document.id,
      documentBytes,
    };
  }

  /** Requests an export and runs the job for it, as the route and the worker would. */
  async function exportOf(traveller: RegisteredTraveller, userId: string) {
    const response = await start(traveller, { password: traveller.password });
    expect(response.status).toBe(202);
    const { export: created } = ExportResponse.parse(response.body);
    const result = await processAccountExport(deps(), { exportId: created.id, userId });
    return { created, result };
  }

  async function archiveOf(userId: string, exportId: string) {
    const bytes = await documents.read(`${userId}/exports/${exportId}.zip`);
    if (!bytes) throw new Error('The archive is not in the bucket.');
    return unzipSync(new Uint8Array(bytes));
  }

  const json = (files: Record<string, Uint8Array>, name: string) =>
    JSON.parse(strFromU8(files[name]!)) as unknown;

  describe('the request', () => {
    it('refuses a caller with no token', async () => {
      expect((await server().post('/v1/me/export').send({})).status).toBe(401);
    });

    it('refuses a wrong or a missing password, and starts nothing', async () => {
      const traveller = await registerTraveller(app);
      expect(
        (await start(traveller, { password: 'not the password at all' })).status,
      ).toBe(403);
      expect((await start(traveller, {})).status).toBe(403);
      const [counted] = await owner<{ n: string }[]>`
        SELECT count(*)::text AS n FROM data_exports e JOIN users u ON u.id = e.user_id
        WHERE u.email = ${traveller.email}
      `;
      expect(Number(counted?.n)).toBe(0);
    });

    it('accepts the right password: 202, a pending export, one job queued', async () => {
      const traveller = await registerTraveller(app);
      const response = await start(traveller, { password: traveller.password });

      expect(response.status).toBe(202);
      const { export: created } = ExportResponse.parse(response.body);
      expect(created).toMatchObject({
        status: 'pending',
        expires_at: null,
        download_url: null,
      });
      const userId = await idOf(traveller);
      const queued = enqueuedJobs(app, QUEUE_NAMES.accountExport).filter(
        (job) => (job.data as { exportId?: string }).exportId === created.id,
      );
      expect(queued).toHaveLength(1);
      expect(queued[0]!.name).toBe('export');
      expect(queued[0]!.data).toEqual({ exportId: created.id, userId });
    });

    it('allows one a day: a second request is refused and names the first', async () => {
      const traveller = await registerTraveller(app);
      const first = ExportResponse.parse(
        (await start(traveller, { password: traveller.password })).body,
      ).export;

      const second = await start(traveller, { password: traveller.password });

      expect(second.status).toBe(429);
      expect(second.body).toMatchObject({
        error: { code: 'EXPORT_RATE_LIMITED', details: { export_id: first.id } },
      });
    });

    it('a failed export does not count against the day', async () => {
      const traveller = await registerTraveller(app);
      const first = ExportResponse.parse(
        (await start(traveller, { password: traveller.password })).body,
      ).export;
      await owner`UPDATE data_exports SET status = 'failed' WHERE id = ${first.id}::uuid`;

      expect((await start(traveller, { password: traveller.password })).status).toBe(202);
    });
  });

  describe('who can read it', () => {
    it("another traveller's export is a 404, never a 403", async () => {
      const a = await registerTraveller(app);
      const b = await registerTraveller(app);
      const created = ExportResponse.parse(
        (await start(a, { password: a.password })).body,
      ).export;

      expect((await status(a, created.id)).status).toBe(200);
      expect((await status(b, created.id)).status).toBe(404);
      expect((await status(b, '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f')).status).toBe(404);
    });
  });

  describe('the archive', () => {
    let content: Content;
    let other: Content;
    let traveller: RegisteredTraveller;
    let files: Record<string, Uint8Array>;
    let exportId: string;

    beforeAll(async () => {
      traveller = await registerTraveller(app, { displayName: 'Exporter' });
      const bystander = await registerTraveller(app, { displayName: 'Bystander' });
      content = await fillAccount(traveller, 'Zurich in June');
      other = await fillAccount(bystander, 'Somebody else’s secret trip');
      const { created, result } = await exportOf(traveller, content.userId);
      exportId = created.id;
      expect(result.outcome).toBe('ready');
      files = await archiveOf(content.userId, exportId);
    });

    it('holds the files a traveller can read without us', () => {
      const names = Object.keys(files).sort();
      expect(names).toEqual(
        expect.arrayContaining([
          'README.txt',
          'profile.json',
          'trips.json',
          'notes.json',
          'expenses.json',
          'expenses.csv',
          'photos.json',
          'documents.json',
          `photos/${content.photoId}.jpg`,
          `documents/${content.documentId}.jpg`,
        ]),
      );
      expect(strFromU8(files['README.txt']!)).toMatch(/TripTrackr/);
    });

    it('has the profile, the trip with its stop, the note and the expense', () => {
      expect(json(files, 'profile.json')).toMatchObject({
        email: traveller.email,
        display_name: 'Exporter',
      });
      const trips = json(files, 'trips.json') as {
        id: string;
        title: string;
        stops: unknown[];
      }[];
      expect(trips.map((t) => t.title)).toEqual(['Zurich in June']);
      expect(trips[0]!.stops).toHaveLength(1);
      expect(json(files, 'notes.json')).toEqual([
        expect.objectContaining({ title: 'Zurich in June note', body: 'Fondue, twice.' }),
      ]);
      expect(json(files, 'expenses.json')).toEqual([
        expect.objectContaining({ amount: '12.50', currency: 'CHF' }),
      ]);
    });

    it('writes the expenses as a CSV with the currency, the rate and the quote escaped', () => {
      const lines = strFromU8(files['expenses.csv']!).trim().split(/\r?\n/);
      expect(lines[0]).toBe(
        'trip,spent_at,category,amount,currency,fx_rate_to_home,amount_home,home_currency,note',
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Zurich in June');
      expect(lines[1]).toContain('12.50,CHF');
      expect(lines[1]).toContain('"Lunch, with a ""quote"""');
    });

    it('carries the original photo, byte for byte, and no deleted photo', () => {
      expect(Buffer.from(files[`photos/${content.photoId}.jpg`]!)).toEqual(
        content.photoBytes,
      );
      const entries = json(files, 'photos.json') as { id: string }[];
      expect(entries.map((p) => p.id)).toEqual([content.photoId]);
      expect(Object.keys(files).filter((n) => n.startsWith('photos/'))).toHaveLength(1);
    });

    it('carries the document opened for its owner, with its parsed fields', () => {
      expect(Buffer.from(files[`documents/${content.documentId}.jpg`]!)).toEqual(
        content.documentBytes,
      );
      const entries = json(files, 'documents.json') as {
        id: string;
        parsed_json: { flight_number?: string } | null;
      }[];
      expect(entries).toHaveLength(1);
      expect(entries[0]!.id).toBe(content.documentId);
    });

    it('holds nothing of the other traveller', () => {
      const everything = Object.entries(files)
        .filter(([name]) => name.endsWith('.json') || name.endsWith('.csv'))
        .map(([, bytes]) => strFromU8(bytes))
        .join('\n');
      expect(everything).not.toContain(other.userId);
      expect(everything).not.toContain(other.tripId);
      expect(everything).not.toContain('secret trip');
      expect(Object.keys(files).join('\n')).not.toContain(other.photoId);
    });

    it('does not carry the keys, the storage paths or the hash', () => {
      const text = Object.entries(files)
        .filter(([name]) => name.endsWith('.json'))
        .map(([, bytes]) => strFromU8(bytes))
        .join('\n');
      expect(text).not.toMatch(
        /password|wrapped_dek|dek_key|storage_key|thumb_key|parsed_sealed/i,
      );
    });

    it('is ready for its owner: a fresh signed link that downloads the same zip, and an expiry', async () => {
      const response = await status(traveller, exportId);
      const { export: ready } = ExportResponse.parse(response.body);

      expect(ready.status).toBe('ready');
      expect(ready.expires_at).not.toBeNull();
      expect(new Date(ready.expires_at!).getTime()).toBeGreaterThan(Date.now());
      expect(ready.download_url).not.toBeNull();

      const downloaded = await fetch(ready.download_url!);
      expect(downloaded.status).toBe(200);
      const zip = unzipSync(new Uint8Array(await downloaded.arrayBuffer()));
      expect(Object.keys(zip)).toEqual(expect.arrayContaining(['trips.json']));
    });
  });

  describe('the job', () => {
    it('emails the traveller that it is ready, with no link and nothing of the archive', async () => {
      const traveller = await registerTraveller(app);
      const userId = await idOf(traveller);
      await createTripFor(app, traveller, 'CHF', 'Private title');
      sent = [];

      await exportOf(traveller, userId);

      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe(traveller.email);
      expect(sent[0]!.text).not.toMatch(/https?:\/\//);
      expect(sent[0]!.text).not.toContain('Private title');
    });

    it('does nothing for an export that is not pending, or that is another traveller’s', async () => {
      const a = await registerTraveller(app);
      const b = await registerTraveller(app);
      const created = ExportResponse.parse(
        (await start(a, { password: a.password })).body,
      ).export;

      const wrong = await processAccountExport(deps(), {
        exportId: created.id,
        userId: await idOf(b),
      });
      expect(wrong.outcome).toBe('skipped');
      const [row] = await owner<{ status: string }[]>`
        SELECT status FROM data_exports WHERE id = ${created.id}::uuid
      `;
      expect(row?.status).toBe('pending');

      await processAccountExport(deps(), { exportId: created.id, userId: await idOf(a) });
      const again = await processAccountExport(deps(), {
        exportId: created.id,
        userId: await idOf(a),
      });
      expect(again.outcome).toBe('skipped');
    });

    it('a store that fails marks the export failed, leaves no temporary file and no object, and names nothing', async () => {
      const traveller = await registerTraveller(app);
      const content = await fillAccount(traveller, 'Failing trip');
      const before = readdirSync(tmpdir()).filter((n) => n.startsWith('export-'));
      const refusing: AccountExportDeps['storage'] = {
        getObject: () =>
          Promise.reject(new Error('the store is unreachable: Failing trip')),
        putObjectFromFile: () => Promise.reject(new Error('nope')),
        removeObject: () => Promise.resolve(),
      };

      const created = ExportResponse.parse(
        (await start(traveller, { password: traveller.password })).body,
      ).export;
      const result = await processAccountExport(deps({ storage: refusing }), {
        exportId: created.id,
        userId: content.userId,
      });

      expect(result.outcome).toBe('failed');
      expect(JSON.stringify(result)).not.toContain('Failing trip');
      expect((await status(traveller, created.id)).body).toMatchObject({
        export: { status: 'failed', download_url: null },
      });
      expect(await documents.keys(`${content.userId}/exports/`)).toEqual([]);
      expect(readdirSync(tmpdir()).filter((n) => n.startsWith('export-'))).toEqual(
        before,
      );
    });
  });

  describe('the cleanup', () => {
    it('removes an archive past its 24 hours, then marks it expired, and leaves a live one', async () => {
      const old = await registerTraveller(app);
      const fresh = await registerTraveller(app);
      const oldUser = await idOf(old);
      const freshUser = await idOf(fresh);
      const oldExport = (await exportOf(old, oldUser)).created;
      const freshExport = (await exportOf(fresh, freshUser)).created;
      await owner`
        UPDATE data_exports SET expires_at = now() - interval '1 minute'
        WHERE id = ${oldExport.id}::uuid
      `;

      const result = await cleanupExpiredExports(deps());

      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(await documents.keys(`${oldUser}/exports/`)).toEqual([]);
      expect((await status(old, oldExport.id)).body).toMatchObject({
        export: { status: 'expired', download_url: null },
      });
      expect(await documents.keys(`${freshUser}/exports/`)).toHaveLength(1);
      expect((await status(fresh, freshExport.id)).body).toMatchObject({
        export: { status: 'ready' },
      });
    });

    it('keeps the row and tries again when the store refuses', async () => {
      const traveller = await registerTraveller(app);
      const userId = await idOf(traveller);
      const created = (await exportOf(traveller, userId)).created;
      await owner`
        UPDATE data_exports SET expires_at = now() - interval '1 minute'
        WHERE id = ${created.id}::uuid
      `;
      const refusing: AccountExportDeps['storage'] = {
        getObject: () => Promise.resolve(null),
        putObjectFromFile: () => Promise.resolve(),
        removeObject: () => Promise.reject(new Error('the store is unreachable')),
      };

      await expect(cleanupExpiredExports(deps({ storage: refusing }))).rejects.toThrow(
        'the store is unreachable',
      );
      const [row] = await owner<{ status: string; object_key: string | null }[]>`
        SELECT status, object_key FROM data_exports WHERE id = ${created.id}::uuid
      `;
      expect(row).toMatchObject({ status: 'ready' });
      expect(row?.object_key).not.toBeNull();

      await cleanupExpiredExports(deps());
      expect(await documents.keys(`${userId}/exports/`)).toEqual([]);
    });
  });

  it('keeps the photo bucket out of it: the originals are read, never moved', async () => {
    const traveller = await registerTraveller(app);
    const content = await fillAccount(traveller, 'Untouched');
    const before = await photos.keys(`${content.userId}/`);
    await exportOf(traveller, content.userId);
    expect(await photos.keys(`${content.userId}/`)).toEqual(before);
  });
});
