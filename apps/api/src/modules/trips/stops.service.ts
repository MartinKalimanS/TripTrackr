import { HttpStatus, Injectable } from '@nestjs/common';
import type { CreateStopRequest, PatchStopRequest, Trip } from '@triptrackr/contracts';

import { apiError, notFound } from '@/common/errors/api-error';

import { insertAt, moveTo, renumber, without, type OrderedStop } from './stop-order';
import { TripStatusService } from './trip-status.service';
import { TripsRepository, type StopRow } from './trips.repository';
import { TripsService, tripNotFound } from './trips.service';

const stopNotFound = () => notFound('STOP_NOT_FOUND', 'Stop');

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

/** Placeholder for a stop that has no id until the database assigns one. */
const PENDING_ID = '__pending__';

/**
 * Stops (rest-api.md §3; FR-010, FR-011, FR-012). Access rule: owner.
 *
 * Every operation begins by loading the trip through the owner view, so a
 * stranger's request for a stop on someone else's trip is refused as
 * `TRIP_NOT_FOUND` — identical to a trip that does not exist — before any stop
 * is looked at (contracts/README.md rule 1). A stop that is missing from the
 * caller's own trip is `STOP_NOT_FOUND`; there is nothing to disclose there.
 *
 * Every write ends the same way: positions renumbered to 0..n-1 (stop-order.ts),
 * the materialised status refreshed from the dates the stops now have
 * (trip-status.service.ts), and the whole trip re-read and returned, so the
 * client renders exactly what was stored rather than what it thinks it sent.
 */
@Injectable()
export class StopsService {
  constructor(
    private readonly repository: TripsRepository,
    private readonly trips: TripsService,
    private readonly status: TripStatusService,
  ) {}

  /** FR-010. Appends when `sort_order` is omitted; otherwise inserts and shifts. */
  async add(tripId: string, request: CreateStopRequest): Promise<Trip> {
    const stops = await this.loadStops(tripId);

    // A replayed create is the same create (research D-15): the stop is
    // already exactly where a previous attempt put it.
    if (request.id && stops.some((stop) => stop.id === request.id)) {
      return this.trips.loadOwned(tripId);
    }

    if (!(await this.repository.cityExists(request.city_id))) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
        issues: [{ path: 'city_id', message: 'Unknown city' }],
      });
    }

    const placeholder = request.id ?? PENDING_ID;
    const order = insertAt(
      stops.map((stop) => stop.id),
      placeholder,
      request.sort_order,
    );

    const stopId = await this.repository.insertStop({
      id: request.id,
      tripId,
      cityId: request.city_id,
      arriveDate: request.arrive_date,
      departDate: request.depart_date,
      sortOrder: order.indexOf(placeholder),
    });

    if (!stopId) {
      throw apiError(
        HttpStatus.CONFLICT,
        'STOP_ID_UNAVAILABLE',
        'That stop id is already in use. Please retry with a new id.',
      );
    }

    const inserted: OrderedStop = { id: stopId, sortOrder: order.indexOf(placeholder) };
    await this.settle(
      tripId,
      [...stops, inserted],
      order.map((id) => (id === placeholder ? stopId : id)),
    );

    return this.trips.loadOwned(tripId);
  }

  /**
   * FR-011, FR-012. Either date may change alone; the pair the row ends up with
   * is what is validated, because a client patching one side cannot see the
   * other in the same request (contracts/api/trips.ts).
   */
  async patch(tripId: string, stopId: string, request: PatchStopRequest): Promise<Trip> {
    const stops = await this.loadStops(tripId);
    const stop = stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw stopNotFound();

    const dates = {
      arriveDate: request.arrive_date ?? stop.arriveDate,
      departDate: request.depart_date ?? stop.departDate,
    };

    if (dates.departDate < dates.arriveDate) {
      throw apiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
        issues: [
          { path: 'depart_date', message: 'depart_date must not precede arrive_date' },
        ],
      });
    }

    if (dates.arriveDate !== stop.arriveDate || dates.departDate !== stop.departDate) {
      await this.repository.updateStopDates(stopId, dates);
    }

    const ids = stops.map((candidate) => candidate.id);
    const order =
      request.sort_order === undefined ? ids : moveTo(ids, stopId, request.sort_order);
    await this.settle(tripId, stops, order);

    return this.trips.loadOwned(tripId);
  }

  /** FR-012, FR-039. Tombstones the stop and closes the gap in the order. */
  async remove(tripId: string, stopId: string): Promise<void> {
    const stops = await this.loadStops(tripId);
    if (!stops.some((stop) => stop.id === stopId)) throw stopNotFound();

    await this.repository.tombstoneStop(stopId);

    const remaining = stops.filter((stop) => stop.id !== stopId);
    await this.settle(
      tripId,
      remaining,
      without(
        stops.map((stop) => stop.id),
        stopId,
      ),
    );
  }

  /** The trip's live stops, or `TRIP_NOT_FOUND` when the trip is not the caller's. */
  private async loadStops(tripId: string): Promise<StopRow[]> {
    const trip = await this.repository.findOwnedTrip(tripId);
    if (!trip) throw tripNotFound();

    return this.repository.listStops([tripId]);
  }

  /**
   * Writes the positions that changed, then re-reads the stops — the same
   * transaction sees its own writes — and refreshes the stored status from the
   * dates they now carry.
   */
  private async settle(
    tripId: string,
    stops: readonly OrderedStop[],
    order: readonly string[],
  ): Promise<void> {
    await this.repository.renumberStops(renumber(stops, order));

    const current = await this.repository.listStops([tripId]);
    await this.status.refreshStoredStatus(
      tripId,
      current.map((stop) => ({
        arrive_date: stop.arriveDate,
        depart_date: stop.departDate,
      })),
    );
  }
}
