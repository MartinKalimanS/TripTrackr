import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
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
 * written by the time this is raised, so it carries no information for the
 * caller — it is a control signal to PostgreSQL, and is swallowed once it has
 * done its job.
 */
class RlsTransactionRollback extends Error {}

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
  constructor(
    @Inject(PG_CONNECTION) private readonly sql: Sql,
    private readonly jwt: JwtService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = await this.resolveUserId(req);

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
        await runInRlsContext({ tx, userId }, () => this.runPipeline(req, res, next));
      });
    } catch (error: unknown) {
      // The response is already written either way; rethrowing would only produce
      // an unhandled rejection. A deliberate rollback is the expected outcome of a
      // 5xx and needs no further noise. Anything else is a genuine transaction
      // failure and belongs in the log, which the logging module (T031) collects.
      if (!(error instanceof RlsTransactionRollback)) throw error;
    }
  }

  /**
   * Bridges Express's callback pipeline to the promise `sql.begin` needs.
   *
   * The transaction must stay open until the response is finished, or a
   * controller's query would run against a transaction that has already
   * committed. It settles on `finish` (response fully written) or `close` (client
   * hung up mid-response), because after either there is nothing left to query.
   *
   * Express reports downstream failures by routing them to an error handler, not
   * by calling anything this middleware holds — by the time control returns here
   * the exception filter has already turned the error into a response. So the
   * status code is what this reads:
   *
   *   < 500  commit. A 400 or a 404 is a considered answer, and any write that
   *          got as far as being attempted was meant to happen.
   *   >= 500 roll back. The request failed in a way nobody chose, and a
   *          half-applied write is worse than none.
   *
   * A client that disconnects mid-response also rolls back: the traveller never
   * learned whether it worked, so leaving it applied would be a silent divergence
   * between what they saw and what the server kept.
   */
  private runPipeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const settle = (aborted: boolean): void => {
        res.removeListener('finish', onFinish);
        res.removeListener('close', onClose);

        if (aborted) {
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

      const onFinish = (): void => settle(false);
      const onClose = (): void => settle(!res.writableEnded);

      res.once('finish', onFinish);
      res.once('close', onClose);

      next();
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
