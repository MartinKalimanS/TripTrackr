import { IsoDate } from './scalars';
import { DocumentParsedFields } from './sync/records';

/**
 * Boarding-pass extraction — IATA Resolution 792, the Bar Coded Boarding Pass
 * (BCBP), format "M" (FR-035; research D-33).
 *
 * One implementation, shared: the device parses what its camera decoded so it
 * can offer the fields for confirmation offline, and the API validates the
 * same shape. The mandatory block is 60 fixed-width characters; only three
 * items leave this function. The booking reference — enough to manage the
 * booking — the seat and the check-in sequence number are never extracted.
 *
 * Anything that is not a well-formed BCBP pass yields null: the traveller
 * types the fields instead, which is not an error (spec Edge Cases).
 */

const MANDATORY_LENGTH = 60;
const PASSENGER_NAME = [2, 22] as const;
const OPERATING_CARRIER = [36, 39] as const;
const FLIGHT_NUMBER = [39, 44] as const;
const DAY_OF_YEAR = [44, 47] as const;

/** An IATA two-character designator, or an ICAO three-letter one. */
const CARRIER = /^(?:[A-Z0-9]{2}|[A-Z]{3})$/;
/** Up to four digits, zero-padded on the pass, and an optional operational suffix. */
const FLIGHT = /^0*([1-9]\d{0,3})([A-Z]?)$/;

const MS_PER_DAY = 86_400_000;

/**
 * The fields of the pass's first leg, or null when `payload` is not a BCBP
 * "M" pass. `scannedOn` (`YYYY-MM-DD`, the device's local date) supplies the
 * year the pass leaves out.
 */
export function parseBoardingPass(
  payload: string,
  scannedOn: string,
): DocumentParsedFields | null {
  if (payload.length < MANDATORY_LENGTH || !/^M[1-4]$/.test(payload.slice(0, 2))) {
    return null;
  }
  const name = payload
    .slice(...PASSENGER_NAME)
    .trim()
    .replace(/\s+/g, ' ');
  const carrier = payload.slice(...OPERATING_CARRIER).trim();
  const flight = FLIGHT.exec(payload.slice(...FLIGHT_NUMBER).trim());
  const day = payload.slice(...DAY_OF_YEAR);
  if (!CARRIER.test(carrier) || flight === null || !/^\d{3}$/.test(day)) return null;

  const flightDate = resolveDayOfYear(Number(day), scannedOn);
  if (flightDate === null) return null;

  const fields = DocumentParsedFields.safeParse({
    flight_number: `${carrier}${flight[1]}${flight[2]}`,
    flight_date: flightDate,
    passenger_name: name,
  });
  return fields.success ? fields.data : null;
}

/**
 * The calendar date of day `day` (1 = 1 January) in whichever of the years
 * around `reference` puts it nearest — BCBP carries no year. A pass is scanned
 * shortly before its flight, or afterwards to record the trip; either way the
 * nearest candidate is the flight. Null for a day that exists in none of them.
 */
export function resolveDayOfYear(day: number, reference: string): string | null {
  if (!Number.isInteger(day) || day < 1 || day > 366) return null;
  if (!IsoDate.safeParse(reference).success) return null;

  const anchor = Date.parse(`${reference}T00:00:00Z`);
  const year = new Date(anchor).getUTCFullYear();
  const candidates = [year - 1, year, year + 1]
    .map((candidateYear) => ({ candidateYear, time: Date.UTC(candidateYear, 0, day) }))
    // Day 366 of a common year rolls into January of the next: not a real date.
    .filter(
      ({ candidateYear, time }) => new Date(time).getUTCFullYear() === candidateYear,
    )
    .map(({ time }) => time);
  if (candidates.length === 0) return null;

  const nearest = candidates.reduce((best, time) =>
    Math.abs(time - anchor) < Math.abs(best - anchor) ? time : best,
  );
  // Past the year either side, the pass cannot belong to this scan.
  if (Math.abs(nearest - anchor) > 366 * MS_PER_DAY) return null;
  return new Date(nearest).toISOString().slice(0, 10);
}
