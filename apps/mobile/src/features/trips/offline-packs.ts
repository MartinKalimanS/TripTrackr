/**
 * Offline map packs for a trip's cities, the pure half — tasks.md T105
 * (FR-044; User Story 4, Acceptance Scenarios 3 and 4); research D-06, D-30.
 *
 * A pack is Mapbox's first-party offline region (`offlineManager.createPack`,
 * @rnmapbox/maps 10.3.5 over the Maps SDK v11 tile store): the app's basemap
 * style plus its tiles for a box around one city, from city scale to the
 * streets. The globe draws that same style, so a city whose pack is complete
 * renders from the device with no connection (Acceptance Scenario 4.4).
 *
 * One pack per CITY, shared by every trip that visits it: `city-<cityId>`.
 *
 * Privacy posture (Constitution I): a pack holds public map tiles and the
 * public city's id and name — no trip id, no dates, no traveller data. It
 * lives only in the device's Mapbox tile store and is never sent to the
 * TripTrackr API; Mapbox sees the tile requests, as it does for the globe.
 *
 * Mapbox limits: the tile store refuses a region that would take the device
 * past its tile-pack quota (750 packs on SDK v11; 6,000 tiles on the legacy
 * store). The quota is Mapbox's term of service and is NOT raised here —
 * `setTileCountLimit` is never called. A refusal arrives as a download error
 * and is shown in the words below.
 */
import type { offlineManager } from '@rnmapbox/maps';

import { GlobeBasemap } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import { deviceLocale } from '@/lib/locale';

/** What `createPack` takes — derived, because the package root does not export the type. */
export type CityPackOptions = Parameters<typeof offlineManager.createPack>[0];

/** Half the side of the saved box: the city and the day trips around it. */
export const CITY_PACK_RADIUS_KM = 15;

/**
 * City scale to the streets, where the basemap's buildings stand (FR-049).
 * The globe's wider zooms stay in the ambient cache; a pack for them would
 * be most of a country.
 */
export const CITY_PACK_ZOOM = { min: 10, max: 16 } as const;

/** Mean length of a degree of latitude, and of longitude at the equator. */
const KM_PER_DEGREE = 111.32;

/** Web Mercator cannot draw past ~85.05°; the box stops just inside. */
const MAX_LATITUDE = 85;
const MAX_LONGITUDE = 180;

/** The legacy offline store's `Complete`; SDK v11's native modules send "complete". */
const LEGACY_COMPLETE_STATE = 2;
const COMPLETE_STATE = 'complete';

export const OFFLINE_PACK_COPY = {
  tooLarge:
    'This city is too large to save, or this device’s offline map limit is reached. Remove another city and try again.',
  noSpace: 'There isn’t enough free space on this device. Free some space and try again.',
  noConnection: 'The download needs a connection. Connect to the internet and try again.',
  failed: 'This city’s map couldn’t be saved. Try again.',
  interrupted: 'The download stopped before it finished. Try again to finish it.',
  unreadable: 'This city’s saved map couldn’t be read. Remove it and download it again.',
  removeFailed: 'The saved map couldn’t be removed. Try again.',
} as const;

/** A city of the trip that this device can place, so its map can be saved. */
export interface OfflineCity {
  cityId: number;
  cityName: string;
  countryName: string | null;
  lat: number;
  lng: number;
}

type StopPlace = Pick<
  StopWithPlace,
  'city_id' | 'city_name' | 'country_name' | 'lat' | 'lng'
>;

export interface TripCities {
  /** Each city once, in the order the trip first visits it. */
  placed: OfflineCity[];
  /** Cities not in this device's cache: no position, so no map to save yet. */
  unplaced: Pick<StopWithPlace, 'city_id' | 'city_name'>[];
}

/** What a city's map is doing, as the screen shows it. */
export type OfflinePackState =
  | { kind: 'none' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'ready'; bytes: number }
  /** `partial`: some of the city is saved on the device, so it can be removed. */
  | { kind: 'error'; message: string; partial: boolean };

