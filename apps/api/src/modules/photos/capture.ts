import { z } from 'zod';

/**
 * Capture time and position from a photo's own EXIF — the media worker's
 * fallback when registration carried none (FR-029; research D-34; tasks.md
 * T113). Pure: `exifr` reads the tags in the worker, and this decides what they
 * are worth.
 *
 * EXIF is input the traveller's camera wrote and nobody checked, so every rule
 * here refuses a guess rather than presenting one as fact (Constitution IV):
 *
 *   - `DateTimeOriginal` is a wall clock with no zone. It names an instant only
 *     with `OffsetTimeOriginal` beside it; failing that, the GPS date and time
 *     do, because the EXIF specification defines them as UTC; failing both, the
 *     photo keeps no time. Reading the wall clock in the server's zone — what
 *     `exifr` does when left to revive dates — would file a Tokyo photo nine
 *     hours from when it was taken.
 *   - A date the calendar does not have (31 February), or one the wire cannot
 *     carry back (`isWireInstant`), is no date.
 *   - A position is both coordinates inside their ranges; exactly 0,0 is what a
 *     camera writes when it has no fix, and is no position.
 *
 * Visibility posture: produces values for columns of `photos`, which are owner
 * + explicit public + approved (data-model.md §5). The position is location
 * data: it is never logged, and a public projection must leave it out (FR-055).
 */

export interface Capture {
  /** An ISO-8601 instant in UTC, or null when the photo names none. */
  readonly takenAt: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/**
 * The tags the worker asks `exifr` for, with its revivers off: dates stay the
 * strings the camera wrote. A tag of an unexpected type is dropped on its own
 * rather than discarding its neighbours.
 */
const ExifTags = z.object({
  DateTimeOriginal: z.string().optional().catch(undefined),
  OffsetTimeOriginal: z.string().optional().catch(undefined),
  GPSDateStamp: z.string().optional().catch(undefined),
  GPSTimeStamp: z.array(z.number()).length(3).optional().catch(undefined),
  latitude: z.number().optional().catch(undefined),
  longitude: z.number().optional().catch(undefined),
});
type ExifTags = z.infer<typeof ExifTags>;

/** The tag names `exifr` must pick for {@link captureFromExif}. */
export const CAPTURE_TAGS = [
  'DateTimeOriginal',
  'OffsetTimeOriginal',
  'GPSDateStamp',
  'GPSTimeStamp',
  'GPSLatitude',
  'GPSLatitudeRef',
  'GPSLongitude',
  'GPSLongitudeRef',
] as const;

const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})$/;
const EXIF_OFFSET = /^([+-])(\d{2}):(\d{2})$/;

/** UTC offsets in use run from -12:00 to +14:00. */
const MAX_OFFSET_MINUTES = 14 * 60;

/** The years `z.iso.datetime()` accepts, and so the years `taken_at` can travel in. */
const FIRST_WIRE_YEAR = 0;
const LAST_WIRE_YEAR = 9999;

interface ClockReading {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** What EXIF says about when and where, or null when it says nothing usable. */
export function captureFromExif(tags: unknown): Capture | null {
  const parsed = ExifTags.safeParse(tags);
  if (!parsed.success) return null;

  const takenAt = captureInstant(parsed.data);
  const position = capturePosition(parsed.data.latitude, parsed.data.longitude);
  if (takenAt === null && position === null) return null;

  return { takenAt, lat: position?.lat ?? null, lng: position?.lng ?? null };
}

/**
 * True when `toISOString()` of this instant is a string the contracts'
 * `IsoDateTime` accepts. `9999-12-31T23:59:59-12:00` parses, and is year 10000
 * in UTC — which serialises as `+010000-…`, and would fail every later read of
 * the row against its contract.
 */
export function isWireInstant(instant: Date): boolean {
  if (Number.isNaN(instant.getTime())) return false;
  const year = instant.getUTCFullYear();
  return year >= FIRST_WIRE_YEAR && year <= LAST_WIRE_YEAR;
}

function captureInstant(tags: ExifTags): string | null {
  const clock = readClock(tags.DateTimeOriginal);
  const offset = readOffsetMinutes(tags.OffsetTimeOriginal);
  const fromClock = clock && offset !== null ? instantAt(clock, offset) : null;
  return fromClock ?? gpsInstant(tags.GPSDateStamp, tags.GPSTimeStamp);
}

function readClock(value: string | undefined): ClockReading | null {
  const match = value ? EXIF_DATE_TIME.exec(value.trim()) : null;
  return match ? toReading(match.slice(1).map(Number)) : null;
}

function readOffsetMinutes(value: string | undefined): number | null {
  const match = value ? EXIF_OFFSET.exec(value.trim()) : null;
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (Number(match[3]) >= 60 || minutes > MAX_OFFSET_MINUTES) return null;
  return match[1] === '-' ? -minutes : minutes;
}

/** `GPSDateStamp` + `GPSTimeStamp`: UTC by definition. Fractions of a second are dropped. */
function gpsInstant(
  date: string | undefined,
  time: readonly number[] | undefined,
): string | null {
  const match = date ? EXIF_DATE.exec(date.trim()) : null;
  if (!match || !time) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const reading = toReading([
    year,
    month,
    day,
    time[0],
    time[1],
    Math.floor(time[2] ?? NaN),
  ]);
  return reading ? instantAt(reading, 0) : null;
}

function toReading([year, month, day, hour, minute, second]: readonly (
  number | undefined
)[]): ClockReading | null {
  // Field by field rather than `every`, which would not narrow the tuple.
  return isInteger(year) &&
    isInteger(month) &&
    isInteger(day) &&
    isInteger(hour) &&
    isInteger(minute) &&
    isInteger(second)
    ? { year, month, day, hour, minute, second }
    : null;
}

function isInteger(value: number | undefined): value is number {
  return Number.isInteger(value);
}

/**
 * The wall clock read at a UTC offset, as an instant — or null when the clock
 * names a moment the calendar does not have. `Date.UTC` rolls 31 February over
 * into March without complaint, so the reading is compared back field by field.
 */
function instantAt(clock: ClockReading, offsetMinutes: number): string | null {
  const wall = new Date(
    Date.UTC(
      clock.year,
      clock.month - 1,
      clock.day,
      clock.hour,
      clock.minute,
      clock.second,
    ),
  );
  const faithful =
    wall.getUTCFullYear() === clock.year &&
    wall.getUTCMonth() === clock.month - 1 &&
    wall.getUTCDate() === clock.day &&
    wall.getUTCHours() === clock.hour &&
    wall.getUTCMinutes() === clock.minute &&
    wall.getUTCSeconds() === clock.second;
  if (!faithful) return null;

  const instant = new Date(wall.getTime() - offsetMinutes * 60_000);
  return isWireInstant(instant) ? instant.toISOString() : null;
}

function capturePosition(
  lat: number | undefined,
  lng: number | undefined,
): { lat: number; lng: number } | null {
  if (lat === undefined || lng === undefined) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
