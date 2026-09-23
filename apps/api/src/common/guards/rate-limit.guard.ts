import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { getCurrentUserId } from '@/common/rls/rls-context';

export interface RateLimit {
  /** Requests allowed within the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

/** `@RateLimited({ limit: 10, windowSeconds: 60 })` */
export const RateLimited = (options: RateLimit) => SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Applied to every request, so an endpoint that declares nothing still has a
 * ceiling. An unannotated endpoint is far more likely to be an oversight than a
 * deliberate decision to allow unlimited traffic.
 */
const DEFAULT_LIMIT: RateLimit = { limit: 120, windowSeconds: 60 };

/**
 * Count a hit and, if this hit created the counter, give it a lifetime — as one
 * server-side step.
 *
 * Run as two commands, INCR then EXPIRE, there is a gap between them. A process
 * that dies in the gap, or a second request that lands in it and sees a count of
 * 2, leaves a counter with no expiry: a bucket that never empties, and a caller
 * locked out of that route until someone notices. Redis executes a script
 * atomically, so the counter and its expiry are created together or not at all.
 *
 * Only the creating hit sets the TTL. Refreshing it on every hit would turn a
 * fixed window into a sliding one that never expires under sustained load.
 */
const HIT_SCRIPT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return count
`;

/**
 * Per-account rate limiting (FR-071).
 *
 * Keyed on the authenticated traveller, falling back to client IP only when there
 * is no identity. Keying on IP alone would put an entire office or a mobile
 * carrier's NAT pool into one bucket, so one heavy user would throttle strangers.
 *
 * **Fixed window, not a token bucket.** A fixed window lets a caller send `limit`
 * requests at the end of one window and `limit` again at the start of the next.
 * That burst is acceptable here because this layer exists to stop runaway clients
 * and casual scraping, and Traefik applies a coarser global ceiling in front of it
 * (plan.md). The counter is one atomic script ({@link HIT_SCRIPT}), which is
 * worth more at this tier than smoothing the edge.
 *
 * **Unreachable Redis fails OPEN, loudly.** This is a deliberate trade and the
 * opposite of how the privacy layer behaves. RLS fails closed because the cost of
 * being wrong is disclosing a traveller's data. A rate limiter that failed closed
 * during a Redis blip would return 429 to every traveller for a legitimate
 * request — it would convert a cache outage into a full outage. Rate limiting is
 * an abuse control, not an access control, and nothing behind it depends on it for
 * correctness. The error is logged at error level so the outage is visible rather
 * than absorbed.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimit>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_LIMIT;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = this.bucketKey(request, options);

    try {
      const count = Number(
        await this.redis.eval(HIT_SCRIPT, 1, key, options.windowSeconds),
      );

      const remaining = Math.max(0, options.limit - count);
      response.setHeader('X-RateLimit-Limit', options.limit);
      response.setHeader('X-RateLimit-Remaining', remaining);

      if (count > options.limit) {
        const retryAfter = await this.retryAfterSeconds(key, options);
        response.setHeader('Retry-After', retryAfter);

        // FR-071 and FR-072: says what happened and when to come back, and
        // nothing about the mechanism.
        throw new HttpException(
          {
            error: {
              code: 'RATE_LIMITED',
              message: `Too many requests. Please try again in ${retryAfter} seconds.`,
              details: { retry_after_seconds: retryAfter },
            },
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;

      this.logger.error(
        'Rate limiting is unavailable; allowing the request. Redis is unreachable.',
        error instanceof Error ? error.stack : String(error),
      );

      return true;
    }
  }

  private bucketKey(request: Request, options: RateLimit): string {
    // Read from the RLS context rather than from `request.user`: the middleware
    // has already verified the token, and reading the identity from one place
    // means the limiter and the policies can never disagree about who is asking.
    const userId = getCurrentUserId();
    const principal = userId ? `u:${userId}` : `ip:${request.ip ?? 'unknown'}`;
    const window = Math.floor(Date.now() / 1000 / options.windowSeconds);

    // `request.route` is `any` in Express's types. The route pattern is preferred
    // over the concrete path so that `/trips/:id` shares one bucket across every
    // id rather than handing an attacker a fresh allowance per url.
    const route = (request.route as { path?: string } | undefined)?.path;

    return `ratelimit:${principal}:${request.method}:${route ?? request.path}:${window}`;
  }

  private async retryAfterSeconds(key: string, options: RateLimit): Promise<number> {
    const ttl = await this.redis.ttl(key);
    return ttl > 0 ? ttl : options.windowSeconds;
  }
}
