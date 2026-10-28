/**
 * The storage caption of a trip's offline maps — tasks.md T444 (004 FR-015, FR-025).
 *
 * What this trip's saved maps take on the device, as one sentence under the list of
 * cities: the sum of the sizes the screen already shows per city (`ready` states), in the
 * same decimal units (`formatPackSize`). It is a presentation of states the caller owns —
 * it reads no pack, asks Mapbox nothing and changes nothing about what is saved or how.
 *
 * Only a finished map has a size the screen knows: a download in progress reports a
 * percentage, a failed one reports nothing, so neither is counted, and the words say
 * "use" for what is there, not "will use". A map is shared by every trip that visits its
 * city, so the sentence says it is about THIS trip's cities, not the whole device.
 *
 * Privacy posture (Constitution I): the figures are public tile sizes on this device; no
 * traveller data is involved and nothing leaves the phone.
 */
import { deviceLocale } from '@/lib/locale';

import {
  formatPackSize,
  type FormattedText,
  type OfflinePackState,
} from './offline-packs';

const NOTHING_SAVED = 'None of this trip’s cities are saved on this device yet.';

/** "Maps for this trip’s cities use 12.4 MB on this device." (and its spoken form). */
export function storageCaption(
  states: readonly OfflinePackState[],
  languageTag: string = deviceLocale().languageTag,
): FormattedText {
  const finished = states.filter((state) => state.kind === 'ready');
  if (finished.length === 0) return { text: NOTHING_SAVED, spoken: NOTHING_SAVED };

  const bytes = finished.reduce((sum, state) => sum + state.bytes, 0);
  const size = formatPackSize(bytes, languageTag);
  const sentence = (figure: string) =>
    `Maps for this trip’s cities use ${figure} on this device.`;
  return { text: sentence(size.text), spoken: sentence(size.spoken) };
}

/** A map too small to see still gets a sliver of the bar, so the legend is not a lie. */
const MIN_MAPS_SHARE = 0.02;

export interface StorageFigures {
  /** Whether any map of this trip is finished. */
  saved: boolean;
  mapsBytes: number;
  maps: FormattedText;
  /** Null when the device cannot say how much room is left. */
  free: FormattedText | null;
  /** The shares of the bar (Maps, then Free), summing to 1; null without a free figure. */
  bar: { maps: number; free: number } | null;
}

/**
 * The storage card's numbers: what this trip's finished maps take (the same sum as
 * `storageCaption`), the room the device says it has, and the two shares of the bar. A free
 * reading that is missing, zero or not a number means the platform cannot say: no figure and
 * no bar are made up. Photos waiting to upload have no byte size in the store, so they have
 * no segment.
 */
export function storageFigures(
  states: readonly OfflinePackState[],
  freeBytes: number | null,
  languageTag: string = deviceLocale().languageTag,
): StorageFigures {
  const finished = states.filter((state) => state.kind === 'ready');
  const mapsBytes = finished.reduce((sum, state) => sum + state.bytes, 0);
  const room =
    typeof freeBytes === 'number' && Number.isFinite(freeBytes) && freeBytes > 0
      ? freeBytes
      : null;
  const mapsShare =
    mapsBytes > 0
      ? Math.min(Math.max(mapsBytes / (mapsBytes + (room ?? 0)), MIN_MAPS_SHARE), 1)
      : 0;
  return {
    saved: finished.length > 0,
    mapsBytes,
    maps: formatPackSize(mapsBytes, languageTag),
    free: room === null ? null : formatPackSize(room, languageTag),
    bar: room === null ? null : { maps: mapsShare, free: 1 - mapsShare },
  };
}
