import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import type { Sql } from 'postgres';

import { ACCESS_TOKEN_ALGORITHM } from '@/common/auth/token-algorithm';
import { loadEnv } from '@/common/config/env.schema';
import { PG_CONNECTION } from '@/common/db/db.module';
import { runInRlsContext } from './rls-context';

interface AccessTokenClaims {
  readonly sub: string;
}

/**
 * Thrown solely to make `sql.begin` roll back. The response has already been
 * decided by the time this is raised, so it carries no information for the
 * caller — it is a control signal to PostgreSQL, and is swallowed once it has
 * done its job.
 */
class RlsTransactionRollback extends Error {}

/** The generic 500 sent when the COMMIT itself fails after a 2xx was decided. */
const COMMIT_FAILED_BODY = JSON.stringify({
  error: {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong on our side. Please try again.',
  },
});

/**
 * Opens the request's transaction and establishes who is asking
 * (contracts/data-access-policy.md §1).
 *
 * ```sql
 * SET LOCAL app.current_user_id = '<uuid>';
 * ```
 *
 * Three properties of this are the guarantee, not implementation detail:
 *
 * 1. **SET LOCAL, inside the same transaction the queries run in.** Scoped to the
 *    transaction, so a pooled connection cannot leak one traveller's identity
 *    into another's request.
 * 2. **An unauthenticated request sets nothing at all.** Not an empty string, not
 *    a sentinel uuid. `current_setting('app.current_user_id')` then raises inside
 *    every policy predicate and the query fails closed. A default value here
 *    would be a default value for *who you are*.
 * 3. **Middleware, not a guard.** Guards run after the request has already been
 *    routed, and a controller could read the database before one fires. This runs
 *    first, so there is no window in which a query can execute outside a policed
 *    transaction.
 *
 * Verifying the access token here rather than deferring to the JWT guard is
 * deliberate for the same reason as (3): the guard decides whether the route is
 * *permitted*, which is an authorisation question and arrives later. This decides
 * whose rows exist at all. A request with a missing, expired, or forged token is
 * not rejected here — it simply gets no identity, and the guard turns that into a
 * clean 401 rather than a database error surfacing to the traveller.
 */
