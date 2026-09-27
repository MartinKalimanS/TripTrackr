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
  Query,
} from '@nestjs/common';
import {
  ArcsResponse,
  CreateTripRequest,
  ListTripsQuery,
  PatchTripRequest,
  TripResponse,
  TripsResponse,
  Uuid,
} from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { ArcsService } from './arcs.service';
import { TripsService } from './trips.service';

/**
 * `/trips` (rest-api.md §3). Access rule: owner, on every route in this story.
 *
 * Route parameters are validated as uuids before any lookup. A malformed id is
 * a 400 — nothing can exist at `/trips/not-a-uuid`, so refusing it discloses
 * nothing — and it keeps a non-uuid out of the `::uuid` casts, where it would
 * have surfaced as a database error and a 500.
 */
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly arcs: ArcsService,
  ) {}

  /** Own trips, filterable by derived status. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(ListTripsQuery)) query: ListTripsQuery,
  ): Promise<TripsResponse> {
    return respond(TripsResponse, { trips: await this.trips.list(query) });
  }

  /**
   * FR-009. 201 with the trip and nothing else — no allowance, no payment
   * field (FR-084). The allowance branch arrives with User Story 9.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateTripRequest)) body: CreateTripRequest,
  ): Promise<TripResponse> {
    return respond(TripResponse, { trip: await this.trips.create(body) });
  }

  @Get(':id')
  async get(@Param('id', new ZodValidationPipe(Uuid)) id: string): Promise<TripResponse> {
    return respond(TripResponse, { trip: await this.trips.loadOwned(id) });
  }

  /** Title, `is_public`, `cover_photo_id`. `status` is derived and refused (FR-013). */
  @Patch(':id')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
    @Body(new ZodValidationPipe(PatchTripRequest)) body: PatchTripRequest,
  ): Promise<TripResponse> {
    return respond(TripResponse, { trip: await this.trips.patch(id, body) });
  }

  /** Tombstones the trip and its children (FR-039, FR-075). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(Uuid)) id: string): Promise<void> {
    await this.trips.remove(id);
  }

  /** FR-016. Derived great-circle pairs from consecutive stops. */
  @Get(':id/arcs')
  async arcsFor(
    @Param('id', new ZodValidationPipe(Uuid)) id: string,
  ): Promise<ArcsResponse> {
    return respond(ArcsResponse, await this.arcs.forTrip(id));
  }
}
