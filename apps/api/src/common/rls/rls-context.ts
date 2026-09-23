import { AsyncLocalStorage } from 'node:async_hooks';
import type { TransactionSql } from 'postgres';

/**
 * The transaction the current request runs in.
 *
 * `app.current_user_id` is set with `SET LOCAL`, which scopes it to a single
 * transaction. That is the whole reason this exists: a repository that reached
 * for the pool instead of this transaction would run its query on a *different*
 * connection, where the session variable is unset — and every policy predicate
 * would then raise. The failure is loud rather than silent, which is the correct
 * direction for a mistake of this kind to fail, but it is still a mistake, and
 * `requireRlsTransaction()` names it plainly when it happens.
 *
 * AsyncLocalStorage rather than a request-scoped provider: request scoping in
 * NestJS propagates by rebuilding the injector subtree per request, which does
 * not reach queue workers or anything invoked outside the DI graph. The async
 * context follows the actual execution.
 */
export interface RlsContext {
  /** The transaction every query in this request must use. */
  readonly tx: TransactionSql;
  /** Null for an unauthenticated request — see RlsSessionMiddleware. */
  readonly userId: string | null;
}

const storage = new AsyncLocalStorage<RlsContext>();

export function runInRlsContext<T>(
  context: RlsContext,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(context, fn);
}

/** The context, or null outside a request. */
export function getRlsContext(): RlsContext | null {
  return storage.getStore() ?? null;
}

/**
 * The transaction, or a thrown error naming the mistake.
 *
 * Deliberately not a fallback to the pool. A fallback would run the query on a
 * connection with no session identity, and while RLS would still refuse it, the
 * resulting error would point at PostgreSQL rather than at the code that forgot
 * to use the request's transaction.
 */
export function requireRlsTransaction(): TransactionSql {
  const context = storage.getStore();

  if (!context) {
    throw new Error(
      'No RLS transaction is open. Every database read must run inside the ' +
        'request transaction established by RlsSessionMiddleware, because ' +
        'app.current_user_id is set with SET LOCAL and does not exist outside it.',
    );
  }

  return context.tx;
}

/** The authenticated traveller's id, or null. */
export function getCurrentUserId(): string | null {
  return storage.getStore()?.userId ?? null;
}

/**
 * The authenticated traveller's id, for code that may only run authenticated.
 *
 * The JwtAuthGuard has already turned "no identity" into a 401 for every
 * non-public route, so reaching this without one is a wiring mistake — a
 * handler marked `@Public()` that then asks who is calling — and is named as
 * such rather than becoming a `null` that flows into a query.
 */
export function requireCurrentUserId(): string {
  const userId = getCurrentUserId();

  if (!userId) {
    throw new Error(
      'No authenticated traveller in the RLS context. This code path requires the ' +
        'JwtAuthGuard; a @Public() route cannot call it.',
    );
  }

  return userId;
}

/**
 * Establishes an identity part-way through a request that began without one.
 *
 * Login, registration and OAuth sign-in all start anonymous — that is the whole
 * point of the `auth_*` keyholes (0006, 0008) — and end with a traveller whose
 * password or provider token has just been verified. The response needs that
 * traveller's profile, and the profile lives on a policed table. Rather than
 * add a keyhole that reads profiles for any id, the request *becomes* the
 * traveller: `app.current_user_id` is set on the same transaction, with the
 * same `SET LOCAL` scope, exactly as RlsSessionMiddleware would have done had
 * the request carried a valid access token. The read then goes through
 * `users_self_all` like every other read of that row.
 *
 * Scoped: the JavaScript context reverts when `fn` settles, and the database
 * setting dies with the transaction at the end of the request. Nothing here
 * defaults an identity — `userId` is the one verification just produced.
 */
export async function asAuthenticated<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const tx = requireRlsTransaction();

  await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;

  return runInRlsContext({ tx, userId }, fn);
}
