import { Body, Controller, Get, Patch } from '@nestjs/common';
import { MeResponse, PatchMeRequest } from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { TravelStatsService } from './travel-stats.service';
import { UsersRepository } from './users.repository';

/**
 * The traveller's own profile (rest-api.md §2). Access rule: owner.
 *
 * No `@Public()` anywhere in this file: the global JwtAuthGuard applies, and
 * the RLS context therefore carries the identity every query below keys on.
 * `DELETE /me` and `POST /me/export` (FR-006, FR-007) arrive with their own
 * stories — both enqueue work the queue module owns.
 */
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly stats: TravelStatsService,
  ) {}

  /** Profile plus stats: countries visited, distance travelled (FR-050). */
  @Get()
  async me(): Promise<MeResponse> {
    // Sequential on purpose: both run on the one request transaction, and one
    // connection answers one statement at a time.
    const user = await this.users.findOwnProfile();
    const stats = await this.stats.forCurrentUser();

    return respond(MeResponse, { user, stats });
  }

  /** Display name, bio, avatar, home currency, `is_profile_public` (FR-008). */
  @Patch()
  async patch(
    @Body(new ZodValidationPipe(PatchMeRequest)) body: PatchMeRequest,
  ): Promise<MeResponse> {
    const user = await this.users.patchOwnProfile(body);
    const stats = await this.stats.forCurrentUser();

    return respond(MeResponse, { user, stats });
  }
}