@Injectable()
export class RlsSessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RlsSessionMiddleware.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly sql: Sql,
    private readonly jwt: JwtService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = await this.resolveUserId(req);
    const held = new HeldResponse(res);

    try {
      await this.sql.begin(async (tx) => {
        if (userId) {
          // Parameterised, so a token subject that is not a uuid cannot become
          // SQL. set_config(..., is_local => true) is SET LOCAL in a form that
          // accepts a bind parameter; `SET LOCAL x = $1` does not.
          await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
        }

        // Everything downstream — guards, controllers, services, repositories —
        // runs inside this transaction and reaches it via requireRlsTransaction().
        await runInRlsContext({ tx, userId }, () =>
          this.runPipeline(req, res, held, next),
        );
      });
      // COMMIT has returned: the write is durable and visible to the next
      // request before the caller can possibly send one.
      held.release();
    } catch (error: unknown) {
      if (error instanceof RlsTransactionRollback) {
        // A deliberate rollback — a 5xx, or a client that hung up — is the
        // expected outcome and needs no further noise; the response the filter
        // decided goes out as decided.
        held.release();
        return;
      }
      // The COMMIT itself failed after a success was decided. Nothing has been
      // sent yet, so the traveller is told the truth: it did not happen. Logged
      // rather than rethrown — Express does not await middleware, so a
      // rejection here would be an unhandled one, and Node's default for
      // those is to end the process over a single request.
      held.fail();
      this.logger.error(
        `Request transaction failed to commit: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Bridges Express's callback pipeline to the promise `sql.begin` needs.
   *
   * The transaction must stay open until the handler has produced its response,
   * or a controller's query would run against a transaction that has already
   * committed — and it must COMMIT before that response leaves the process, or
   * a fast client could ask for what it just wrote and be told it does not
   * exist. `HeldResponse` is what reconciles the two: the handler's final write
   * is captured rather than sent, the transaction settles on it, and `use()`
   * releases the bytes once PostgreSQL has answered the COMMIT.
   *
   * Express reports downstream failures by routing them to an error handler, not
   * by calling anything this middleware holds — by the time the final write
   * arrives here the exception filter has already turned the error into a
   * response. So the status code is what this reads:
   *
   *   < 500  commit. A 400 or a 404 is a considered answer, and any write that
   *          got as far as being attempted was meant to happen.
   *   >= 500 roll back. The request failed in a way nobody chose, and a
   *          half-applied write is worse than none.
   *
   * A client that disconnects before the response is decided also rolls back:
   * the traveller never learned whether it worked, so leaving it applied would
   * be a silent divergence between what they saw and what the server kept.
   * The rollback still waits for the handler's answer: the handler is still
   * running and may still query, and a query sent after the ROLLBACK would run
   * on whichever request borrowed the connection next. A response decided
   * before the pipeline ran settles at once, and the handler is never invoked.
   */
  private runPipeline(
    req: Request,
    res: Response,
    held: HeldResponse,
    next: NextFunction,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let clientGone = false;
      const settle = (): void => {
        if (settled) return;
        settled = true;
        res.removeListener('close', onClose);

        if (clientGone) {
          reject(
            new RlsTransactionRollback(
              'client disconnected before the response completed',
            ),
          );
          return;
        }

        if (res.statusCode >= 500) {
          reject(
            new RlsTransactionRollback(`request failed with status ${res.statusCode}`),
          );
          return;
        }

        resolve();
      };

      const onClose = (): void => {
        if (!res.writableEnded) clientGone = true;
      };

      res.once('close', onClose);
      held.onDecided(settle);

      if (!settled) next();
    });
  }

  private async resolveUserId(req: Request): Promise<string | null> {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) return null;

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(header.slice(7), {
        secret: loadEnv().JWT_ACCESS_SECRET,
        // The same single algorithm the service signs with. Left open, the
        // verifier would honour whatever `alg` the token's own header claims —
        // and the token is the attacker's to write.
        algorithms: [ACCESS_TOKEN_ALGORITHM],
      });

      return claims.sub || null;
    } catch {
      // An unverifiable token is treated exactly as no token: no identity, and
      // the policies close. Distinguishing "expired" from "forged" to the caller
      // is the guard's job (FR-072 — no internal detail in the response).
      return null;
    }
  }
}

type EndArguments = Parameters<Response['end']>;

/**
 * Captures the response's final write so it can be released after COMMIT.
 *
 * Nest writes a JSON response with one `res.end(body)` (Express's `res.json`
 * → `res.send` → `res.end`), and the exception filter does the same for an
 * error, so intercepting `end` catches every response this API produces
 * without touching what the handler decided — status, headers and body are
 * exactly as set. The write is parked; `onDecided` tells the transaction it
 * may settle; `release()` performs the parked write once PostgreSQL has
 * answered, and `fail()` replaces it with a generic 500 when the COMMIT
 * itself failed — possible only because the headers have not gone out yet.
 *
 * A handler that streams with `res.write` before `end` sends its headers at
 * the first write, as before; nothing here streams, and a route that one day
 * does should not be wrapped in a request-long transaction anyway.
 */
export class HeldResponse {
  private parked: EndArguments | null = null;
  private decided: (() => void) | null = null;
  private done = false;
  private readonly originalEnd: (...args: EndArguments) => Response;

  constructor(private readonly res: Response) {
    this.originalEnd = res.end.bind(res) as (...args: EndArguments) => Response;
    res.end = ((...args: EndArguments): Response => {
      if (this.done) return this.originalEnd(...args);
      this.parked = args;
      this.decided?.();
      return res;
    }) as Response['end'];
  }

  /** Called once, when the handler's final write arrives. */
  onDecided(listener: () => void): void {
    this.decided = listener;
    if (this.parked) listener();
  }

  /** Sends the response exactly as the handler decided it. */
  release(): void {
    if (this.done) return;
    this.done = true;
    this.res.end = this.originalEnd as Response['end'];
    if (this.parked) this.originalEnd(...this.parked);
  }

  /** The COMMIT failed after a success was decided: a 500 goes out instead. */
  fail(): void {
    if (this.done) return;
    this.done = true;
    this.res.end = this.originalEnd as Response['end'];
    if (this.res.headersSent) {
      this.res.destroy();
      return;
    }
    this.res.status(500);
    this.res.setHeader('content-type', 'application/json; charset=utf-8');
    this.res.removeHeader('content-length');
    (this.originalEnd as (chunk: string) => Response)(COMMIT_FAILED_BODY);
  }
}
