import { Module } from '@nestjs/common';

import { ArcsService } from './arcs.service';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { TripStatusService } from './trip-status.service';
import { TripsController } from './trips.controller';
import { TripsRepository } from './trips.repository';
import { TripsService } from './trips.service';

/**
 * Trips, stops and the arcs derived from them (rest-api.md §3; FR-009 to
 * FR-013, FR-016).
 *
 * Visibility posture of everything here: owner-only in this story. The
 * policies already permit a stranger to *read* a public trip and its stops
 * (`trips_public_read`, `trip_stops_public_read`, 0005); these routes do not
 * yet serve that read, because the curated public view (FR-055) is a
 * different shape and belongs to the social story behind the sync gate.
 */
@Module({
  controllers: [TripsController, StopsController],
  providers: [
    TripsRepository,
    TripsService,
    StopsService,
    TripStatusService,
    ArcsService,
  ],
  exports: [TripsService],
})
export class TripsModule {}
