/**
 * The cover band of a trip card — tasks.md T430 (FR-011, FR-012; research D4-09).
 *
 * A strip across the top of the card, 120 dp tall, run out to the card's edges over the
 * surface's own padding (`-mx-4 -mt-4`: the kit's Surface pads 16 dp and clips to the
 * card's rounded corner, so the top corners are the card's). Two looks, decided by the
 * rule in `features/trips/trip-cover.ts`:
 *
 *   - `photo`: the thumbnail, never the full image (a list of full-size photos is how a
 *     list runs a phone out of memory), `contentFit="cover"`, no fade, recycled by photo
 *     id so a card `FlashList` reuses for another trip never shows the last trip's photo
 *     while the new one loads (as `PhotoTile` does). A hairline separates it from the
 *     surface, because a photograph can be any tone (contract C4-10 rule 9). If the
 *     thumbnail will not draw, the band falls back to the typographic look for that
 *     thumbnail: the title's initial tinted by status, exactly what the rule gives a trip
 *     with no photo. The failure is kept against the thumbnail's address, so a card
 *     reused for another trip, or a new photo, tries again instead of inheriting it.
 *   - `typographic`: a flat block in the status tint (the 15% soft fill and the ink of
 *     the status chip, the pairs the contrast gate measures) with the initial in the
 *     display face, large. It has a minimum height, not a fixed one: the initial grows
 *     with the text size and must not clip.
 *
 * Both are decoration. The card is one control named by its label, which already says
 * the title and the status, so the band is hidden from assistive technology on both
 * platforms. No colour is written here: the tints are semantic classes.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { typographicCover, type TripCover } from '@/features/trips/trip-cover';
import type { TripStatus } from '@/features/trips/trip-status';

export interface TripCoverBandProps {
  cover: TripCover;
  /** The trip's title and status: what the typographic look is made of on a failure. */
  title: string;
  status: TripStatus;
  /** The card's id: the band is `<idPrefix>-cover`, its parts `-photo` and `-initial`. */
  idPrefix: string;
}

/** Literal classes, so Tailwind finds each one: the soft fill and the ink per status. */
const TINT: Record<TripStatus, { fill: string; ink: string }> = {
  planning: { fill: 'bg-status-planning-ink/15', ink: 'text-status-planning-ink' },
  active: { fill: 'bg-status-active/15', ink: 'text-status-active' },
  past: { fill: 'bg-status-past/15', ink: 'text-status-past' },
};

/** Out over the card's 16 dp padding to its top and side edges. */
const BLEED = '-mx-4 -mt-4';

const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function TypographicBand({
  initial,
  status,
  idPrefix,
}: {
  initial: string;
  status: TripStatus;
  idPrefix: string;
}) {
  const { fill, ink } = TINT[status];
  return (
    <View
      testID={`${idPrefix}-cover`}
      className={`${BLEED} min-h-[120px] items-center justify-center ${fill}`}
      {...DECORATIVE}>
      <Text
        type="largeTitle"
        testID={`${idPrefix}-initial`}
        className={`text-[64px] leading-[72px] ${ink}`}>
        {initial}
      </Text>
    </View>
  );
}

function PhotoBand({
  uri,
  photoId,
  onError,
  idPrefix,
}: {
  uri: string;
  photoId: string;
  onError: () => void;
  idPrefix: string;
}) {
  return (
    <View
      testID={`${idPrefix}-cover`}
      className={`${BLEED} h-[120px] border-b border-border`}
      {...DECORATIVE}>
      <Image
        testID={`${idPrefix}-photo`}
        source={{ uri }}
        recyclingKey={photoId}
        contentFit="cover"
        transition={0}
        onError={onError}
        style={StyleSheet.absoluteFill}
        {...DECORATIVE}
      />
    </View>
  );
}

export function TripCoverBand({ cover, title, status, idPrefix }: TripCoverBandProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  if (cover.kind === 'photo' && cover.thumbnailUri !== failedUri) {
    return (
      <PhotoBand
        uri={cover.thumbnailUri}
        photoId={cover.photoId}
        onError={() => setFailedUri(cover.thumbnailUri)}
        idPrefix={idPrefix}
      />
    );
  }
  const look = cover.kind === 'typographic' ? cover : typographicCover({ title }, status);
  return (
    <TypographicBand initial={look.initial} status={look.status} idPrefix={idPrefix} />
  );
}
