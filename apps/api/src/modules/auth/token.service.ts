import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';

import { loadEnv } from '@/common/config/env.schema';
import { requireRlsTransaction } from '@/common/rls/rls-context';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AccessTokenClaims {
  readonly sub: string;
}

interface RefreshTokenRow {
  readonly id: string;
  readonly user_id: string;
  readonly revoked_at: Date | null;
  readonly expired: boolean;
}

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
 * bounds it.
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
   */
  async issueRefreshToken(
      userId: string,
      deviceInfo?: string,
      replacesId?: string,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');

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
   * Returns null for every failure. The caller must not tell the difference
   * between "unknown token", "expired" and "reused" — each distinction is a signal
   * an attacker can measure.
   */
  async rotate(presentedToken: string): Promise<TokenPair | null> {
    const tx = requireRlsTransaction();

    const rows = await tx<RefreshTokenRow[]>`
      SELECT * FROM auth_find_refresh_token(${hashToken(presentedToken)})
    `;

    const row = rows[0];
    if (!row) return null;

    if (row.revoked_at !== null) {
      this.logger.warn(
          `Refresh token reuse detected for user ${row.user_id}; revoking the whole family.`,
      );
      await this.revokeAllForUser(row.user_id);
      return null;
    }

    if (row.expired) return null;

    await tx`SELECT auth_revoke_refresh_tokens(${hashToken(presentedToken)}, NULL)`;

    return {
      accessToken: await this.issueAccessToken(row.user_id),
      refreshToken: await this.issueRefreshToken(row.user_id, undefined, row.id),
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