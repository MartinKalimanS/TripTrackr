import { Controller, Get, Header, Query } from '@nestjs/common';
import { PullQuery, PullResponse } from '@triptrackr/contracts';
import { z } from 'zod';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { PullService } from './pull.service';

/**
 * A query string carries `tables` as one comma-separated value
 * (`?tables=trips,notes`, sync-protocol.md §1); the wire schema in
 * `@triptrackr/contracts` describes it as the array it means. The split lives
 * here, at the HTTP edge, and nothing else about the schema is restated: the
 * split value is then validated by `PullQuery` itself, so an unknown table, an
 * empty entry or a stray parameter is refused by the contract and not by this
 * file. A repeated parameter (`?tables=trips&tables=notes`) already arrives as
 * an array and passes through.
 */
const PullQueryParams = z.preprocess(splitTables, PullQuery);

function splitTables(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;

  const query = raw as Record<string, unknown>;
  if (typeof query.tables !== 'string') return raw;

  return { ...query, tables: query.tables.split(',') };
}

/**
 * The response carries a passenger name, unsealed from a boarding pass
 * (FR-033), so no cache between the server and the device may keep it.
 */
const NO_STORE = 'no-store';

/** `GET /sync/pull` (sync-protocol.md §1). Access rule: owner, by RLS. */
@Controller('sync')
export class SyncPullController {
  constructor(private readonly pullService: PullService) {}

  @Get('pull')
  @Header('Cache-Control', NO_STORE)
  async pull(
    @Query(new ZodValidationPipe(PullQueryParams)) query: PullQuery,
  ): Promise<PullResponse> {
    return respond(PullResponse, await this.pullService.pull(query));
  }
}
