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
