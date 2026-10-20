import { ApiRequestError } from '@/lib/api-client';

import { SyncAbortedError } from './context';
import type { SyncFailure } from './types';

/**
 * The server answered, but with something this build cannot use: a conflict
 * whose `server_version` does not match the table's pull shape, or a pull that
 * claims more pages without moving its cursor. Reported like any other
 * contract violation (`INVALID_RESPONSE`), never applied.
 */
export class SyncContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncContractError';
  }
}

/**
 * Map whatever a cycle threw onto the frozen `SyncFailure` vocabulary
 * (types.ts; sync-protocol.md §3):
 *
 *   status 0 NETWORK / TIMEOUT      -> `offline` (an ordinary state, Constitution II)
 *   401, SESSION_EXPIRED            -> `unauthorized` (the API client has signed out)
 *   INVALID_RESPONSE, contract      -> `invalid_response`
 *   an abandoned cycle              -> `unauthorized` (nobody is bound any more)
 *   everything else                 -> `server`
 */
export function classifyFailure(error: unknown): SyncFailure {
  if (error instanceof SyncAbortedError) return 'unauthorized';
  if (error instanceof SyncContractError) return 'invalid_response';
  if (error instanceof ApiRequestError) {
    if (error.code === 'INVALID_RESPONSE') return 'invalid_response';
    if (error.status === 401 || error.code === 'SESSION_EXPIRED') return 'unauthorized';
    if (error.status === 0 && (error.code === 'NETWORK' || error.code === 'TIMEOUT')) {
      return 'offline';
    }
  }
  return 'server';
}