export interface PackProgress {
  /** Whole percent; 100 only once the download is complete. */
  percent: number;
  complete: boolean;
  /** Bytes saved so far. */
  bytes: number;
}

/** Native status fields, read defensively: the typings and the devices disagree. */
export interface PackStatusLike {
  state?: unknown;
  percentage?: unknown;
  completedResourceSize?: unknown;
  completedTileSize?: unknown;
}

export interface FormattedText {
  /** For the screen. */
  text: string;
  /** For a screen reader, which may spell "MB" out letter by letter. */
  spoken: string;
}

export function packName(cityId: number): string {
  return `city-${cityId}`;
}

/** The city a pack was saved for, or null for a pack this app did not name. */
export function cityIdOfPack(name: unknown): number | null {
  if (typeof name !== 'string') return null;
  const match = /^city-(\d+)$/.exec(name);
  return match ? Number(match[1]) : null;
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * The saved box, `[[neLng, neLat], [swLng, swLat]]` as `createPack` takes it.
 * Longitude degrees shrink with latitude, so the box widens in degrees
 * towards the poles to stay the same width on the ground. It is cut, not
 * wrapped, at ±180°: the native side spans from the south-west corner east
 * to the north-east one, so a wrapped box would cover the rest of the world.
 */
export function cityBounds(
  lng: number,
  lat: number,
  radiusKm: number = CITY_PACK_RADIUS_KM,
): [[number, number], [number, number]] {
  const halfLat = radiusKm / KM_PER_DEGREE;
  const halfLng = radiusKm / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));
  return [
    [clamp(lng + halfLng, MAX_LONGITUDE), clamp(lat + halfLat, MAX_LATITUDE)],
    [clamp(lng - halfLng, MAX_LONGITUDE), clamp(lat - halfLat, MAX_LATITUDE)],
  ];
}

/** The pack for a city: the app's basemap, city zooms, a public id and name only. */
export function cityPackOptions(city: OfflineCity): CityPackOptions {
  return {
    name: packName(city.cityId),
    styleURL: GlobeBasemap.styleURL,
    bounds: cityBounds(city.lng, city.lat),
    minZoom: CITY_PACK_ZOOM.min,
    maxZoom: CITY_PACK_ZOOM.max,
    metadata: { cityId: city.cityId, cityName: city.cityName },
  };
}

