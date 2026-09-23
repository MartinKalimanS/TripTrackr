import { Injectable } from '@nestjs/common';
import type { TravelStats } from '@triptrackr/contracts';

import { requireRlsTransaction } from '@/common/rls/rls-context';

interface StatsRow {
  readonly trips_held: number;
  readonly countries_visited: number;
  readonly total_distance_km: number;
}

/**
 * Summary travel statistics for the globe overlay (FR-050).
 *
 * One query, on the request transaction, so the policies decide whose stops
 * are counted and the `WHERE owner_id` is confirmation rather than the
 * guarantee (Constitution I). Tombstoned trips and stops are excluded — a
 * deleted trip is not a trip the traveller took (FR-039).
 *
 * Distance is `ST_Distance` over `geography`, summed leg by leg between
 * consecutive stops of each trip: great-circle metres over the spheroid, which
 * is what makes a trip across the date line correct without a special case
 * (data-model.md §1). `LEAD` over the stop order pairs each stop with the
 * next; the last stop of a trip has no successor and contributes nothing.
 */
@Injectable()
export class TravelStatsService {
  async forCurrentUser(): Promise<TravelStats> {
    const [row] = await requireRlsTransaction()<StatsRow[]>`
      WITH live_trips AS (
        SELECT id
        FROM trips
        WHERE owner_id = current_user_id() AND deleted_at IS NULL
      ),
      live_stops AS (
        SELECT s.trip_id, s.sort_order, s.created_at, s.id, c.country_id, c.location
        FROM trip_stops s
        JOIN cities c ON c.id = s.city_id
        WHERE s.trip_id IN (SELECT id FROM live_trips) AND s.deleted_at IS NULL
      ),
      legs AS (
        SELECT ST_Distance(
                 location,
                 LEAD(location) OVER (PARTITION BY trip_id ORDER BY sort_order, created_at, id)
               ) AS metres
        FROM live_stops
      )
      SELECT
        (SELECT count(*)::int FROM live_trips) AS trips_held,
        (SELECT count(DISTINCT country_id)::int FROM live_stops) AS countries_visited,
        COALESCE((SELECT sum(metres) FROM legs), 0)::float8 / 1000.0 AS total_distance_km
    `;

    return {
      trips_held: row?.trips_held ?? 0,
      countries_visited: row?.countries_visited ?? 0,
      total_distance_km: row?.total_distance_km ?? 0,
    };
  }
}
