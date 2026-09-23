import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from '@/common/auth/jwt.guard';
import { TokenService } from './token.service';

/**
 * Token issuance and the global authentication gate (contracts/rest-api.md §1).
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
 */
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [TokenService],
})
export class AuthModule {}
