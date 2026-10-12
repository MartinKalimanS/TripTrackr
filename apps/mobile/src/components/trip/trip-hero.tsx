/**
 * `TripHero` - the trip's picture, full bleed, with its title anchored to the bottom
 * (tasks.md T543; contract C5-20; spec FR-037, FR-007, FR-008, FR-076; research D5-10, D5-12).
 *
 *   <TripHero title={trip.title} cover={cover} tripId={trip.id} country={country}
 *             dateRange={range} imageStyle={collapse.imageStyle} onHeight={setHeight} />
 *
 * Top to bottom, and nothing in it has a fixed height:
 *
 * - The picture (`trip-hero-image`): the cover thumbnail, or, with no usable photograph or
 *   one that will not draw, the generated cover (FR-008), on the same frame so nothing
 *   jumps. It is taller than the hero by the parallax travel, pinned to the top, and moves
 *   with `imageStyle` (the parallax and the overscroll stretch of `useHeroCollapse`), so
 *   its lower edge never shows. A picture is decoration: hidden from assistive technology.
 * - `Scrim kind="top"` over the status-bar zone and `Scrim kind="caption"` under the text:
 *   the band is a fixed darkening whose alpha under any line is the scrim's own minimum, so
 *   white text meets 4.5:1 even over a white photograph at every text size (FR-007; the
 *   scrim carries the measurement).
 * - The caption: the eyebrow (the flag chip, "Portugal . 12 Oct - 19 Oct 2026") and the
 *   title (`trip-title`, the screen's heading, in the exact words of the trip, white and
 *   opaque). The hero is a bottom-aligned column of MINIMUMS (236 dp, and 100 dp of room
 *   above the text for the status bar and the Back control): the title takes up to two
 *   lines and the hero grows UPWARD around it, so at the largest text size the title is
 *   still whole instead of cut (FR-037, FR-074). The caption keeps 36 dp under the text (28
 *   of overlap with the sheet and 8 of air).
 *
 * The hero reports its laid-out height (`onHeight`) because the bar that replaces it
 * collapses when THIS hero has gone, which depends on the text size.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { FlagChip } from '@/components/ui/flag-chip';
import { GeneratedCover, coverPalette } from '@/components/ui/generated-cover';
import { isLargeText } from '@/components/ui/reflow';
import { Scrim } from '@/components/ui/scrim';
import { Text } from '@/components/ui/text';
import { typographicCover, type TripCover } from '@/features/trips/trip-cover';
import { formatDateRange } from '@/features/trips/trip-date-range';
import type { TripDateRange } from '@/features/trips/trip-status';
import { Motion, Space } from '@/theme';

import { HERO_MIN_HEIGHT, SHEET_OVERLAP } from './hero-collapse';

export interface TripHeroCountry {
  /** The ISO alpha-2 code for the flag, or `null` when the country has none to show. */
  iso2: string | null;
  name: string;
}

export interface TripHeroProps {
  title: string;
  cover: TripCover;
  /** Seeds the generated cover's palette (`coverPalette`), as the trip's card does. */
  tripId: string;
  country?: TripHeroCountry | null;
  dateRange?: TripDateRange | null;
  /** The parallax and stretch of `useHeroCollapse`. */
  imageStyle?: StyleProp<ViewStyle>;
  /** Called with the laid-out height, so the collapse knows when the hero has gone. */
  onHeight?: (height: number) => void;
}

/** Room above the text for the status bar and the Back control (the prototype's 100). */
const TOP_ROOM = 100;
/** The caption's air under the title: the sheet's overlap and 8 dp. */
const CAPTION_BOTTOM = SHEET_OVERLAP + Space[2];

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** "Portugal . 12 Oct - 19 Oct 2026": whichever parts there are, or `null` for none. */
function eyebrowOf(
  country: TripHeroCountry | null | undefined,
  dateRange: TripDateRange | null | undefined,
): string | null {
  const dates = dateRange ? formatDateRange(dateRange) : null;
  const parts = [country?.name, dates].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function Eyebrow({ text, iso2 }: { text: string; iso2: string | null }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View className="flex-row items-center gap-2">
      {iso2 ? <FlagChip iso2={iso2} testID="trip-hero-flag" /> : null}
      <Text
        variant="eyebrow"
        tone="onPhoto"
        numberOfLines={isLargeText(fontScale) ? 2 : 1}
        testID="trip-hero-eyebrow"
        className="flex-1">
        {text}
      </Text>
    </View>
  );
}

interface CoverProps {
  cover: TripCover;
  title: string;
  tripId: string;
  iso2: string | null;
}

/** The picture, or the generated cover where there is none or it will not draw. */
function Cover({ cover, title, tripId, iso2 }: CoverProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  if (cover.kind === 'photo' && cover.thumbnailUri !== failedUri) {
    return (
      <Image
        testID="trip-hero-photo"
        source={{ uri: cover.thumbnailUri }}
        recyclingKey={cover.photoId}
        contentFit="cover"
        transition={Motion.transitionMs}
        onError={() => setFailedUri(cover.thumbnailUri)}
        style={StyleSheet.absoluteFill}
        {...HIDDEN}
      />
    );
  }
  const initial =
    cover.kind === 'typographic'
      ? cover.initial
      : typographicCover({ title }, 'planning').initial;
  return (
    <GeneratedCover
      testID="trip-hero-generated"
      palette={coverPalette(tripId)}
      iso2={iso2}
      initial={initial}
    />
  );
}

export function TripHero({
  title,
  cover,
  tripId,
  country,
  dateRange,
  imageStyle,
  onHeight,
}: TripHeroProps) {
  const eyebrow = eyebrowOf(country, dateRange);
  const iso2 = country?.iso2 ?? null;
  return (
    <View
      testID="trip-hero"
      style={styles.hero}
      onLayout={(event) => onHeight?.(event.nativeEvent.layout.height)}>
      <Animated.View
        testID="trip-hero-image"
        style={[styles.image, imageStyle]}
        {...HIDDEN}>
        <Cover cover={cover} title={title} tripId={tripId} iso2={iso2} />
      </Animated.View>
      <Scrim kind="top" testID="trip-hero-scrim-top" />
      <Scrim kind="caption" testID="trip-hero-caption" contentStyle={styles.captionBlock}>
        {eyebrow ? <Eyebrow text={eyebrow} iso2={iso2} /> : null}
        <Text
          variant="title"
          tone="onPhoto"
          numberOfLines={2}
          accessibilityRole="header"
          testID="trip-title">
          {title}
        </Text>
      </Scrim>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: HERO_MIN_HEIGHT,
    paddingTop: TOP_ROOM,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  // Pinned to the top and the sides, and as far below as the parallax can pull it up, so the
  // lower edge of the picture is never seen.
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -HERO_MIN_HEIGHT,
  },
  captionBlock: {
    gap: Space[1],
    paddingTop: Space[1],
    paddingHorizontal: Space[5],
    paddingBottom: CAPTION_BOTTOM,
  },
});
