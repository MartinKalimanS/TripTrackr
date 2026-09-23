import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from '@/db/schema';
import { loadEnv } from '@/common/config/env.schema';

export const PG_CONNECTION = Symbol('PG_CONNECTION');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * Ceilings on how long a connection may sit idle, wait to be established, or
 * run one statement.
 *
 * A request holds a connection for the life of its transaction, so a statement
 * that never returns is a connection the pool never gets back; twenty of them is
 * an outage. The statement ceiling is generous enough for a full sync snapshot
 * and far below the point at which a traveller has given up. Idle connections
 * are released so a quiet API does not pin twenty backends on a modest VPS.
 */
const POOL_MAX_CONNECTIONS = 20;
const IDLE_TIMEOUT_SECONDS = 30;
const CONNECT_TIMEOUT_SECONDS = 10;
const STATEMENT_TIMEOUT_MS = 30_000;

/**
 * The one connection pool, and the Drizzle instance over it.
 *
 * DATABASE_URL names the **API** role — a non-superuser that does not own the
 * tables (0003_api_role.sql). Migrations connect separately, as a privileged
 * role through MIGRATION_DATABASE_URL, so the API can never alter the policies
 * it is subject to (contracts/data-access-policy.md §1, research D-20). Pointing
 * this at the migration role would leave every policy in place and silently
 * stop enforcing them; adversarial test 17 reads `current_user` from this pool
 * for exactly that reason.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_CONNECTION,
      useFactory: (): Sql => {
        const env = loadEnv();
        return postgres(env.DATABASE_URL, {
          // Every request runs inside its own transaction (see
          // RlsSessionMiddleware), so pooled connections are handed back and
          // forth constantly. SET LOCAL is what keeps one traveller's identity
          // from riding along into the next request that borrows the connection.
          max: POOL_MAX_CONNECTIONS,
          prepare: false,
          idle_timeout: IDLE_TIMEOUT_SECONDS,
          connect_timeout: CONNECT_TIMEOUT_SECONDS,
          connection: {
            // Sent as a startup parameter, so it binds the session before the
            // first query and cannot be forgotten by a code path.
            statement_timeout: STATEMENT_TIMEOUT_MS,
            // Names this process in pg_stat_activity, next to the migration
            // runner and the worker, so a stuck backend is attributable.
            application_name: 'triptrackr-api',
          },
        });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_CONNECTION],
      useFactory: (sql: Sql): Database => drizzle(sql, { schema }),
    },
  ],
  exports: [PG_CONNECTION, DRIZZLE],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_CONNECTION) private readonly sql: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
