import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PullQuery, PullResponse, SyncTable } from '@triptrackr/contracts';

/**
 * `GET /sync/pull` (sync-protocol.md §1; FR-039, FR-042; research D-16).
 *
 * The one read path that includes tombstones, and says so by calling
 * `includingDeleted` from `common/db/soft-delete.scope.ts`.
 */
@Injectable()
export class PullService {
  pull(_query: PullQuery): Promise<PullResponse> {
    return Promise.reject(
      new NotImplementedException('GET /sync/pull is not implemented yet.'),
    );
  }

  /**
   * One row of `table`, in that table's pull shape, tombstones included, or
   * null when the caller cannot see it. The push service's `conflict` result
   * carries this as `server_version`, so the wire shape of a stored row is
   * produced in exactly one place.
   */
  readOne(_table: SyncTable, _id: string): Promise<Record<string, unknown> | null> {
    return Promise.reject(
      new NotImplementedException('PullService.readOne is not implemented yet.'),
    );
  }
}
