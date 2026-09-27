import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { ACCESS_TOKEN_ALGORITHM } from '@/common/auth/token-algorithm';
import { loadEnv } from '@/common/config/env.schema';
import { requireRlsTransaction } from '@/common/rls/rls-context';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
}

/**
 * What presenting a refresh token produced.
 *
 * `rejected` covers an unknown token and an expired one alike — the caller
 * must not be able to tell those apart. `reused` is deliberately distinct:
 * see {@link TokenService.rotate}.
 */
export type RotationOutcome =
  | { readonly status: 'rotated'; readonly pair: TokenPair }
  | { readonly status: 'reused' }
  | { readonly status: 'rejected' };

/** One row from `auth_consume_refresh_token` (0007). */
interface ConsumedRefreshToken {
  readonly id: string;
  readonly user_id: string;
  readonly expired: boolean;
  /**
   * True when the row existed but had already been retired — by an earlier
   * rotation, a sign-out, or a concurrent caller that won the race. This is the
   * reuse signal FR-005 turns into a family-wide revocation.
   */
  readonly reused: boolean;
}

/** Bytes of entropy in a refresh token — 256 bits, nothing to guess. */
const REFRESH_TOKEN_BYTES = 32;

/**
 * Issues, rotates and revokes tokens (contracts/rest-api.md §1, FR-003–FR-005).
 *
 * Two token types, two different jobs:
 *
 * - **Access token** — a 15-minute JWT. Self-contained, so the RLS middleware can
 *   establish an identity without a database round trip on every request.
 * - **Refresh token** — an opaque 32-byte random string, stored only as a SHA-256
 *   hash, valid 30 days, rotated on every use. Opaque rather than a JWT because a
 *   refresh token must be *revocable*, and a self-contained token cannot be
 *   withdrawn before it expires.
 *
 * The hash is SHA-256 rather than Argon2, which is the opposite of the choice made
 * for passwords, and deliberately so. A refresh token is 256 bits of CSPRNG output
 * with no structure to guess; there is nothing for a slow hash to defend against,
 * and a slow hash would put ~100ms on every token rotation. Passwords are
 * low-entropy and human-chosen, which is what makes Argon2 right there and wrong
 * here.
 *
 * **Every statement below calls an `auth_*` function rather than touching a table.**
 * That is not indirection for its own sake: token rotation happens before the
 * request has an authenticated session, so a direct query would hit the RLS
 * policies and fail closed. `0006_auth_functions.sql` explains the bypass and
 * bounds it; 0007 makes it the *only* write path by revoking the API role's
 * direct INSERT/UPDATE/DELETE on `refresh_tokens`.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly jwt: JwtService) {}

  async issuePair(userId: string, deviceInfo?: string): Promise<TokenPair> {
    return {
      accessToken: await this.issueAccessToken(userId),
      refreshToken: await this.issueRefreshToken(userId, deviceInfo),
    };
  }

  async issueAccessToken(userId: string): Promise<string> {
    const env = loadEnv();

    return this.jwt.signAsync({ sub: userId } satisfies AccessTokenClaims, {
      secret: env.JWT_ACCESS_SECRET,
      algorithm: ACCESS_TOKEN_ALGORITHM,
      // A `jti` per token: two tokens minted for one traveller within the same
      // second would otherwise be byte-identical (iat has one-second
      // resolution), and a rotation that hands back the very token it retired
      // is indistinguishable from one that did nothing.
      jwtid: randomUUID(),
      // Typed through JwtSignOptions rather than `any`: the underlying library
      // accepts a `ms`-style template literal union that a plain string does not
      // satisfy, and widening to `any` there would also silence real mistakes in
      // the sibling options.
      expiresIn: env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'],
    });
  }

  /**
   * Mints a refresh token and records its hash.
   *
   * The plaintext is returned once and never stored, so a database dump yields no
   * usable token — the same reason password hashes are stored rather than
   * passwords.
   *
   * `replacesId` names the token this one retires. The function writes the link
   * on the *retired* row (`replaced_by_id`, pointing forward — data-model.md §2)
   * in the same statement as the insert.
   */
  async issueRefreshToken(
    userId: string,
    deviceInfo?: string,
    replacesId?: string,
  ): Promise<string> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    await requireRlsTransaction()`
      SELECT auth_insert_refresh_token(
        ${userId}::uuid,
        ${hashToken(token)},
        ${deviceInfo ?? null},
        ${toPostgresInterval(loadEnv().JWT_REFRESH_TTL)}::interval,
        ${replacesId ?? null}::uuid
      )
    `;

    return token;
  }

  /**
   * Rotates a refresh token, detecting reuse (FR-005).
   *
   * The contract is explicit that a plain rejection is insufficient: "a rotated
   * token in someone else's hands means the chain is compromised, and only the
   * thief benefits from failing quietly." So presenting an already-rotated or
   * already-revoked token revokes the entire family, logging every session out —
   * the thief's and the legitimate traveller's alike. Inconveniencing the owner is
   * the correct trade when the alternative is leaving an attacker holding a valid
   * chain.
   *
   * **The check and the revocation are one statement.** `auth_consume_refresh_token`
   * is an `UPDATE … WHERE revoked_at IS NULL RETURNING`, so two requests presenting
   * the same token at the same moment cannot both read "live" and both mint: the
   * second blocks on the row lock, re-reads the committed row, updates nothing, and
   * comes back with `reused = true`. The earlier read-then-revoke sequence let both
   * through, which is precisely the window a replayed stolen token needs.
   *
   * "Unknown" and "expired" are one outcome, `rejected`: the difference is a
   * signal an attacker can measure and a traveller cannot use. "Reused" is
   * reported as itself, and that is the other half of FR-005 — "inform the
   * account holder". The device presenting a retired token is as likely to be
   * the owner's, finding every session gone because a thief refreshed first,
   * as it is to be the thief's; telling it *why* it has been signed out is the
   * one channel that reaches the owner at that moment, and tells the thief
   * nothing they did not already know.
   */
  async rotate(presentedToken: string): Promise<RotationOutcome> {
    const tx = requireRlsTransaction();

    const rows = await tx<ConsumedRefreshToken[]>`
      SELECT * FROM auth_consume_refresh_token(${hashToken(presentedToken)})
    `;

    const row = rows[0];
    if (!row) return { status: 'rejected' };

    if (row.reused) {
      this.logger.warn(
        `Refresh token reuse detected for user ${row.user_id}; revoking the whole family.`,
      );
      await this.revokeAllForUser(row.user_id);
      return { status: 'reused' };
    }

    // Consumed — it cannot be presented again — but past its lifetime, so it
    // earns nothing. Ordered after the reuse check on purpose: a replayed token
    // that has also expired is still a replayed token.
    if (row.expired) return { status: 'rejected' };

    return {
      status: 'rotated',
      pair: {
        accessToken: await this.issueAccessToken(row.user_id),
        refreshToken: await this.issueRefreshToken(row.user_id, undefined, row.id),
      },
    };
  }

  /** FR-004 — sign out one device. */
  async revoke(presentedToken: string): Promise<void> {
    await requireRlsTransaction()`
      SELECT auth_revoke_refresh_tokens(${hashToken(presentedToken)}, NULL)
    `;
  }

  /** FR-004 — sign out everywhere, and the response to detected reuse. */
  async revokeAllForUser(userId: string): Promise<void> {
    await requireRlsTransaction()`
      SELECT auth_revoke_refresh_tokens(NULL, ${userId}::uuid)
    `;
  }
}

/**
 * SHA-256, hex. See the class comment for why this is not a slow hash. Unsalted on
 * purpose: the input is already uniformly random, and a salt would only prevent
 * the equality lookup this table is built around.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * `'30d'` → `'30 days'`, a PostgreSQL interval literal.
 *
 * The TTLs are configured in the compact form JWT libraries use, which PostgreSQL
 * does not read. Converting here keeps one value in the environment rather than
 * two that can drift apart.
 */
export function toPostgresInterval(value: string): string {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());

  if (!match) {
    throw new Error(
      `Token TTL must look like "30d", "12h", "15m" or "45s"; received "${value}".`,
    );
  }

  const units: Readonly<Record<string, string>> = {
    s: 'seconds',
    m: 'minutes',
    h: 'hours',
    d: 'days',
  };

  const [, amount, unit] = match;

  return `${amount as string} ${units[unit as string] as string}`;
}
