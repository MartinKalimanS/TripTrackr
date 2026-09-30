import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PullQuery, PullResponse } from '@triptrackr/contracts';

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
}
