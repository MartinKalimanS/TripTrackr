import { PgDialect } from 'drizzle-orm/pg-core';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { PostgresJsSession } from 'drizzle-orm/postgres-js/session';
import type { Sql, TransactionSql } from 'postgres';

import { requireRlsTransaction } from '@/common/rls/rls-context';

/** The typed query builder, bound to the request's policed transaction. */
export type RlsDatabase = PostgresJsDatabase<Record<string, never>>;

/**
 * Shared, stateless. The dialect only knows how to spell PostgreSQL; there is
 * nothing per request in it.
 */
const dialect = new PgDialect();

/**
 * Drizzle over the request's RLS transaction.
 *
 * The `DRIZZLE` provider (db.module.ts) sits on the **pool**, and the pool is
 * exactly where an owned-table query must never run: `app.current_user_id` is
 * set with `SET LOCAL` inside the request's transaction, so a query on any
 * other connection has no identity and every policy predicate raises
 * (rls-context.ts). Typed queries against `trips`, `trip_stops`, `users` and
 * the rest therefore go through this — the same query builder, on the same
 * transaction `requireRlsTransaction()` returns.
 *
 * Built the way Drizzle builds its own nested transactions: a session over the
 * handle, a database over the session. `drizzle(tx)` is not used because the
 * factory reaches for `client.options` to install its type parsers, and a
 * postgres.js transaction handle has no `options` — only the pool does. The
 * parsers it would have installed are already installed, once, on the shared
 * options object by the `DRIZZLE` provider at boot.
 *
 * The cast is the one Drizzle makes internally: postgres.js types a
 * transaction handle apart from the pool handle, but the session calls
 * nothing on it except `unsafe()`, which both provide.
 */
export function rlsDb(): RlsDatabase {
  return drizzleOver(requireRlsTransaction());
}

/**
 * Drizzle over a transaction that already has its traveller's identity: the request's, or the
 * export job's (`workers/account-export.processor.ts`, which takes the identity with
 * `set_config` as the request path does, so row-level security filters everything it reads).
 */
export function drizzleOver(tx: TransactionSql): RlsDatabase {
  const session = new PostgresJsSession(tx as unknown as Sql, dialect, undefined, {});

  return new PostgresJsDatabase(dialect, session, undefined);
}
