import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateStopRequest,
  PatchStopRequest,
  TripResponse,
  Uuid,
} from '@triptrackr/contracts';

import { respond } from '@/common/validation/respond';
import { ZodValidationPipe } from '@/common/validation/zod-validation.pipe';

import { StopsService } from './stops.service';

/**
 * `/trips/:id/stops` (rest-api.md §3; FR-010, FR-012). Access rule: owner.
 *
 * Writes answer with the whole trip rather than the one stop. Adding,
 * moving or re-dating a stop renumbers its neighbours and may change the
 * trip's derived status, and the client needs all of that to render — one
 * response carries it, where a stop-only response would demand a second
 * request to learn what else moved.
 */
@Controller('trips/:id/stops')
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  /** `{city_id, arrive_date, depart_date, sort_order?}`. Omitted `sort_order` appends. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param('id', new ZodValidationPipe(Uuid)) tripId: string,
    @Body(new ZodValidationPipe(CreateStopRequest)) body: CreateStopRequest,
  ): Promise<TripResponse> {
    return respond(TripResponse, { trip: await this.stops.add(tripId, body) });
  }

  /** Dates and reordering. The resulting date pair is validated (FR-011). */
  @Patch(':stopId')
  async patch(
    @Param('id', new ZodValidationPipe(Uuid)) tripId: string,
    @Param('stopId', new ZodValidationPipe(Uuid)) stopId: string,
    @Body(new ZodValidationPipe(PatchStopRequest)) body: PatchStopRequest,
  ): Promise<TripResponse> {
    return respond(TripResponse, { trip: await this.stops.patch(tripId, stopId, body) });
  }

  /** Tombstone; the remaining stops close ranks (FR-012, FR-039). */
  @Delete(':stopId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', new ZodValidationPipe(Uuid)) tripId: string,
    @Param('stopId', new ZodValidationPipe(Uuid)) stopId: string,
  ): Promise<void> {
    await this.stops.remove(tripId, stopId);
  }
}
