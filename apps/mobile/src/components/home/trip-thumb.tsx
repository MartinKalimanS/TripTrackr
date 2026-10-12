/**
 * The small picture of a trip on the Home sheet (feature 005, T535; FR-008, FR-034, FR-076;
 * contracts C5-19 and C5-23): its photograph's thumbnail, or, when it has none or the file will
 * not draw, the generated cover (a gradient, the country's code), so the slot is never an empty
 * box and nothing jumps when a photograph arrives or fails.
 *
 *   <TripThumb tripId="t1" title="Portugal" cover={trip.cover} iso2="PT" size={64} ids={...} />
 *
 * The thumbnail, never the full photograph (a list of full-size photos is how a screen runs a
 * phone out of memory), `contentFit="cover"`, recycled by photo id. A hairline edge separates a
 * pale photograph from the sheet. It is decoration: the card or row that holds it names the
 * trip, so it is hidden from assistive technology on both platforms.
 *
 * `size` is a fixed dp box (64 on the card, 56 at peek, 48 on the row): the picture does not
 * scale with the text size; the text beside it does. The ids are written out at the call site
 * (`home-now-card-photo`, ...), so the id extractor reads each with its literal and the
 * unresolved-id ratchet does not grow.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GeneratedCover, coverPalette } from '@/components/ui/generated-cover';
import type { TripCover } from '@/features/trips/trip-cover';
import { cornerOf } from '@/theme';

export interface TripThumbIds {
  /** The box. */
  thumb: string;
  /** The photograph, while it draws. */
  photo: string;
  /** The generated cover, when there is no photograph or it will not draw. */
  generated: string;
}

export interface TripThumbProps {
  tripId: string;
  title: string;
  cover: TripCover;
  /** The country's code: the generated cover's big mark. */
  iso2: string | null;
  size: 48 | 56 | 64;
  ids: TripThumbIds;
}

const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** 12 dp corners on the 48 dp row thumbnail, 16 dp on the larger ones (C5-8). */
function cornerOfSize(size: TripThumbProps['size']) {
  return cornerOf(size === 48 ? 'md' : 'lg');
}

export function TripThumb({ tripId, title, cover, iso2, size, ids }: TripThumbProps) {
  // The address whose thumbnail failed to draw: kept against the address, so a card reused for
  // another trip, or a new photograph, tries again instead of inheriting the failure.
  const [failed, setFailed] = useState<string | null>(null);
  const uri =
    cover.kind === 'photo' && cover.thumbnailUri !== failed ? cover.thumbnailUri : null;

  return (
    <View
      testID={ids.thumb}
      className="overflow-hidden border border-separator"
      style={[{ width: size, height: size }, cornerOfSize(size)]}
      {...DECORATIVE}>
      {uri !== null && cover.kind === 'photo' ? (
        <Image
          testID={ids.photo}
          source={{ uri }}
          recyclingKey={cover.photoId}
          contentFit="cover"
          transition={0}
          onError={() => setFailed(uri)}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <GeneratedCover
          thumb
          palette={coverPalette(tripId)}
          iso2={iso2}
          initial={title}
          testID={ids.generated}
        />
      )}
    </View>
  );
}
