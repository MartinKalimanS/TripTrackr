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
