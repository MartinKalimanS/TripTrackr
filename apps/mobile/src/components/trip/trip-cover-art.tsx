/**
 * `TripCoverArt` - what fills the picture slot of a trip card (feature 005, T540; FR-008,
 * FR-034, FR-076; research D5-09; replaces feature 004's `TripCoverBand`).
 *
 *   <View style={{ height: 219, overflow: 'hidden' }}><TripCoverArt trip={card} /></View>
 *   <View style={{ size: 64, overflow: 'hidden' }}><TripCoverArt trip={card} thumb /></View>
 *
 * It fills the frame its parent gives it (`absoluteFill`) and the parent clips it to its
 * corner. Two looks, decided by the rule in `features/trips/trip-cover.ts` (the card model's
 * `cover`: the designated photograph if on the device, else the earliest, else none):
 *
 *   - a photograph: its THUMBNAIL (never the full image: a list of full-size photos is how a
 *     list runs a phone out of memory), `expo-image` with `contentFit="cover"`, cached in
 *     memory and on disk, a 220 ms fade in (none under reduced motion: it appears at once), and
 *     `recyclingKey` = the photo id, so a list cell reused for another trip never shows the last
 *     trip's picture while the new one loads. If the thumbnail will not draw the look falls
 *     back to the generated cover for that thumbnail: the failure is kept against the
 *     thumbnail's address, so a cell reused for another trip, or a new photograph, tries again
 *     instead of inheriting it;
 *   - the generated cover (`GeneratedCover`, FR-008): a gradient of one of three palettes, the
 *     country's code and a stamp outline, in the same frame, so nothing jumps when a photograph
 *     arrives or fails. `thumb` is its small form for a row or a ticket (the code alone).
 *
 * Both are decoration. A card is ONE control named by its label, which already says the title
 * and the status, so the frame is hidden from assistive technology on both platforms.
 *
 * A stale error: expo-image's `onError` event is `{ error: string }` (expo-image 57.0.x,
 * `ImageErrorEventData`) and names no source, so an error raised for a superseded source cannot be
 * told from one for the current one; it is recorded against the address shown when it ARRIVES.
 * The worst case is the generated cover for a photograph that would have drawn, until its
 * thumbnail changes or the cell is remounted: it costs a placeholder, never a wrong photograph.
 *
 * Ids are written out in full (`trip-card-${id}-cover`, `-photo`, `-generated`) so the id
 * extractor reads each with its literal head and the unresolved-id ratchet does not grow
 * (`test/testid-parity.test.ts`).
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GeneratedCover } from '@/components/ui/generated-cover';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';

export interface TripCoverArtProps {
  trip: Pick<TripCardModel, 'id' | 'cover' | 'generated'>;
  /** The small form of the generated cover, for a row or a ticket. */
  thumb?: boolean;
}

const FADE_MS = 220;

const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function TripCoverArt({ trip, thumb = false }: TripCoverArtProps) {
  const { prefersLessMotion } = useAccessibilityFlags();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const { cover, generated, id } = trip;

  return (
    <View
      testID={`trip-card-${id}-cover`}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      {...DECORATIVE}>
      {cover.kind === 'photo' && cover.thumbnailUri !== failedUri ? (
        <Image
          testID={`trip-card-${id}-photo`}
          source={{ uri: cover.thumbnailUri }}
          recyclingKey={cover.photoId}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={prefersLessMotion ? 0 : FADE_MS}
          onError={() => setFailedUri(cover.thumbnailUri)}
          style={StyleSheet.absoluteFill}
          {...DECORATIVE}
        />
      ) : (
        <GeneratedCover
          palette={generated.palette}
          iso2={generated.iso2}
          initial={generated.initial}
          thumb={thumb}
          testID={`trip-card-${id}-generated`}
        />
      )}
    </View>
  );
}
