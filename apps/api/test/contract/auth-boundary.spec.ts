import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiError } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { ACCESS_TOKEN_ALGORITHM } from '@/common/auth/token-algorithm';
import { loadEnv } from '@/common/config/env.schema';

import { bearer, bootTestApp, registerTraveller } from '../support/app';

/**
 * Contract test 1 (rest-api.md "Contract tests"): every endpoint rejects a
 * missing, malformed, or expired token — with one body, so the refusal says
 * nothing about which guess was closest (FR-072).
 *
 * The routes below are every protected route User Story 1 adds. The guard is
 * global and routes opt *out* with `@Public()`, so a new endpoint is protected
 * by default; this list is nonetheless enumerated rather than derived because
 * the thing being proven is the boundary of the surface that ships, and a
 * derived list would inherit any mistake in the thing it was derived from.
 */

type Method = 'get' | 'post' | 'patch' | 'delete';

const PROTECTED_ROUTES: readonly (readonly [Method, string])[] = [
  ['get', '/v1/me'],
  ['patch', '/v1/me'],
  ['get', '/v1/trips'],
  ['post', '/v1/trips'],
  ['get', `/v1/trips/${randomUUID()}`],
  ['get', `/v1/trips/${randomUUID()}/arcs`],
  ['post', `/v1/trips/${randomUUID()}/stops`],
  ['post', '/v1/auth/logout'],
  ['post', '/v1/auth/logout-all'],
];

describe('contract 1 — the auth boundary', () => {
  let app: NestExpressApplication;
  const jwt = new JwtService({});

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Signed with the real access secret, HS256, and an `exp` sixty seconds ago. */
  function expiredToken(): string {
    return jwt.sign(
      { sub: randomUUID(), exp: Math.floor(Date.now() / 1_000) - 60 },
      { secret: loadEnv().JWT_ACCESS_SECRET, algorithm: ACCESS_TOKEN_ALGORITHM },
    );
  }

  /** Well-formed, correctly shaped, wrong key. */
  function forgedToken(): string {
    return jwt.sign(
      { sub: randomUUID() },
      {
        secret: 'not-the-secret-'.repeat(3),
        algorithm: ACCESS_TOKEN_ALGORITHM,
        expiresIn: '15m',
      },
    );
  }

  const send = (method: Method, path: string, headers: Record<string, string> = {}) =>
    request(app.getHttpServer())[method](path).set(headers).send({});

  describe.each(PROTECTED_ROUTES)('%s %s', (method, path) => {
    it('refuses a missing token with 401 in the error envelope', async () => {
      const response = await send(method, path);

      expect(response.status).toBe(401);
      expect(ApiError.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    });

    it('refuses a malformed Authorization header', async () => {
      const garbage = await send(method, path, { Authorization: 'Bearer not-a-jwt' });
      const wrongScheme = await send(method, path, {
        Authorization: 'Basic dXNlcjpwYXNz',
      });
      const emptyBearer = await send(method, path, { Authorization: 'Bearer ' });

      expect([garbage.status, wrongScheme.status, emptyBearer.status]).toEqual([
        401, 401, 401,
      ]);
    });

    it('refuses an expired token', async () => {
      const response = await send(method, path, bearer(expiredToken()));

      expect(response.status).toBe(401);
    });

    it('refuses a token signed with another key', async () => {
      const response = await send(method, path, bearer(forgedToken()));

      expect(response.status).toBe(401);
    });

    it('answers every refusal with byte-identical bodies', async () => {
      // FR-072 — absent, malformed, expired and forged must be indistinguishable
      // to the caller. Distinguishing them tells an attacker which of their
      // guesses was closest.
      const bodies = await Promise.all([
        send(method, path),
        send(method, path, { Authorization: 'Bearer not-a-jwt' }),
        send(method, path, bearer(expiredToken())),
        send(method, path, bearer(forgedToken())),
      ]);

      const serialised = bodies.map((r) => JSON.stringify(r.body));
      expect(new Set(serialised).size).toBe(1);
      expect(serialised[0]).not.toMatch(/expired|signature|malformed|jwt/i);
    });
  });

  it('lets a valid token through — the boundary is closed to strangers, not to everyone', async () => {
    // Positive control. A guard that refused every request would pass every
    // assertion above while breaking the product.
    const traveller = await registerTraveller(app);

    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set(bearer(traveller.tokens.access_token));

    expect(response.status).toBe(200);
  });

  it('leaves the public routes reachable without a token', async () => {
    // The inverse boundary: a route that needs no identity must not demand one,
    // or nobody could ever sign in.
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever-it-is-wrong' });
    const countries = await request(app.getHttpServer()).get('/v1/countries');

    expect(login.status).toBe(401);
    expect(login.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(countries.status).toBe(200);
  });
});
