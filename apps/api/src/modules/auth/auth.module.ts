import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

import { JwtAuthGuard } from '@/common/auth/jwt.guard';
import { loadEnv } from '@/common/config/env.schema';
import { UsersModule } from '@/modules/users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { createEmailSender, EMAIL_SENDER, type EmailSender } from './email-sender';
import { OAuthTokenVerifier } from './oauth-token-verifier';
import { OAuthNonceService } from './oauth-nonce.service';
import { OAuthService } from './oauth.service';
import { PasswordService } from './password.service';
import { RefreshService } from './refresh.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';

/**
 * Accounts and sessions (contracts/rest-api.md §1), and the global
 * authentication gate.
 *
 * The guard is registered with `APP_GUARD` rather than being applied per
 * controller. Opting *out* with `@Public()` means an unprotected endpoint is the
 * result of writing something deliberate; opting *in* would make it the result of
 * forgetting something. Only one of those two failure modes closes.
 *
 * `JwtModule.register({})` carries no secret: every sign and verify call passes
 * its own, read from the validated environment at call time. A secret baked in at
 * module construction would be captured once at boot and could not be rotated
 * without a restart.
 *
 * `EMAIL_SENDER` is chosen once from the environment (email-sender.ts): Resend
 * in production and wherever a real key is present, a logger everywhere else,
 * so the test and development stacks never send.
 */
@Module({
  imports: [JwtModule.register({}), UsersModule],
  controllers: [AuthController],
  providers: [
    TokenService,
    PasswordService,
    AuthService,
    OAuthTokenVerifier,
    OAuthNonceService,
    OAuthService,
    RefreshService,
    VerificationService,
    {
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => createEmailSender(loadEnv()),
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
