import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type Redis from 'ioredis';

import { RATE_LIMIT_KEY, RateLimitGuard } from '@/common/guards/rate-limit.guard';

/**
 * Per-account rate limiting (FR-071), against a scripted Redis.
 *
 * The property worth a test of its own is atomicity. The scaffold ran INCR and
 * then EXPIRE as two round trips; a process that died between them, or two
 * requests racing on a fresh key, left a counter with no expiry — a bucket that
 * never emptied, locking that caller out of that route for good. The fix is one
 * script, so the counter and its lifetime are created in the same server-side
 * step, and this spec pins that the guard issues exactly that and nothing else.
 */

interface ScriptedRedis {
  readonly client: Redis;
  readonly eval: jest.Mock;
  readonly ttl: jest.Mock;
  readonly incr: jest.Mock;
  readonly expire: jest.Mock;
}

function scriptedRedis(count: number | Error, ttl = 42): ScriptedRedis {
  const evalMock = jest.fn(() =>
    count instanceof Error ? Promise.reject(count) : Promise.resolve(count),
  );
  const ttlMock = jest.fn(() => Promise.resolve(ttl));
  const incr = jest.fn();
  const expire = jest.fn();

  return {
    client: { eval: evalMock, ttl: ttlMock, incr, expire } as unknown as Redis,
    eval: evalMock,
    ttl: ttlMock,
    incr,
    expire,
  };
}

function contextFor(
  handlerMetadata: Record<string, unknown> = {},
  request: Record<string, unknown> = {},
): { context: ExecutionContext; headers: Map<string, unknown> } {
  const headers = new Map<string, unknown>();
  const handler = (): void => undefined;
  const controller = class {};

  for (const [key, value] of Object.entries(handlerMetadata)) {
    Reflect.defineMetadata(key, value, handler);
  }

  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/trips', ip: '10.0.0.1', ...request }),
      getResponse: () => ({
        setHeader: (name: string, value: unknown) => headers.set(name, value),
      }),
    }),
  } as unknown as ExecutionContext;

  return { context, headers };
}

