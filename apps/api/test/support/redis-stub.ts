import type Redis from 'ioredis';

/**
 * An in-memory stand-in for the one Redis client the API holds.
 *
 * The database-backed suites boot a real PostgreSQL because an RLS policy is
 * only real when the real engine evaluates it (Constitution III). Redis holds
 * no traveller data and enforces no privacy rule — it counts requests — and
 * `test/setup.ts` deliberately starts no Redis container. `health.spec.ts`
 * therefore points REDIS_URL at a closed port and lets the limiter fail open,
 * which is the right fixture for every contract *except* the one about the
 * limiter itself (contract test 3, FR-071). That test needs counters that
 * count, so this implements exactly the commands `RateLimitGuard` issues and
 * nothing more:
 *
 *   - `eval` of the INCR-then-EXPIRE script (rate-limit.guard.ts HIT_SCRIPT),
 *     with the same semantics: the count after this hit, and a lifetime set
 *     only by the hit that created the key;
 *   - `ttl`, in whole seconds, as Redis reports it;
 *   - the `status`/`disconnect`/`quit` surface RedisModule touches at shutdown.
 *
 * What this does NOT prove is the Lua itself — that INCR and EXPIRE really run
 * as one server-side step. Atomicity is a property of the Redis server, and
 * the unit spec for the guard pins that the script is issued as a single
 * `eval`; together the two cover what a mock can honestly cover.
 */
export class InMemoryRedis {
  /** 'end' so RedisModule.onApplicationShutdown drops rather than QUITs. */
  readonly status = 'end';

  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  eval(_script: string, _numKeys: number, key: string, windowSeconds: number | string) {
    const now = Date.now();
    const existing = this.counters.get(key);

    if (existing && existing.expiresAt > now) {
      const next = { ...existing, count: existing.count + 1 };
      this.counters.set(key, next);
      return Promise.resolve(next.count);
    }

    this.counters.set(key, { count: 1, expiresAt: now + Number(windowSeconds) * 1_000 });
    return Promise.resolve(1);
  }

  ttl(key: string): Promise<number> {
    const entry = this.counters.get(key);
    if (!entry) return Promise.resolve(-2);

    return Promise.resolve(
      Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1_000)),
    );
  }

  disconnect(): void {
    this.counters.clear();
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }

  /** Every key currently counted, for assertions about what was bucketed. */
  keys(): readonly string[] {
    return [...this.counters.keys()];
  }

  /** Typed as the real client so it can stand in for REDIS_CLIENT. */
  asClient(): Redis {
    return this as unknown as Redis;
  }
}
