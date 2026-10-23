/**
 * What a photo is, in words — tasks.md T117 (FR-029, FR-041; research D-27;
 * feature 002 FR-010).
 *
 * Pure. A photo's time was stored in UTC (exif.ts); it is shown in the device
 * locale (`expo-localization` through lib/locale.ts, formatted by `Intl`) and
 * in the time zone of the city it is filed under when this device has that
 * city cached — a photo taken at six in the evening in Tokyo reads 18:30
 * wherever the traveller looks at it later. With no city, the device's zone.
 *
 * `photoLabel` is the whole tile for a screen reader: when, where, and — for
 * any photo whose bytes have not reached the server — that it is not yet
 * saved beyond this device (Constitution II), in words rather than a colour.
 */
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { deviceLocale, formatDistance } from '@/lib/locale';

import { filingMismatchKm, placeLabel } from './city-match';
import { UPLOAD_STATE_COPY } from './photo-copy';

type Place = Pick<PhotoWithPlace, 'city_id' | 'city_name' | 'country_name'>;

const DAY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};
const DAY_AND_TIME: Intl.DateTimeFormatOptions = {
  ...DAY,
  hour: '2-digit',
  minute: '2-digit',
};

export interface TakenAtOptions {
  /** An IANA zone, e.g. the filed city's; the device's zone when absent. */
  timeZone?: string | null;
  /** Include the time of day. Default true. */
  withTime?: boolean;
  languageTag?: string;
}

/** "12 May 2026, 18:30" (locale-dependent), in `timeZone` when the platform knows it. */
export function formatTakenAt(iso: string, options: TakenAtOptions = {}): string {
  const { timeZone, withTime = true, languageTag = deviceLocale().languageTag } = options;
  const format = withTime ? DAY_AND_TIME : DAY;
  const date = new Date(iso);
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat(languageTag, { ...format, timeZone }).format(date);
    } catch {
      // A zone name this platform's time-zone data does not have (RangeError):
      // the device's own zone is the honest fallback, not a failure to render.
    }
  }
  return new Intl.DateTimeFormat(languageTag, format).format(date);
}

/** "Roma, Italy"; "City #777" for a city this device has not cached; null for none. */
export function placeOf(photo: Place): string | null {
  return photo.city_id === null ? null : placeLabel({ ...photo, city_id: photo.city_id });
}

/** The viewer's line: "Taken 12 May 2026, 18:30 (Roma time)". */
export function takenAtLine(photo: PhotoWithPlace): string {
  if (photo.taken_at === null) return 'Date taken unknown';
  const inCity = photo.city_timezone !== null && photo.city_name !== null;
  const when = formatTakenAt(photo.taken_at, { timeZone: photo.city_timezone });
  return inCity ? `Taken ${when} (${photo.city_name} time)` : `Taken ${when}`;
}

/**
 * Said when the filed city contradicts the photo's own position: "This photo
 * was taken about 234 km from Firenze, so …". It surfaces the disagreement
 * and never resolves it — the traveller's filing stands (data-model.md §5).
 * Null when they agree, or when there is nothing to compare.
 */
export function filingMismatchLine(
  photo: PhotoWithPlace,
  languageTag: string = deviceLocale().languageTag,
): string | null {
  if (photo.city_id === null) return null;
  const km = filingMismatchKm(photo, { lat: photo.city_lat, lng: photo.city_lng });
  if (km === null) return null;
  // Kilometres, or miles where the device measures in them (FR-077), grouped in `languageTag`.
  const { text: distance } = formatDistance(km, { ...deviceLocale(), languageTag });
  const city = photo.city_name ?? `City #${photo.city_id}`;
  return `This photo was taken about ${distance} from ${city}, so it may be filed under the wrong city. You can change it below.`;
}

const STATE_SENTENCE: Record<PhotoWithPlace['upload_state'], string> = {
  pending: ` ${UPLOAD_STATE_COPY.pending.badge} — saved on this device only.`,
  failed: ` ${UPLOAD_STATE_COPY.failed.badge}.`,
  uploaded: '',
};

/** A tile, for a screen reader: when, where, and whether its bytes have arrived. */
export function photoLabel(photo: PhotoWithPlace): string {
  const when =
    photo.taken_at === null
      ? 'Photo, date taken unknown'
      : `Photo taken ${formatTakenAt(photo.taken_at, {
          timeZone: photo.city_timezone,
          withTime: false,
        })}`;
  const place = placeOf(photo);
  const where = place ? `filed under ${place}` : 'not filed under a city';
  return `${when}, ${where}.${STATE_SENTENCE[photo.upload_state]}`;
}