describe('RateLimitGuard', () => {
  it('counts a hit with a single atomic script call — never INCR then EXPIRE', async () => {
    // Arrange
    const redis = scriptedRedis(1);
    const guard = new RateLimitGuard(redis.client, new Reflector());
    const { context } = contextFor({
      [RATE_LIMIT_KEY]: { limit: 10, windowSeconds: 60 },
    });

    // Act
    const allowed = await guard.canActivate(context);

    // Assert — one round trip, carrying the key and the window together.
    expect(allowed).toBe(true);
    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();

    const [script, numKeys, key, window] = redis.eval.mock.calls[0] as [
      string,
      number,
      string,
      number,
    ];
    expect(script).toMatch(/INCR/);
    expect(script).toMatch(/EXPIRE/);
    expect(numKeys).toBe(1);
    expect(key).toMatch(/^ratelimit:ip:10\.0\.0\.1:GET:\/trips:\d+$/);
    expect(window).toBe(60);
  });

  it('reports the remaining allowance in headers', async () => {
    const redis = scriptedRedis(3);
    const guard = new RateLimitGuard(redis.client, new Reflector());
    const { context, headers } = contextFor({
      [RATE_LIMIT_KEY]: { limit: 10, windowSeconds: 60 },
    });

    await guard.canActivate(context);

    expect(headers.get('X-RateLimit-Limit')).toBe(10);
    expect(headers.get('X-RateLimit-Remaining')).toBe(7);
  });

  it('applies a default ceiling to a route that declares none', async () => {
    // An unannotated endpoint is an oversight far more often than a decision to
    // allow unlimited traffic.
    const redis = scriptedRedis(1);
    const guard = new RateLimitGuard(redis.client, new Reflector());
    const { context, headers } = contextFor();

    await guard.canActivate(context);

    expect(headers.get('X-RateLimit-Limit')).toBeGreaterThan(0);
  });

  it('answers 429 in the uniform error shape once the limit is exceeded', async () => {
    // Arrange — the eleventh hit in a window of ten.
    const redis = scriptedRedis(11, 17);
    const guard = new RateLimitGuard(redis.client, new Reflector());
    const { context, headers } = contextFor({
      [RATE_LIMIT_KEY]: { limit: 10, windowSeconds: 60 },
    });

    // Act
    const attempt = guard.canActivate(context);

    // Assert — FR-071 and FR-072: what happened and when to retry, nothing else.
    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(429);
      expect(error.getResponse()).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: expect.stringContaining('17 seconds') as unknown,
          details: { retry_after_seconds: 17 },
        },
      });
    });
    expect(headers.get('Retry-After')).toBe(17);
  });

  describe('per account identifier (FR-071, rest-api.md §1)', () => {
    // `/auth/login`, `/auth/register` and `/auth/password-reset/request` are
    // limited per IP *and* per account identifier. A guess distributed across
    // many addresses against one email is still one attack on one account.
    const options = {
      limit: 10,
      windowSeconds: 60,
      perIdentifier: { field: 'email', limit: 3, windowSeconds: 900 },
    };

    it('counts a second bucket keyed on a hash of the identifier, never the value', async () => {
      // Arrange
      const redis = scriptedRedis(1);
      const guard = new RateLimitGuard(redis.client, new Reflector());
      const { context } = contextFor(
        { [RATE_LIMIT_KEY]: options },
        { method: 'POST', path: '/auth/login', body: { email: 'Someone@Example.test' } },
      );

      // Act
      await guard.canActivate(context);

      // Assert — two atomic hits, and the address appears in neither key.
      expect(redis.eval).toHaveBeenCalledTimes(2);
      const keys = redis.eval.mock.calls.map((call) => call[2] as string);
      expect(keys[0]).toMatch(/^ratelimit:ip:10\.0\.0\.1:POST:\/auth\/login:\d+$/);
      expect(keys[1]).toMatch(/^ratelimit:acct:[0-9a-f]{32}:POST:\/auth\/login:\d+$/);
      expect(keys.join('\n')).not.toMatch(/example\.test/i);

      const windows = redis.eval.mock.calls.map((call) => call[3] as number);
      expect(windows).toEqual([60, 900]);
    });

    it('folds case and whitespace so one address is one bucket', async () => {
      const redis = scriptedRedis(1);
      const guard = new RateLimitGuard(redis.client, new Reflector());
      const first = contextFor(
        { [RATE_LIMIT_KEY]: options },
        { method: 'POST', path: '/auth/login', body: { email: 'Someone@Example.test' } },
      );
      const second = contextFor(
        { [RATE_LIMIT_KEY]: options },
        {
          method: 'POST',
          path: '/auth/login',
          body: { email: '  someone@example.test ' },
        },
      );

      await guard.canActivate(first.context);
      await guard.canActivate(second.context);

      const accountKeys = redis.eval.mock.calls
        .map((call) => call[2] as string)
        .filter((key) => key.includes(':acct:'));
      expect(new Set(accountKeys).size).toBe(1);
    });

    it('answers 429 when the identifier bucket alone is exhausted', async () => {
      // Arrange — the address bucket is fine (count 1), the account bucket is
      // over (count 4 of 3).
      const evalMock = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(4);
      const client = {
        eval: evalMock,
        ttl: () => Promise.resolve(600),
      } as unknown as Redis;
      const guard = new RateLimitGuard(client, new Reflector());
      const { context, headers } = contextFor(
        { [RATE_LIMIT_KEY]: options },
        { method: 'POST', path: '/auth/login', body: { email: 'someone@example.test' } },
      );

      // Act
      const attempt = guard.canActivate(context);

      // Assert — the same envelope as an address limit; nothing says which
      // bucket tripped, because that would say whether the account is known
      // to be under attack.
      await expect(attempt).rejects.toBeInstanceOf(HttpException);
      await attempt.catch((error: HttpException) => {
        expect(error.getStatus()).toBe(429);
        expect(error.getResponse()).toMatchObject({
          error: { code: 'RATE_LIMITED', details: { retry_after_seconds: 600 } },
        });
      });
      expect(headers.get('Retry-After')).toBe(600);
    });

    it('skips the identifier bucket when the body carries no such field', async () => {
      // A malformed body is refused by validation a moment later; the limiter
      // does not invent an identifier for it.
      const redis = scriptedRedis(1);
      const guard = new RateLimitGuard(redis.client, new Reflector());
      const { context } = contextFor(
        { [RATE_LIMIT_KEY]: options },
        { method: 'POST', path: '/auth/login', body: { password: 'x' } },
      );

      await guard.canActivate(context);

      expect(redis.eval).toHaveBeenCalledTimes(1);
    });
  });

  it('fails open, and says so, when Redis is unreachable', async () => {
    // Arrange — the documented trade: an abuse control must not become an
    // outage. The log line is the part that keeps it honest.
    const redis = scriptedRedis(new Error('ECONNREFUSED'));
    const guard = new RateLimitGuard(redis.client, new Reflector());
    const { context } = contextFor();
    const logged: string[] = [];
    (guard as unknown as { logger: { error: (m: string) => void } }).logger = {
      error: (message: string) => logged.push(message),
    };

    // Act
    const allowed = await guard.canActivate(context);

    // Assert
    expect(allowed).toBe(true);
    expect(logged.join('\n')).toMatch(/unavailable/i);
  });
});