function toOfflineCity(stop: StopPlace): OfflineCity | null {
  const { city_name: cityName, lat, lng } = stop;
  if (cityName === null || lat === null || lng === null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Beyond MAX_LATITUDE the box would widen into a band round the whole world.
  if (Math.abs(lat) > MAX_LATITUDE || Math.abs(lng) > MAX_LONGITUDE) return null;
  return { cityId: stop.city_id, cityName, countryName: stop.country_name, lat, lng };
}

/**
 * Each of the trip's cities once, in the order it is first visited. A city
 * this device has not cached has no position, and nothing is saved at a
 * guessed one (Constitution IV) — it is set apart so the screen can say why.
 */
export function tripCities(stops: readonly StopPlace[]): TripCities {
  const seen = new Set<number>();
  const placed: OfflineCity[] = [];
  const unplaced: TripCities['unplaced'] = [];
  for (const stop of stops) {
    if (seen.has(stop.city_id)) continue;
    seen.add(stop.city_id);
    const city = toOfflineCity(stop);
    if (city) placed.push(city);
    else unplaced.push({ city_id: stop.city_id, city_name: stop.city_name });
  }
  return { placed, unplaced };
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A native status as the screen shows it. Complete at 100%, or when the
 * state says so: the typings promise a number (the legacy enum's 2), while
 * the SDK v11 native modules send the string "complete" — and a region with
 * nothing to fetch reports no percentage at all.
 */
export function packProgress(status: PackStatusLike): PackProgress {
  const percentage = finiteOr(status.percentage, 0);
  const complete =
    percentage >= 100 ||
    status.state === COMPLETE_STATE ||
    status.state === LEGACY_COMPLETE_STATE;
  const bytes = finiteOr(
    status.completedResourceSize,
    finiteOr(status.completedTileSize, 0),
  );
  return {
    percent: complete ? 100 : Math.max(0, Math.floor(percentage)),
    complete,
    bytes: Math.max(0, bytes),
  };
}

function messageOf(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  const hasMessage = typeof error === 'object' && error !== null && 'message' in error;
  return hasMessage && typeof error.message === 'string' ? error.message : undefined;
}

/**
 * First match wins: a quota refusal can mention the network it did not use.
 * "offline" is deliberately not a connection word — the SDK's own messages
 * say "Unknown offline pack" — iOS's "…appears to be offline" is caught by
 * "connection".
 */
const ERROR_WORDS: readonly (readonly [RegExp, string])[] = [
  [/limit|exceed|too many|quota/i, OFFLINE_PACK_COPY.tooLarge],
  [/disk|space|storage/i, OFFLINE_PACK_COPY.noSpace],
  [/network|internet|connect|timed? ?out|host/i, OFFLINE_PACK_COPY.noConnection],
];

/** A download failure in words a traveller can act on (feature 002 FR-010). */
export function describePackError(error: unknown): string {
  const message = messageOf(error) ?? '';
  const match = ERROR_WORDS.find(([pattern]) => pattern.test(message));
  return match ? match[1] : OFFLINE_PACK_COPY.failed;
}

/** `createPack` refuses a name already on the device (@rnmapbox/maps offlineManager.ts). */
export function isAlreadyExists(error: unknown): boolean {
  return /already exists/i.test(messageOf(error) ?? '');
}

const SIZE_UNITS = [
  { bytes: 1e9, short: 'GB', one: 'gigabyte', many: 'gigabytes' },
  { bytes: 1e6, short: 'MB', one: 'megabyte', many: 'megabytes' },
  { bytes: 1e3, short: 'KB', one: 'kilobyte', many: 'kilobytes' },
] as const;

/**
 * "12.4 MB" in the device locale. Decimal units, as both platforms' storage
 * settings count them. The unit is appended rather than formatted with
 * `Intl`'s `unit` style, whose support varies across Hermes builds.
 */
export function formatPackSize(
  bytes: number,
  languageTag: string = deviceLocale().languageTag,
): FormattedText {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const unit = SIZE_UNITS.find((candidate) => size >= candidate.bytes) ?? SIZE_UNITS[2];
  const figure = new Intl.NumberFormat(languageTag, { maximumFractionDigits: 1 }).format(
    size / unit.bytes,
  );
  return {
    text: `${figure} ${unit.short}`,
    spoken: `${figure} ${figure === '1' ? unit.one : unit.many}`,
  };
}

function formatPercent(percent: number, languageTag: string): string {
  return new Intl.NumberFormat(languageTag, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(percent / 100);
}

/** A city's state as words — progress is text, never colour alone. */
export function packStatusText(
  state: OfflinePackState,
  languageTag: string = deviceLocale().languageTag,
): FormattedText {
  switch (state.kind) {
    case 'none':
      return { text: 'Not saved on this device', spoken: 'Not saved on this device' };
    case 'downloading': {
      const percent = formatPercent(state.percent, languageTag);
      return { text: `Downloading… ${percent}`, spoken: `Downloading, ${percent}` };
    }
    case 'ready': {
      const size = formatPackSize(state.bytes, languageTag);
      return {
        text: `Ready offline · ${size.text}`,
        spoken: `Ready offline, ${size.spoken}`,
      };
    }
    case 'error':
      return { text: state.message, spoken: state.message };
  }
}
