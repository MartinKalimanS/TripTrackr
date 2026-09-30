/**
 * What a photo's embedded metadata says — tasks.md T116 (FR-029; research D-34;
 * Constitution IV).
 *
 * Read from the picker's `exif` BEFORE the photo is re-encoded, because the
 * re-encode drops every tag (reencode.ts). The time and position then travel
 * as fields on registration and are the only copy of where a photo was taken
 * (data-model.md §5). Pure: no device, no clock beyond the zone rule below.
 *
 * The shapes, as expo-image-picker 57 delivers them:
 *   - iOS: the `{Exif}` dictionary's keys at the top level, TIFF keys merged in,
 *     and the `{GPS}` dictionary flattened to `GPS<Key>` (ImageUtils.swift);
 *     older builds nested it as `{GPS}`. Coordinates are unsigned, with a
 *     reference letter; `OffsetTimeOriginal` is present on modern iPhones.
 *   - Android: ExifInterface tags (ImagePickerConstants.kt). `GPSLatitude` and
 *     `GPSLongitude` are ALREADY SIGNED (from `getLatLong()`), beside the same
 *     reference letters — and are a bare `0.0` when the references are absent.
 *     `OffsetTimeOriginal` is not in the picker's tag list at all.
 *
 * Rules (a missing or garbage value is null, never a guess):
 *   - Position: the reference letter decides the sign of the magnitude, so a
 *     pre-signed Android value is not negated twice. No reference, an unknown
 *     one, a value out of range, or exactly (0, 0) — the placeholder of a fix
 *     that never happened, and what Android's media redaction leaves — is no
 *     position. Both coordinates or neither, as the wire requires.
 *   - Time: `DateTimeOriginal` only. `DateTimeDigitized` and `DateTime` are
 *     not capture times (a scan's date is not the photo's).
 *   - A `DateTimeOriginal` WITHOUT an offset is a wall-clock reading with no
 *     zone. It is resolved, in order, by:
 *       1. `OffsetTimeOriginal`, when present and a real offset — exact;
 *       2. the GPS UTC stamp (`GPSDateStamp` + `GPSTimeStamp`) recorded with
 *          the same shot: the difference, rounded to the quarter-hour every
 *          real zone sits on, when it is within `GPS_TOLERANCE_MINUTES` of that
 *          grid and between -12:00 and +14:00 — exact when the fix was fresh;
 *       3. the device's own zone rules for that date (`deviceZoneOffset`) —
 *          exact for a photo just taken, or taken where the device is now; a
 *          library photo from across a time-zone border is off by that border's
 *          difference, never by more than a day. Every Android photo without a
 *          GPS stamp lands here, since its picker omits the offset tag.
 *     The result is stored in UTC (`toISOString()`), so rows sort as strings.
 */

/** A capture time as the camera wrote it: no zone. Months and days count from 1. */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Minutes east of UTC in which to read an offset-less wall clock. */
export type ZoneOffset = (wall: WallClock) => number;

export interface ExifReading {
  /** ISO-8601 UTC instant, or null when absent or unreadable. */
  takenAt: string | null;
  /** Decimal degrees; both or neither. */
  lat: number | null;
  lng: number | null;
}

/** How far a GPS stamp may sit off the quarter-hour grid and still name the zone. */
export const GPS_TOLERANCE_MINUTES = 3;

const MIN_OFFSET_MINUTES = -12 * 60;
const MAX_OFFSET_MINUTES = 14 * 60;
const MIN_YEAR = 1900;
const MINUTE_MS = 60_000;

const EXIF_DATE_TIME = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const EXIF_OFFSET = /^([+-])(\d{2}):?(\d{2})$/;
const GPS_DATE = /^(\d{4})[:-](\d{2})[:-](\d{2})$/;
const GPS_TIME = /^(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.\d+)?$/;
const DECIMAL = /^[+-]?\d+(?:\.\d+)?$/;

type Tags = Record<string, unknown>;

const NO_POSITION = { lat: null, lng: null } as const;

