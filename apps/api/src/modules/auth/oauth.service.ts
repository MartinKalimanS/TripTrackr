import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AppleOAuthRequest,
  AuthTokens,
  GoogleOAuthRequest,
} from '@triptrackr/contracts';

import { apiError } from '@/common/errors/api-error';
import { requireRlsTransaction } from '@/common/rls/rls-context';

import { AuthService } from './auth.service';
import { OAuthNonceService } from './oauth-nonce.service';
import {
  OAuthProviderUnavailableError,
  OAuthTokenInvalidError,
  OAuthTokenVerifier,
  type VerifiedIdentity,
} from './oauth-token-verifier';

/** One row from `auth_upsert_oauth_identity` (0008). */
interface UpsertRow {
  readonly user_id: string | null;
  readonly outcome:
    'existing' | 'linked' | 'created' | 'email_unverified' | 'email_required';
}

/**
 * Sign in with Google or Apple (FR-002; rest-api.md §1).
 *
 * The client never tells the server who it is — it hands over the token the
 * provider issued, the server verifies it (oauth-token-verifier.ts), and the
 * verified identity is what reaches the database. Account creation on first
 * use is transparent: the traveller taps one button and has an account, with
 * no second form. Where the verified address already belongs to a password
 * account, the identity is attached to that account instead (data-model.md
 * §2, "the link is by verified email, not by a new account").
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly verifier: OAuthTokenVerifier,
    private readonly auth: AuthService,
    private readonly nonces: OAuthNonceService,
  ) {}

  async google(request: GoogleOAuthRequest): Promise<AuthTokens> {
    const identity = await this.verify(() =>
      this.verifier.verifyGoogle(request.id_token, request.nonce),
    );
    await this.spend(request.nonce);

    return this.signIn(identity, null);
  }

  async apple(request: AppleOAuthRequest): Promise<AuthTokens> {
    const identity = await this.verify(() =>
      this.verifier.verifyApple(request.identity_token, request.nonce),
    );
    await this.spend(request.nonce);

    // Apple supplies the name only on the very first authorisation, and only
    // to the client; it is used here only if an account is being created.
    return this.signIn(identity, request.display_name ?? null);
  }

  /**
   * The token carried the nonce; now it is used up. A nonce that is unknown, spent or expired is
   * the same refusal as a bad token (spec 012; FR-004).
   */
  private async spend(nonce: string): Promise<void> {
    if (await this.nonces.consume(nonce)) return;

    throw apiError(
      HttpStatus.UNAUTHORIZED,
      'OAUTH_TOKEN_INVALID',
      'The sign-in could not be verified. Please try again.',
    );
  }

  private async verify(fn: () => Promise<VerifiedIdentity>): Promise<VerifiedIdentity> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (error instanceof OAuthProviderUnavailableError) {
        throw apiError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'OAUTH_PROVIDER_UNAVAILABLE',
          'Signing in with this provider is not available right now. Please use another sign-in method.',
        );
      }

      if (error instanceof OAuthTokenInvalidError) {
        throw apiError(
          HttpStatus.UNAUTHORIZED,
          'OAUTH_TOKEN_INVALID',
          'The sign-in could not be verified. Please try again.',
        );
      }

      throw error;
    }
  }

  private async signIn(
    identity: VerifiedIdentity,
    displayName: string | null,
  ): Promise<AuthTokens> {
    const [row] = await requireRlsTransaction()<UpsertRow[]>`
      SELECT * FROM auth_upsert_oauth_identity(
        ${identity.provider},
        ${identity.subject},
        ${identity.email},
        ${identity.emailVerified},
        ${displayName ?? identity.displayName}
      )
    `;

    if (!row?.user_id) {
      throw this.refusal(row?.outcome);
    }

    if (row.outcome !== 'existing') {
      this.logger.log(
        `OAuth ${identity.provider} sign-in ${row.outcome} account ${row.user_id}.`,
      );
    }

    return this.auth.signIn(row.user_id);
  }

  private refusal(outcome: UpsertRow['outcome'] | undefined) {
    if (outcome === 'email_required') {
      return apiError(
        HttpStatus.BAD_REQUEST,
        'OAUTH_EMAIL_REQUIRED',
        'Your provider did not share an email address. Allow email sharing and try again, or register with an email and password.',
      );
    }

    // `email_unverified`: the address is taken and the provider did not vouch
    // for it. Linking would let anyone who can create an unverified provider
    // account with someone else's address take that account. Same message as
    // a plain registration conflict — which kind of account holds it is not
    // the caller's to learn.
    return apiError(
      HttpStatus.CONFLICT,
      'EMAIL_TAKEN',
      'An account already exists for this email address. Sign in with the method you used before, or reset your password.',
    );
  }
}
