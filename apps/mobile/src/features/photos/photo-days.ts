/**
 * The gallery's days — tasks.md T549 (FR-045; feature 005 UI-SPEC section 9.2).
 *
 * Pure. Photographs are grouped by the CALENDAR DAY they were taken, in the time zone of the
 * city they are filed under when this device knows it (a photo at 23:30 in Tokyo belongs to
 * that Tokyo day, wherever the traveller looks at it later) and in the device's zone with
 * no city. The input keeps the repository's order (newest first, undated last); the days come
 * out newest first with the photos of a day in the order they came in, and the photos with no
 * date form ONE group at the end. Hermes has no `Intl.PluralRules`: the count line is
 * "1 photo" or "N photos" by a plain comparison.
 *
 * A day says its numeral (the day of the month, "14"), its place (the city most of its photos
 * are filed under, the first one on a tie; none when no photo has a cached city), a meta line
 * ("Wed · Oct · 14 photos") and the sentence a screen reader reads for the whole section
 * ("Wednesday 14 October 2026, Sintra"). Nothing here stores or sends anything.
 */
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { deviceLocale } from '@/lib/locale';

export const UNDATED_KEY = 'undated';

export interface DayGroup {
  /** `YYYY-MM-DD` (the local day), or `undated`. */
  key: string;
  /** The day of the month, "14"; null for the undated group. */
  numeral: string | null;
  /** The city most of the day's photos are filed under; null when none is known. */
  place: string | null;
  /** "Wed · Oct · 14 photos"; "14 photos" for the undated group. */
  meta: string;
  /** The whole section for a screen reader. */
  label: string;
  count: number;
  photos: readonly PhotoWithPlace[];
}

/** "1 photo", "14 photos". */
export function photoCount(count: number): string {
  return `${count} ${count === 1 ? 'photo' : 'photos'}`;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string | null): Intl.DateTimeFormat {
  const key = timeZone ?? '';
  let formatter = formatters.get(key);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    try {
      formatter = new Intl.DateTimeFormat(
        'en-US',
        timeZone ? { ...options, timeZone } : options,
      );
    } catch {
      // A zone this platform's time-zone data does not have: the device's own zone.
      formatter = new Intl.DateTimeFormat('en-US', options);
    }
    formatters.set(key, formatter);
  }
  return formatter;
}

/** The local calendar day of a photo as `YYYY-MM-DD`, or `undated`. */
export function dayKeyOf(
  photo: Pick<PhotoWithPlace, 'taken_at' | 'city_timezone'>,
): string {
  if (photo.taken_at === null) return UNDATED_KEY;
  const date = new Date(photo.taken_at);
  if (Number.isNaN(date.getTime())) return UNDATED_KEY;
  const parts = dayFormatter(photo.city_timezone).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The city most of `photos` are filed under; the first of a tie; null when none has a name. */
export function dominantPlace(photos: readonly PhotoWithPlace[]): string | null {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    if (photo.city_name)
      counts.set(photo.city_name, (counts.get(photo.city_name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

/** Noon UTC of a `YYYY-MM-DD`: formatted in UTC it is that same day everywhere. */
function noonOf(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function describeDay(
  key: string,
  photos: readonly PhotoWithPlace[],
  languageTag: string,
): DayGroup {
  const count = photos.length;
  if (key === UNDATED_KEY) {
    return {
      key,
      numeral: null,
      place: dominantPlace(photos),
      meta: photoCount(count),
      label: `Date unknown, ${photoCount(count)}`,
      count,
      photos,
    };
  }
  const date = noonOf(key);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(languageTag, { ...options, timeZone: 'UTC' }).format(date);
  const place = dominantPlace(photos);
  const spoken = format({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return {
    key,
    numeral: String(Number(key.slice(8, 10))),
    place,
    meta: `${format({ weekday: 'short' })} · ${format({ month: 'short' })} · ${photoCount(count)}`,
    label: place ? `${spoken}, ${place}` : spoken,
    count,
    photos,
  };
}

/** The photos as days, newest day first, the undated photos last. */
export function groupByDay(
  photos: readonly PhotoWithPlace[],
  languageTag: string = deviceLocale().languageTag,
): DayGroup[] {
  const byDay = new Map<string, PhotoWithPlace[]>();
  for (const photo of photos) {
    const key = dayKeyOf(photo);
    const day = byDay.get(key);
    if (day) day.push(photo);
    else byDay.set(key, [photo]);
  }
  const keys = [...byDay.keys()].sort((a, b) => {
    if (a === UNDATED_KEY) return b === UNDATED_KEY ? 0 : 1;
    if (b === UNDATED_KEY) return -1;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  return keys.map((key) => describeDay(key, byDay.get(key) ?? [], languageTag));
}
