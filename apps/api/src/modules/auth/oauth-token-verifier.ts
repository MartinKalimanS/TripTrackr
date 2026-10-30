import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { createRemoteJWKSet, JWTPayload } from 'jose';
import { createHash, timingSafeEqual } from 'node:crypto';

import { loadEnv } from '@/common/config/env.schema';

export type OAuthProvider = 'google' | 'apple';

/** What a provider vouched for, reduced to what account creation needs. */
export interface VerifiedIdentity {
  readonly provider: OAuthProvider;
  /** The provider's stable subject — `oauth_identities.provider_uid`. */
  readonly subject: string;
  /** Lower-cased. Null when the provider sent none. */
  readonly email: string | null;
  /** Only a verified address may be linked to an existing account (0008). */
  readonly emailVerified: boolean;
  readonly displayName: string | null;
}

/** The token could not be verified. Says nothing about why, on purpose. */
export class OAuthTokenInvalidError extends Error {
  constructor(provider: OAuthProvider) {
    super(`The ${provider} token could not be verified.`);
    this.name = 'OAuthTokenInvalidError';
  }
}

/** No audience is configured for this provider, so no token can be checked. */
export class OAuthProviderUnavailableError extends Error {
  constructor(provider: OAuthProvider) {
    super(`Sign-in with ${provider} is not configured on this server.`);
    this.name = 'OAuthProviderUnavailableError';
  }
}

export const APPLE_ISSUER = 'https://appleid.apple.com';

/** Apple signs identity tokens with RS256 and nothing else; any other algorithm is refused. */
export const APPLE_ALGORITHMS = ['RS256'];
const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');

/** The two provider clients, as the slices this module calls. */
export interface OAuthClients {
  readonly google: {
    verifyIdToken(options: {
      idToken: string;
      audience: string[];
    }): Promise<{ getPayload(): TokenPayload | undefined }>;
  };
  readonly apple: {
    verify(
      token: string,
      options: { issuer: string; audience: string[]; algorithms: string[] },
    ): Promise<{ payload: JWTPayload }>;
  };
}

export const OAUTH_CLIENTS = Symbol('OAUTH_CLIENTS');

/**
 * The real clients. Built lazily: the JWKS fetch and the Google certificate
 * cache both happen on first use, so a process that never sees an OAuth
 * sign-in never opens a socket to either provider.
 *
 * `jose` ships as ES modules only, and this package compiles to CommonJS. It
 * is therefore loaded with `import()`, which is how CommonJS reaches an ES
 * module on every supported Node — and loaded here, at the first Apple
 * sign-in, rather than at module load, so that nothing that merely imports
 * this file (the unit specs, the wiring spec) has to be able to load it.
 */
function defaultClients(): OAuthClients {
  let google: OAuth2Client | undefined;
  let appleKeys: ReturnType<typeof createRemoteJWKSet> | undefined;

  return {
    google: {
      verifyIdToken: (options) => {
        google ??= new OAuth2Client();
        return google.verifyIdToken(options);
      },
    },
    apple: {
      verify: async (token, options) => {
        const jose = await import('jose');
        appleKeys ??= jose.createRemoteJWKSet(APPLE_JWKS_URL);
        return jose.jwtVerify(token, appleKeys, options);
      },
    },
  };
}

/**
 * Server-side verification of provider tokens (FR-002, rest-api.md §1).
 *
 * The client hands the API the token the provider gave it; the API checks the
 * signature against the provider's published keys and the audience against
 * the client ids this deployment owns. A token minted for some other app, or
 * by anyone but the provider, fails here — and fails with one error whatever
 * the reason, because "expired" versus "wrong audience" versus "bad signature"
 * is detail an attacker can use and a traveller cannot (FR-072). The provider
 * library's own message goes to the log.
 */
@Injectable()
export class OAuthTokenVerifier {
  private readonly logger = new Logger(OAuthTokenVerifier.name);
  private readonly clients: OAuthClients;

  constructor(@Optional() @Inject(OAUTH_CLIENTS) clients?: OAuthClients) {
    this.clients = clients ?? defaultClients();
  }

  async verifyGoogle(idToken: string, nonce: string): Promise<VerifiedIdentity> {
    const audience = configuredAudience('google', loadEnv().GOOGLE_OAUTH_CLIENT_IDS);

    const payload = await this.attempt('google', async () => {
      const ticket = await this.clients.google.verifyIdToken({ idToken, audience });
      return ticket.getPayload();
    });

    if (!payload?.sub || !nonceMatches(payload.nonce, nonce)) {
      throw new OAuthTokenInvalidError('google');
    }

    return {
      provider: 'google',
      subject: payload.sub,
      email: payload.email?.toLowerCase() ?? null,
      emailVerified: payload.email_verified === true,
      displayName: payload.name?.trim() || null,
    };
  }

  async verifyApple(identityToken: string, nonce: string): Promise<VerifiedIdentity> {
    const audience = configuredAudience('apple', loadEnv().APPLE_OAUTH_CLIENT_IDS);

    const payload = await this.attempt('apple', async () => {
      const { payload: claims } = await this.clients.apple.verify(identityToken, {
        issuer: APPLE_ISSUER,
        audience,
        algorithms: [...APPLE_ALGORITHMS],
      });
      return claims;
    });

    // The app hands Apple the SHA-256 of the nonce, so the raw value never appears in the token.
    if (!payload.sub || !nonceMatches(payload.nonce, sha256Hex(nonce))) {
      throw new OAuthTokenInvalidError('apple');
    }

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

    return {
      provider: 'apple',
      subject: payload.sub,
      email,
      // Apple sends the claim as a boolean or as the string "true".
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      // Apple supplies the name only through the client, on first authorisation.
      displayName: null,
    };
  }

  /** Runs the provider call and folds every failure into one refusal. */
  private async attempt<T>(provider: OAuthProvider, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      this.logger.warn(
        `${provider} token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new OAuthTokenInvalidError(provider);
    }
  }
}

function configuredAudience(provider: OAuthProvider, ids: readonly string[] | undefined) {
  if (!ids || ids.length === 0) throw new OAuthProviderUnavailableError(provider);

  return [...ids];
}

/** Lower-case hex SHA-256: the form Apple echoes back and the app sends it. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The token's nonce claim equals the expected value; absent, or any other type, never does. */
function nonceMatches(claim: unknown, expected: string): boolean {
  if (typeof claim !== 'string') return false;
  const a = Buffer.from(claim);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
