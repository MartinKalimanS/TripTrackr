import { customType } from 'drizzle-orm/pg-core';

/**
 * PostgreSQL types Drizzle does not model natively.
 *
 * Each is declared once here so that a table definition never has to reach for
 * raw SQL, and so the shape of a geography column is identical everywhere it
 * appears.
 */

/** A longitude/latitude pair in WGS 84. Longitude first, as PostGIS expects. */
export interface Point {
  readonly lng: number;
  readonly lat: number;
}

/**
 * `GEOGRAPHY(POINT,4326)`.
 *
 * Geography rather than geometry is deliberate (data-model.md §1): distances come
 * back in metres over the spheroid, so a total-distance sum is a `ST_Distance`
 * sum rather than hand-written haversine arithmetic, and a trip crossing the
 * 180th meridian is correct without a special case.
 *
 * Values are written as EWKT and read back as GeoJSON — see the `toDriver` and
 * `fromDriver` pair below. Reads must therefore select the column through
 * `ST_AsGeoJSON(...)`; selecting it raw yields WKB hex, which this cannot parse.
 */
export const geographyPoint = customType<{
  data: Point;
  driverData: string;
  config: never;
}>({
  dataType() {
    return 'geography(Point,4326)';
  },
  toDriver(value: Point): string {
    return `SRID=4326;POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value: string): Point {
    const parsed = JSON.parse(value) as { coordinates: [number, number] };
    const [lng, lat] = parsed.coordinates;
    return { lng, lat };
  },
});

/**
 * `CITEXT` — case-insensitive text, used for email.
 *
 * The unique constraint on `users.email` is what stops two accounts existing for
 * the same address; CITEXT is what makes that constraint mean what a traveller
 * assumes it means.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});
