import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { requireRlsTransaction } from '@/common/rls/rls-context';

import { hashToken } from './token.service';

/** 256 bits: nothing to guess. */
const NONCE_BYTES = 32;

/** Long enough for a person to finish a provider sheet, short enough to be worth nothing later. */
export const NONCE_TTL = '10 minutes';

/**
 * Single-use nonces for Sign in with Google and Apple (spec 012). Only the SHA-256 of a nonce is
 * stored (0016), through the two `auth_*_oauth_nonce` keyholes: the table is deny-all to the API.
 */
@Injectable()
export class OAuthNonceService {
  /** `POST /auth/oauth/nonce`. */
  async issue(): Promise<string> {
    const nonce = randomBytes(NONCE_BYTES).toString('base64url');

    await requireRlsTransaction()`
      SELECT auth_issue_oauth_nonce(${hashToken(nonce)}, ${NONCE_TTL}::interval)
    `;

    return nonce;
  }

  /** True exactly once for a live nonce; unknown, spent and expired are all false. */
  async consume(nonce: string): Promise<boolean> {
    const [row] = await requireRlsTransaction()<{ ok: boolean }[]>`
      SELECT auth_consume_oauth_nonce(${hashToken(nonce)}) AS ok
    `;

    return row?.ok === true;
  }
}
