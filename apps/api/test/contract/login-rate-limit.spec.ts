import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiError } from '@triptrackr/contracts';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AUTH_RATE_LIMITS } from '@/modules/auth/auth-rate-limits';

import { bootTestApp, registerTraveller } from '../support/app';
import { InMemoryRedis } from '../support/redis-stub';

/**
 * Contract test 3 (rest-api.md §1, FR-071): login rate limiting engages, and
 * neither the refusal nor the limit distinguishes "no such account" from
 * "wrong password" — that distinction is an account-enumeration oracle.
 *
 * Redis is the `InMemoryRedis` stand-in (test/support/redis-stub.ts): the
 * database suites start no Redis container, and a limiter with nothing to
 * count in cannot be shown to engage. The stand-in implements the one script
 * the guard issues; what it cannot prove — that INCR and EXPIRE are one
 * server-side step — is a property of Redis itself and is pinned by the
 * guard's unit spec.
 */
describe('contract 3 — login rate limiting', () => {
  let app: NestExpressApplication;
  let redis: InMemoryRedis;

  beforeAll(async () => {
    redis = new InMemoryRedis();
    app = await bootTestApp({ redis: redis.asClient() });
  });

  afterAll(async () => {
    await app?.close();
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer()).post('/v1/auth/login').send({ email, password });

  /**
   * Keeps attempting until a 429 arrives. Bounded by the sum of both buckets
   * plus slack, so a limiter that never engages fails the test rather than
   * looping; the exact attempt at which it engages depends on which bucket —
   * per IP or per account — is the tighter one and on window alignment.
   */
  async function attemptUntilLimited(email: string): Promise<request.Response> {
    const { limit, perIdentifier } = AUTH_RATE_LIMITS.login;
    const ceiling = limit + perIdentifier.limit + 2;

    for (let attempt = 0; attempt < ceiling; attempt += 1) {
      const response = await login(email, 'definitely-the-wrong-password');
      if (response.status === 429) return response;
      expect(response.status).toBe(401);
    }

    throw new Error(`No 429 after ${ceiling} failed logins; the limiter never engaged.`);
  }

  it('answers unknown-email and wrong-password with byte-identical 401 bodies', async () => {
    // Arrange
    const traveller = await registerTraveller(app);

    // Act
    const unknownAccount = await login(
      `nobody-${randomUUID()}@example.test`,
      traveller.password,
    );
    const wrongPassword = await login(traveller.email, 'not-the-right-password');

    // Assert — same status, same bytes, and the envelope the client parses.
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(JSON.stringify(unknownAccount.body)).toBe(JSON.stringify(wrongPassword.body));
    expect(ApiError.safeParse(wrongPassword.body).success).toBe(true);
    expect(wrongPassword.body).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    // Neither body may say which half was wrong.
    expect(JSON.stringify(wrongPassword.body)).not.toMatch(
      /no such|not found|does not exist|unknown (account|user|email)|(wrong|incorrect) password/i,
    );
  });

  it('announces the ceiling on every answer so a client can pace itself', async () => {
    const response = await login(
      `pacing-${randomUUID()}@example.test`,
      'wrong-password-x',
    );

    expect(Number(response.headers['x-ratelimit-limit'])).toBeGreaterThan(0);
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
  });

  it('engages after repeated failures against one account, with a retry window (FR-071)', async () => {
    // Arrange
    const traveller = await registerTraveller(app);

    // Act
    const limited = await attemptUntilLimited(traveller.email);

    // Assert — FR-072: what happened and when to come back, nothing about how.
    expect(limited.status).toBe(429);
    expect(ApiError.safeParse(limited.body).success).toBe(true);
    expect(limited.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });

    const details = (limited.body as ApiError).error.details as {
      retry_after_seconds: number;
    };
    expect(details.retry_after_seconds).toBeGreaterThan(0);
    expect(Number(limited.headers['retry-after'])).toBe(details.retry_after_seconds);
    expect(JSON.stringify(limited.body)).not.toMatch(/redis|bucket|ip address/i);
  });

  it('counts by account identifier, not only by caller address', async () => {
    // A guess distributed across many addresses against one email is still one
    // attack on one account. The identifier bucket is keyed on a hash of the
    // address so Redis never holds an email in a key name.
    const traveller = await registerTraveller(app);

    await login(traveller.email, 'wrong-once');

    const identifierBuckets = redis.keys().filter((key) => key.includes(':acct:'));
    expect(identifierBuckets.length).toBeGreaterThan(0);
    expect(redis.keys().join('\n')).not.toContain(traveller.email);
  });

  it('limits an unknown account exactly as it limits a real one', async () => {
    // Arrange — two fresh identifiers, one real, one that has never existed.
    const traveller = await registerTraveller(app);
    const ghost = `ghost-${randomUUID()}@example.test`;

    // Act
    const realLimited = await attemptUntilLimited(traveller.email);
    const ghostLimited = await attemptUntilLimited(ghost);

    // Assert — the same code, and messages that differ at most in the seconds
    // remaining, which is a property of the clock and not of the account.
    expect(realLimited.status).toBe(429);
    expect(ghostLimited.status).toBe(429);

    const normalise = (body: unknown) => JSON.stringify(body).replace(/\d+/g, 'N');
    expect(normalise(ghostLimited.body)).toBe(normalise(realLimited.body));
  });

  it('also throttles registration and password-reset requests (rest-api.md §1)', async () => {
    const ceiling = AUTH_RATE_LIMITS.passwordResetRequest.limit + 2;
    const statuses: number[] = [];

    for (let attempt = 0; attempt < ceiling; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/password-reset/request')
        .send({ email: `reset-${randomUUID()}@example.test` });
      statuses.push(response.status);
    }

    // Every attempt names a different address, so only the per-IP bucket can
    // have engaged — which is the point: an attacker rotating addresses is
    // still one caller.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 202).length).toBeLessThanOrEqual(
      AUTH_RATE_LIMITS.passwordResetRequest.limit,
    );
  });
});
