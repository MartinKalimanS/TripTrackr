import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateTripRequest,
  ListTripsQuery,
  PatchTripRequest,
  Trip,
  TripStop,
} from '@triptrackr/contracts';

import { apiError, notFound } from '@/common/errors/api-error';
import { AllowanceService } from '@/modules/billing/allowance.service';

import { deriveTripStatus, todayIsoDate } from './trip-status.service';
import { TripsRepository, type StopRow, type TripRow } from './trips.repository';

/** The one not-found for every `/trips/:id` route — see contracts/README.md rule 1. */
export const tripNotFound = () => notFound('TRIP_NOT_FOUND', 'Trip');

/**
 * Trips (rest-api.md §3; FR-009, FR-013). Access rule: owner.
 *
 * **Creation is the one place the allowance is checked** (FR-074, research D-08; spec 013), through
 * `AllowanceService`, and below the allowance the response carries no allowance or payment field of any
 * kind (FR-084).
 *
 * `GET /trips/:id` is owner-only in this story. The contract marks it
 * owner-or-public, but the public variant is the curated view of FR-055 — a
 * different shape, arriving with the social story behind the sync gate — not
 * the owner's record with some fields removed.
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly repository: TripsRepository,
    private readonly allowance: AllowanceService,
  ) {}

  async list(query: ListTripsQuery): Promise<Trip[]> {
    const rows = await this.repository.listOwnedTrips();
    const stops = await this.repository.listStops(rows.map((row) => row.id));
    const today = todayIsoDate();

    const all = rows.map((row) =>
      toTrip(
        row,
        stops.filter((stop) => stop.tripId === row.id),
        today,
      ),
    );

    // Filtered on the *derived* status: the stored column is a cache and a
    // trip whose dates passed overnight must already read as past (FR-013).
    return query.status ? all.filter((trip) => trip.status === query.status) : all;
  }

  /**
   * FR-009. A client-chosen id is honoured (research D-15) and a retried create
   * with the same id is the same create: it comes back 201 with the trip that
   * already exists, because the retry and the original are one intention.
   */
  async create(request: CreateTripRequest): Promise<Trip> {
    // A replay of a create this traveller already made is the same intention, not a new trip, so it is
    // answered before the allowance is asked.
    const replay = request.id ? await this.repository.findOwnedTrip(request.id) : null;
    if (replay) return this.loadOwned(replay.id);

    await this.allowance.assertCanCreate(request);

    const inserted = await this.repository.insertTrip({
      id: request.id,
      title: request.title,
      homeCurrency: request.home_currency,
    });

    if (inserted) return toTrip(inserted, [], todayIsoDate());

    // The id is taken. If it is this traveller's own live trip, the create is
    // a replay; otherwise the id names something the caller cannot see, and
    // the refusal must not say what.
    const existing = request.id ? await this.repository.findOwnedTrip(request.id) : null;
    if (existing) return this.loadOwned(existing.id);

    throw apiError(
      HttpStatus.CONFLICT,
      'TRIP_ID_UNAVAILABLE',
      'That trip id is already in use. Please retry with a new id.',
    );
  }

  /** The owner view: the trip with its stops in order, or not-found. */
  async loadOwned(tripId: string): Promise<Trip> {
    const row = await this.repository.findOwnedTrip(tripId);
    if (!row) throw tripNotFound();

    const stops = await this.repository.listStops([tripId]);

    return toTrip(row, stops, todayIsoDate());
  }

  /** Title, `is_public`, `cover_photo_id`. `status` never reaches here — the contract refuses it. */
  async patch(tripId: string, patch: PatchTripRequest): Promise<Trip> {
    const row = await this.repository.updateTrip(tripId, patch);
    if (!row) throw tripNotFound();

    const stops = await this.repository.listStops([tripId]);

    return toTrip(row, stops, todayIsoDate());
  }

  /** Tombstones the trip and its children (FR-039); frees an allowance slot at once (FR-075). */
  async remove(tripId: string): Promise<void> {
    const deleted = await this.repository.tombstoneTrip(tripId);
    if (!deleted) throw tripNotFound();
  }
}

/** Row → wire shape (contracts/api/trips.ts `Trip`). */
export function toTrip(row: TripRow, stops: readonly StopRow[], today: string): Trip {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    title: row.title,
    home_currency: row.homeCurrency,
    is_public: row.isPublic,
    cover_photo_id: row.coverPhotoId,
    status: deriveTripStatus(
      stops.map((stop) => ({
        arrive_date: stop.arriveDate,
        depart_date: stop.departDate,
      })),
      today,
    ),
    stops: stops.map(toTripStop),
  };
}

export function toTripStop(row: StopRow): TripStop {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    trip_id: row.tripId,
    city_id: row.cityId,
    sort_order: row.sortOrder,
    arrive_date: row.arriveDate,
    depart_date: row.departDate,
    city: {
      id: row.city.id,
      country_id: row.city.countryId,
      name: row.city.name,
      ascii_name: row.city.asciiName,
      lat: row.city.lat,
      lng: row.city.lng,
      timezone: row.city.timezone,
      population: row.city.population ?? 0,
    },
  };
}
