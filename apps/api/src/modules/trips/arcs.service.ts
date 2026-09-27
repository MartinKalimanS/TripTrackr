import { Injectable } from '@nestjs/common';
import type { ArcFeature, ArcsResponse } from '@triptrackr/contracts';

import { requireRlsTransaction } from '@/common/rls/rls-context';

import { TripsService } from './trips.service';

/** Metres between densification vertices. 100 km draws a smooth curve at globe scale. */
const SEGMENT_LENGTH_METRES = 100_000;

interface LegRow {
  readonly from_city_id: number;
  readonly to_city_id: number;
  /** `ST_AsGeoJSON` output: a GeoJSON LineString, as text. */
  readonly geometry: string;
}

interface LineString {
  readonly type: 'LineString';
  readonly coordinates: [number, number][];
}

/**
 * Great-circle arcs between consecutive stops (rest-api.md §3; FR-016).
 *
 * Derived, never stored: there is no arc table, so inserting a stop mid-trip
 * requires no maintenance — the next read simply pairs the stops in their new
 * order (data-model.md §3). A single-stop trip has no consecutive pair and
 * yields an empty collection, not an error; the globe renders a point.
 *
 * PostGIS does the geometry. `ST_MakeLine` joins each stop's point to the next
 * one's, the cast to `geography` makes `ST_Segmentize` interpolate along the
 * great circle rather than in a flat projection, and the result crosses the
 * date line correctly because geography has no seam. `LEAD` over the stop
 * order pairs each stop with its successor in one pass.
 */
@Injectable()
export class ArcsService {
  constructor(private readonly trips: TripsService) {}

  async forTrip(tripId: string): Promise<ArcsResponse> {
    // Owner view or TRIP_NOT_FOUND — and the derived status every arc carries.
    const trip = await this.trips.loadOwned(tripId);

    const legs = await requireRlsTransaction()<LegRow[]>`
      SELECT from_city_id, to_city_id, geometry
      FROM (
        SELECT
          s.city_id AS from_city_id,
          LEAD(s.city_id) OVER w AS to_city_id,
          ST_AsGeoJSON(
            ST_Segmentize(
              ST_MakeLine(c.location::geometry, LEAD(c.location::geometry) OVER w)::geography,
              ${SEGMENT_LENGTH_METRES}
            )
          ) AS geometry
        FROM trip_stops s
        JOIN cities c ON c.id = s.city_id
        WHERE s.trip_id = ${tripId}::uuid AND s.deleted_at IS NULL
        WINDOW w AS (ORDER BY s.sort_order, s.created_at, s.id)
      ) pairs
      WHERE to_city_id IS NOT NULL
    `;

    const features: ArcFeature[] = legs.map((leg) => ({
      type: 'Feature',
      geometry: parseLineString(leg.geometry),
      properties: {
        trip_id: trip.id,
        from_city_id: leg.from_city_id,
        to_city_id: leg.to_city_id,
        status: trip.status,
      },
    }));

    return { type: 'FeatureCollection', features };
  }
}

/**
 * Parsed explicitly rather than via a `::json` cast so the shape is checked
 * here, once, and a PostGIS output this code does not expect fails loudly
 * instead of flowing into the response.
 */
function parseLineString(geometry: string): LineString {
  const parsed = JSON.parse(geometry) as { type?: unknown; coordinates?: unknown };

  if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates)) {
    throw new Error(
      `Expected a LineString from ST_AsGeoJSON, received ${String(parsed.type)}.`,
    );
  }

  return { type: 'LineString', coordinates: parsed.coordinates as [number, number][] };
}
