import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from '@/db/schema';
import { loadEnv } from '@/common/config/env.schema';

export const PG_CONNECTION = Symbol('PG_CONNECTION');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * The one connection pool, and the Drizzle instance over it.
 *
 * DATABASE_URL names the **API** role — a non-superuser that does not own the
 * tables (0003_api_role.sql). Migrations connect separately, as a privileged
 * role, so the API can never alter the policies it is subject to
 * (contracts/data-access-policy.md §1). Pointing this at the migration role
 * would leave every policy in place and silently stop enforcing them.
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
          max: 20,
          prepare: false,
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
