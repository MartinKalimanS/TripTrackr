import { Injectable, NotImplementedException } from '@nestjs/common';
import type { PushResponse } from '@triptrackr/contracts';

/**
 * `POST /sync/push` (sync-protocol.md §2; FR-040; research D-02, D-08, D-15, D-16).
 *
 * Owns the conflict rule: the only implementation of it in the system.
 */
@Injectable()
export class PushService {
  push(_body: unknown): Promise<PushResponse> {
    return Promise.reject(
      new NotImplementedException('POST /sync/push is not implemented yet.'),
    );
  }
}
