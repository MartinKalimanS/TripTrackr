import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  DeleteMeRequest,
  DeleteMeResponse,
  ExportResponse,
  MeResponse,
  PatchMeRequest,
  StartExportRequest,
  Uuid,
} from '@triptrackr/contracts';

import { RateLimited } from '@/common/guards/rate-limit.guard';
import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { DELETE_ME_RATE_LIMIT, DeletionService } from './deletion.service';
import { ExportService, START_EXPORT_RATE_LIMIT } from './export.service';
import { TravelStatsService } from './travel-stats.service';
import { UsersRepository } from './users.repository';

/**
 * The traveller's own profile (rest-api.md §2). Access rule: owner.
 *
 * No `@Public()` anywhere in this file: the global JwtAuthGuard applies, and
 * the RLS context therefore carries the identity every query below keys on.
 * `DELETE /me` (FR-006) marks the account and queues the sweep that removes its rows and
 * files (`DeletionService`); `POST /me/export` (FR-007) arrives with its own story. Both
 * enqueue work the queue module owns.
 */
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly stats: TravelStatsService,
    private readonly deletion: DeletionService,
    private readonly exports: ExportService,
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

  /**
   * Delete the account (FR-006): 202, the account is marked and every session ends; the
   * sweep that removes the rows and every stored file is queued and finishes it. The
   * password is required when the account has one.
   */
  @Delete()
  @RateLimited(DELETE_ME_RATE_LIMIT)
  @HttpCode(HttpStatus.ACCEPTED)
  async remove(
    @Body(new ZodValidationPipe(DeleteMeRequest)) body: DeleteMeRequest,
  ): Promise<DeleteMeResponse> {
    return respond(DeleteMeResponse, await this.deletion.request(body.password));
  }

  /**
   * Export my data (FR-007; spec 009): 202, a pending export; the worker builds one zip and the
   * traveller downloads it through `GET /me/export/:id`. The password is required when the
   * account has one; one a day.
   */
  @Post('export')
  @RateLimited(START_EXPORT_RATE_LIMIT)
  @HttpCode(HttpStatus.ACCEPTED)
  async startExport(
    @Body(new ZodValidationPipe(StartExportRequest)) body: StartExportRequest,
  ): Promise<ExportResponse> {
    return respond(ExportResponse, await this.exports.start(body.password));
  }

  /** The export's state, and a fresh short-lived download link while it is ready. Owner only. */
  @Get('export/:id')
  async exportStatus(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
  ): Promise<ExportResponse> {
    return respond(ExportResponse, await this.exports.get(id));
  }
}
