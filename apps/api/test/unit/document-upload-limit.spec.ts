import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiError, MAX_DOCUMENT_BYTES } from '@triptrackr/contracts';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { DOCUMENT_BODY_LIMIT, configureApp } from '@/app.setup';
import { ACCESS_TOKEN_ALGORITHM } from '@/common/auth/token-algorithm';
import { DRIZZLE, PG_CONNECTION } from '@/common/db/db.module';
import { QueueModule } from '@/common/queue/queue.module';
import { REDIS_CLIENT } from '@/common/redis/redis.module';

import { applyUnitTestEnv } from '../support/env';
import { InertQueueModule } from '../support/queues';

/**
 * The document upload route's body limit, on the application that ships
 * (rest-api.md §6 "The upload route alone accepts a JSON body above the 1 MB
 * limit"; research D-32) — with the pool and Redis replaced by stand-ins, as in
 * app.wiring.spec.ts, so it runs without Docker.
 *
 * The pool answers every query with no rows, so a request that reaches the
 * documents service is told its trip does not exist: a 404 TRIP_NOT_FOUND here
 * PROVES the body got through the parser and both validation pipes. The
 * contract twin (test/contract/document-upload-limit.spec.ts) stores a ~9 MB
 * document for real.
 */

const TRAVELLER = '11111111-1111-4111-8111-111111111111';
const TRIP = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

interface FakePool {
  readonly sql: Sql;
  /** Every statement drizzle sent — the trip lookup is one of them. */
  readonly statements: string[];
}

/** No rows for anything; transactions open for free; drizzle's `unsafe` path too. */
function fakePool(): FakePool {
  const statements: string[] = [];
  const noRows = () =>
    Object.assign(Promise.resolve([]), { values: () => Promise.resolve([]) });
  const tx = Object.assign(
    (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([]),
    {
      unsafe: (query: string) => {
        statements.push(query);
        return noRows();
      },
    },
  );
  const sql = Object.assign(tx, {
    begin: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    end: () => Promise.resolve(),
  });

  return { sql: sql as unknown as Sql, statements };
}

const unreachableRedis = {
  status: 'end',
  eval: () => Promise.reject(new Error('ECONNREFUSED')),
  ttl: () => Promise.resolve(30),
  disconnect: () => undefined,
  quit: () => Promise.resolve('OK'),
} as unknown as Redis;

/** A JPEG-signed payload of `bytes` bytes, base64 — what the device would send. */
function jpegBase64(bytes: number): string {
  const image = randomBytes(bytes);
  JPEG_SIGNATURE.copy(image);
  return image.toString('base64');
}

describe('the document upload route’s body limit (research D-32)', () => {
  let app: NestExpressApplication;
  let pool: FakePool;
  let token: string;

  beforeAll(async () => {
    applyUnitTestEnv();
    pool = fakePool();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideModule(QueueModule)
      .useModule(InertQueueModule)
      .overrideProvider(PG_CONNECTION)
      .useValue(pool.sql)
      .overrideProvider(DRIZZLE)
      .useValue({})
      .overrideProvider(REDIS_CLIENT)
      .useValue(unreachableRedis)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();

    token = await new JwtService().signAsync(
      { sub: TRAVELLER },
      { secret: 'x'.repeat(32), algorithm: ACCESS_TOKEN_ALGORITHM },
    );
  });

  afterAll(() => app?.close());

  const server = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const upload = (body: unknown) =>
    server()
      .post(`/v1/trips/${TRIP}/documents`)
      .set(auth())
      .send(body as object);

  it('admits a ~9 MB document: it reaches the service, which finds no such trip', async () => {
    const response = await upload({
      type: 'boarding_pass',
      content_type: 'image/jpeg',
      content_base64: jpegBase64(9 * 1024 * 1024),
    });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
  });

  it('refuses a document one byte over MAX_DOCUMENT_BYTES as 413 DOCUMENT_TOO_LARGE, before the service', async () => {
    const before = pool.statements.length;

    const response = await upload({
      type: 'other',
      content_type: 'image/jpeg',
      content_base64: jpegBase64(MAX_DOCUMENT_BYTES + 1),
    });

    expect(response.status).toBe(413);
    expect(ApiError.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
    expect(pool.statements.length).toBe(before);
  });

  it('refuses a body past the route’s own limit with the same 413', async () => {
    const response = await upload({ padding: 'x'.repeat(DOCUMENT_BODY_LIMIT) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
  });

  it.each([
    ['POST', '/v1/anything'],
    ['POST', `/v1/trips/${TRIP}/notes`],
    ['PATCH', `/v1/documents/${DOCUMENT}`],
    ['POST', `/v1/trips/${TRIP}/documents/${DOCUMENT}`],
  ])('keeps the 1 MB limit on %s %s', async (method, path) => {
    const call = method === 'PATCH' ? server().patch(path) : server().post(path);

    const response = await call.set(auth()).send({ padding: 'x'.repeat(1_100_000) });

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('marks both document reads no-store — even the refusal', async () => {
    const list = await server().get(`/v1/trips/${TRIP}/documents`).set(auth());
    const content = await server().get(`/v1/documents/${DOCUMENT}/content`).set(auth());

    expect(list.status).toBe(404);
    expect(content.status).toBe(404);
    expect(content.body).toMatchObject({ error: { code: 'DOCUMENT_NOT_FOUND' } });
    expect(list.headers['cache-control']).toBe('no-store');
    expect(content.headers['cache-control']).toBe('no-store');
  });

  it.each(['is_public', 'visibility', 'public', 'shared'])(
    'refuses `%s` in a query on every document route before any lookup (FR-032)',
    async (key) => {
      const before = pool.statements.length;
      const query = `?${key}=true`;
      const calls = [
        () => server().get(`/v1/trips/${TRIP}/documents${query}`).set(auth()),
        () => server().get(`/v1/documents/${DOCUMENT}/content${query}`).set(auth()),
        () => server().delete(`/v1/documents/${DOCUMENT}${query}`).set(auth()),
        () =>
          server()
            .patch(`/v1/documents/${DOCUMENT}${query}`)
            .set(auth())
            .send({ type: 'other' }),
        () =>
          upload({
            type: 'other',
            content_type: 'image/jpeg',
            content_base64: jpegBase64(64),
          }).query({ [key]: 'true' }),
      ];

      // One at a time: supertest starts the unlistened server per request.
      for (const call of calls) {
        const response = await call();
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      }
      expect(pool.statements.length).toBe(before);
    },
  );
});
