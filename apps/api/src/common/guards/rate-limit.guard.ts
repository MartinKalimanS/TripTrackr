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
import { createHash } from 'node:crypto';

import { REDIS_CLIENT } from '@/common/redis/redis.module';
import { getCurrentUserId } from '@/common/rls/rls-context';

/** A ceiling on one bucket: this many hits in this many seconds. */
export interface RateWindow {
  /** Requests allowed within the window. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSeconds: number;
}

export interface RateLimit extends RateWindow {
  /**
   * A second ceiling, keyed on the *account* the request is about rather than
   * on who is asking (FR-071; rest-api.md §1 "limited per IP and per account
   * identifier"). `field` names a body field — `email` on the auth routes —
   * whose value identifies the account. A guess distributed across many
   * addresses against one email is still one attack on one account, and this
   * is the bucket that sees it.
   */
  readonly perIdentifier?: RateWindow & { readonly field: string };
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

/** One counted bucket: the key it lives under and the ceiling that applies to it. */
interface Bucket {
  readonly key: string;
  readonly window: RateWindow;
}

/**
 * Per-account rate limiting (FR-071).
 *
 * Keyed on the authenticated traveller, falling back to client IP only when there
 * is no identity. Keying on IP alone would put an entire office or a mobile
 * carrier's NAT pool into one bucket, so one heavy user would throttle strangers.
 * Routes that declare `perIdentifier` are counted a second time, per account
 * named in the request, so that the pre-authentication routes — where there is
 * no traveller identity yet — still see an attack on one account for what it is.
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
    const buckets = this.bucketsFor(request, options);

    try {
      const counts = await Promise.all(buckets.map((bucket) => this.hit(bucket)));
      const exceeded = buckets.find(
        (bucket, i) => (counts[i] ?? 0) > bucket.window.limit,
      );

      // The tightest remaining allowance across buckets — what the caller can
      // still do — under the principal bucket's ceiling.
      const remaining = Math.min(
        ...buckets.map((bucket, i) =>
          Math.max(0, bucket.window.limit - (counts[i] ?? 0)),
        ),
      );
      response.setHeader('X-RateLimit-Limit', options.limit);
      response.setHeader('X-RateLimit-Remaining', remaining);

      if (exceeded) {
        throw await this.limited(exceeded, response);
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

  private async hit(bucket: Bucket): Promise<number> {
    return Number(
      await this.redis.eval(HIT_SCRIPT, 1, bucket.key, bucket.window.windowSeconds),
    );
  }

  /**
   * The 429. Deliberately the same whichever bucket tripped: saying "this
   * account is being throttled" would tell a caller the account is under
   * attack — or that it exists (rest-api.md §1).
   */
  private async limited(bucket: Bucket, response: Response): Promise<HttpException> {
    const retryAfter = await this.retryAfterSeconds(bucket);
    response.setHeader('Retry-After', retryAfter);

    // FR-071 and FR-072: says what happened and when to come back, and
    // nothing about the mechanism.
    return new HttpException(
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

  private bucketsFor(request: Request, options: RateLimit): readonly Bucket[] {
    const route = routeOf(request);
    const principal: Bucket = {
      key: bucketKey(principalOf(request), request.method, route, options),
      window: options,
    };

    const identifier =
      options.perIdentifier && identifierOf(request, options.perIdentifier.field);
    if (!options.perIdentifier || !identifier) return [principal];

    return [
      principal,
      {
        key: bucketKey(
          `acct:${identifier}`,
          request.method,
          route,
          options.perIdentifier,
        ),
        window: options.perIdentifier,
      },
    ];
  }

  private async retryAfterSeconds(bucket: Bucket): Promise<number> {
    const ttl = await this.redis.ttl(bucket.key);
    return ttl > 0 ? ttl : bucket.window.windowSeconds;
  }
}

/**
 * Who is asking. Read from the RLS context rather than from `request.user`:
 * the middleware has already verified the token, and reading the identity from
 * one place means the limiter and the policies can never disagree about it.
 */
function principalOf(request: Request): string {
  const userId = getCurrentUserId();
  return userId ? `u:${userId}` : `ip:${request.ip ?? 'unknown'}`;
}

/**
 * `request.route` is `any` in Express's types. The route pattern is preferred
 * over the concrete path so that `/trips/:id` shares one bucket across every
 * id rather than handing an attacker a fresh allowance per url.
 */
function routeOf(request: Request): string {
  const route = (request.route as { path?: string } | undefined)?.path;
  return route ?? request.path;
}

/**
 * The account identifier named in the body, folded and hashed.
 *
 * Folded — trimmed, lower-cased — so that `Someone@Example.test` and
 * `someone@example.test` are one account and one bucket, which is also how the
 * contract normalises the address before it reaches the handler. Hashed so the
 * key space holds no email addresses: Redis is not a place that needs to know
 * who is signing in, and a key listing must not become a user directory.
 *
 * A body without the field, or with something that is not a string, yields no
 * identifier and no second bucket; validation refuses that request a moment
 * later on its own terms.
 */
function identifierOf(request: Request, field: string): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const value = body?.[field];

  if (typeof value !== 'string' || value.trim() === '') return null;

  return createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

function bucketKey(principal: string, method: string, route: string, window: RateWindow) {
  const slot = Math.floor(Date.now() / 1000 / window.windowSeconds);
  return `ratelimit:${principal}:${method}:${route}:${slot}`;
}
