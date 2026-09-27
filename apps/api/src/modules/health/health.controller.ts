import { Controller, Get, Inject } from '@nestjs/common';
import type { Sql } from 'postgres';

import { Public } from '@/common/auth/jwt.guard';
import { PG_CONNECTION } from '@/common/db/db.module';

export interface HealthBody {
  readonly status: 'ok';
}

/**
 * `GET /health` — the answer the container orchestrator acts on.
 *
 * Lives at `/health`, outside the `/v1` prefix (app.setup.ts), because the
 * Dockerfile's HEALTHCHECK and the reverse proxy probe a fixed path that must
 * not move when the API version does.
 *
 * `@Public()`: the global JwtAuthGuard would otherwise answer 401, the
 * orchestrator would read that as unhealthy, and a perfectly working API would
 * be restarted in a loop. RlsSessionMiddleware still wraps the request in a
 * transaction — no route is excluded from it (rls.module.ts) — and sets no
 * identity, which is fine: `SELECT 1` touches no policed table, so there is
 * nothing to fail closed on.
 *
 * The query goes through the pool rather than the request transaction on
 * purpose. What this probe asks is "can this process reach its database", and
 * the pool is the thing that answers it; borrowing the middleware's transaction
 * would only prove that one connection was already open. A pool that cannot
 * hand out a connection rejects, the exception filter turns that into a 500,
 * and the orchestrator sees an unhealthy process — which it is.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_CONNECTION) private readonly sql: Sql) {}

  @Get()
  async check(): Promise<HealthBody> {
    await this.sql`SELECT 1`;

    return { status: 'ok' };
  }
}
