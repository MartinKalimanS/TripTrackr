import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  AppleOAuthRequest,
  AuthTokens,
  GoogleOAuthRequest,
  LoginRequest,
  LogoutRequest,
  PasswordResetConfirm,
  PasswordResetRequest,
  RefreshRequest,
  RefreshedTokens,
  RegisterRequest,
  VerifyEmailRequest,
} from '@triptrackr/contracts';

import { Public } from '@/common/auth/jwt.guard';
import { RateLimited } from '@/common/guards/rate-limit.guard';
import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { AUTH_RATE_LIMITS } from './auth-rate-limits';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { RefreshService } from './refresh.service';
import { VerificationService } from './verification.service';

/**
 * `/auth/*` (rest-api.md §1).
 *
 * `@Public()` is placed per handler, never on the class: `logout` and
 * `logout-all` are acts a traveller performs on their own account and require
 * the access token like every other owner route. A class-level opt-out would
 * make "forgot to protect it" the default for the next handler added here.
 *
 * The three routes an attacker guesses against carry the two-bucket limits
 * from auth-rate-limits.ts (FR-071). Every other route here is under the
 * guard's default ceiling.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly refresh: RefreshService,
    private readonly verification: VerificationService,
  ) {}

  /** FR-001. Creates the account, starts verification, returns tokens. */
  @Public()
  @RateLimited(AUTH_RATE_LIMITS.register)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body(new ZodValidationPipe(RegisterRequest)) body: RegisterRequest,
  ): Promise<AuthTokens> {
    return respond(AuthTokens, await this.auth.register(body));
  }

  /** FR-001. */
  @Public()
  @RateLimited(AUTH_RATE_LIMITS.login)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest,
  ): Promise<AuthTokens> {
    return respond(AuthTokens, await this.auth.login(body));
  }

  /** FR-002. `{id_token}`, verified server-side; creates transparently on first use. */
  @Public()
  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  async google(
    @Body(new ZodValidationPipe(GoogleOAuthRequest)) body: GoogleOAuthRequest,
  ): Promise<AuthTokens> {
    return respond(AuthTokens, await this.oauth.google(body));
  }

  /** FR-002. `{identity_token, display_name?}`. */
  @Public()
  @Post('oauth/apple')
  @HttpCode(HttpStatus.OK)
  async apple(
    @Body(new ZodValidationPipe(AppleOAuthRequest)) body: AppleOAuthRequest,
  ): Promise<AuthTokens> {
    return respond(AuthTokens, await this.oauth.apple(body));
  }

  /** FR-003, FR-005. Rotates; the presented token is retired. */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async rotate(
    @Body(new ZodValidationPipe(RefreshRequest)) body: RefreshRequest,
  ): Promise<RefreshedTokens> {
    return respond(RefreshedTokens, await this.refresh.refresh(body.refresh_token));
  }

  /** FR-004. Owner. Revokes exactly one refresh token. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(LogoutRequest)) body: LogoutRequest,
  ): Promise<void> {
    await this.refresh.logout(body.refresh_token);
  }

  /** FR-004. Owner. Revokes every refresh token for the account. */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(): Promise<void> {
    await this.refresh.logoutAll();
  }

  /** Added — spec Assumptions place verification in scope. */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailRequest)) body: VerifyEmailRequest,
  ): Promise<void> {
    await this.verification.verifyEmail(body.token);
  }

  /** Added. Always 202 — whether an email goes out is not the caller's to learn. */
  @Public()
  @RateLimited(AUTH_RATE_LIMITS.passwordResetRequest)
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(PasswordResetRequest)) body: PasswordResetRequest,
  ): Promise<void> {
    await this.verification.requestPasswordReset(body.email);
  }

  /** Added. Installs the new password and signs the account out everywhere. */
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(PasswordResetConfirm)) body: PasswordResetConfirm,
  ): Promise<void> {
    await this.verification.confirmPasswordReset(body.token, body.password);
  }
}