function isTags(value: unknown): value is Tags {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rule-3 zone: this device's offset at that wall-clock moment, DST
 * included, from the platform's own zone rules.
 */
export function deviceZoneOffset(wall: WallClock): number {
  const local = new Date(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return -local.getTimezoneOffset();
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** The wall clock as if it were UTC, in milliseconds. */
function asUtcMs(wall: WallClock): number {
  return Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
}

function isRealMoment(wall: WallClock): boolean {
  if (wall.year < MIN_YEAR || wall.month < 1 || wall.month > 12 || wall.day < 1) {
    return false;
  }
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) return false;
  // Rejects the 30th of February: the date must survive a round trip.
  const probe = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  return probe.getUTCMonth() === wall.month - 1 && probe.getUTCDate() === wall.day;
}

function parseWallClock(value: unknown): WallClock | null {
  if (typeof value !== 'string') return null;
  const match = EXIF_DATE_TIME.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const wall = { year, month, day, hour, minute, second };
  return isRealMoment(wall) ? wall : null;
}

/** "+02:00" / "-0530" → minutes east of UTC; anything else → null. */
function parseOffset(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = EXIF_OFFSET.exec(value.trim());
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  if (Number(match[3]) > 59 || minutes > MAX_OFFSET_MINUTES) return null;
  return match[1] === '-' ? -minutes : minutes;
}

/** A GPS field from iOS's `{GPS}` sub-dictionary, else from the flattened `GPS<Key>`. */
function gpsTag(tags: Tags, key: string): unknown {
  const nested = tags['{GPS}'];
  if (isTags(nested) && nested[key] !== undefined) return nested[key];
  return tags[`GPS${key}`];
}

/** The GPS stamp — always UTC by the EXIF standard — in milliseconds. */
function gpsInstantMs(tags: Tags): number | null {
  const date = gpsTag(tags, 'DateStamp');
  const time = gpsTag(tags, 'TimeStamp');
  if (typeof date !== 'string' || typeof time !== 'string') return null;
  const day = GPS_DATE.exec(date.trim());
  const clock = GPS_TIME.exec(time.trim());
  if (!day || !clock) return null;
  const wall = {
    year: Number(day[1]),
    month: Number(day[2]),
    day: Number(day[3]),
    hour: Number(clock[1]),
    minute: Number(clock[2]),
    second: Number(clock[3]),
  };
  return isRealMoment(wall) ? asUtcMs(wall) : null;
}

/** Rule 2: the zone the camera's clock was in, if the GPS stamp says so plainly. */
function offsetFromGps(wallMs: number, gpsMs: number | null): number | null {
  if (gpsMs === null) return null;
  const difference = (wallMs - gpsMs) / MINUTE_MS;
  const offset = Math.round(difference / 15) * 15;
  if (Math.abs(difference - offset) > GPS_TOLERANCE_MINUTES) return null;
  if (offset < MIN_OFFSET_MINUTES || offset > MAX_OFFSET_MINUTES) return null;
  return offset;
}

function readTakenAt(tags: Tags, zoneOffset: ZoneOffset): string | null {
  const wall = parseWallClock(tags.DateTimeOriginal);
  if (!wall) return null;
  const wallMs = asUtcMs(wall);
  const offset =
    parseOffset(tags.OffsetTimeOriginal) ??
    offsetFromGps(wallMs, gpsInstantMs(tags)) ??
    zoneOffset(wall);
  return new Date(wallMs - offset * MINUTE_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Position
// ---------------------------------------------------------------------------

/** "51/1" → 51, "26.4" → 26.4; a zero denominator or words → null. */
function rational(part: string): number | null {
  const trimmed = part.trim();
  if (DECIMAL.test(trimmed)) return Number(trimmed);
  const fraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (!fraction || Number(fraction[2]) === 0) return null;
  return Number(fraction[1]) / Number(fraction[2]);
}

/** Degrees, minutes, seconds — each non-negative, minutes and seconds under 60. */
function fromDms(parts: readonly (number | null)[]): number | null {
  if (parts.length === 0 || parts.length > 3) return null;
  const usable = parts.every(
    (part) => part !== null && Number.isFinite(part) && part >= 0,
  );
  if (!usable) return null;
  const [degrees = 0, minutes = 0, seconds = 0] = parts as readonly number[];
  if (minutes >= 60 || seconds >= 60) return null;
  return degrees + minutes / 60 + seconds / 3600;
}

function toDegrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return fromDms(value.map((part) => (typeof part === 'number' ? part : null)));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (DECIMAL.test(trimmed)) return Number(trimmed);
  return fromDms(trimmed.split(',').map(rational));
}

/** "N", " n ", "N\0" → "N": EXIF ASCII fields may keep their NUL terminator. */
function referenceLetter(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.split('\u0000').join('').trim().toUpperCase() || null;
}

function coordinate(
  value: unknown,
  reference: unknown,
  [positive, negative]: readonly [string, string],
  limit: number,
): number | null {
  const degrees = toDegrees(value);
  const letter = referenceLetter(reference);
  if (degrees === null || (letter !== positive && letter !== negative)) return null;
  const magnitude = Math.abs(degrees);
  if (magnitude > limit) return null;
  // `|| 0` keeps the equator from reading as -0.
  return letter === negative ? -magnitude || 0 : magnitude;
}

function readPosition(tags: Tags): { lat: number | null; lng: number | null } {
  const lat = coordinate(
    gpsTag(tags, 'Latitude'),
    gpsTag(tags, 'LatitudeRef'),
    ['N', 'S'],
    90,
  );
  const lng = coordinate(
    gpsTag(tags, 'Longitude'),
    gpsTag(tags, 'LongitudeRef'),
    ['E', 'W'],
    180,
  );
  if (lat === null || lng === null) return NO_POSITION;
  if (lat === 0 && lng === 0) return NO_POSITION;
  return { lat, lng };
}

/**
 * The capture time and position in a picker asset's `exif`, or nulls. Never
 * throws: metadata is whatever the file happened to carry.
 */
export function readExif(
  exif: unknown,
  zoneOffset: ZoneOffset = deviceZoneOffset,
): ExifReading {
  if (!isTags(exif)) return { takenAt: null, ...NO_POSITION };
  return { takenAt: readTakenAt(exif, zoneOffset), ...readPosition(exif) };
}
