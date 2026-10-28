/**
 * `TripHeroCard` - the active trip, as a large picture card at the top of the trips list
 * (feature 005, T540; contract C5-19; FR-007, FR-030, FR-031, FR-034, FR-075, FR-076; research
 * D5-10; prototype `.hero-card`).
 *
 *   <TripHeroCard trip={card} onPress={() => router.push(`/trip/${card.id}`)} />
 *
 * From the back: the cover (`TripCoverArt`: the trip's photograph, or the generated cover),
 * a row on top with the status pill ("Active · Day 3 of 8", white on the photograph in every
 * theme: `PhotoStatusPill`) and, while the
 * trip has changes the server has not confirmed, the sync marker (an icon and the words "Not
 * yet synced", on an opaque tint of its own, so it reads over any picture: US2 scenario 6 asks
 * for a marker with text, and the Maestro flows wait on those words; the row wraps at large
 * text), and at the foot, on the CAPTION scrim, the country with its flag chip and the number
 * of stops, the title (two lines at most), the dates and the nights, and the stop strip. Every
 * line of text over the picture is the opaque on-photo ink; the caption scrim's block WRAPS
 * the text and has a minimum, never a height, so the alpha under any line holds at every text
 * size (white on a white photograph is 5.3:1 or more).
 *
 * It is 24 dp round, at least 219 dp tall, with the first lift, and fixes no height: the
 * largest text size grows it and nothing clips (FR-074).
 *
 * ONE control (a `Tappable`, role button, `feedback="ring"`: a fill behind a photograph would show
 * nowhere and one over it would tint the picture): the name is the one feature 004 gave a trip
 * card, "title, status, N stops" (FR-075), with the hint "Opens the trip" and the id
 * `trip-card-<id>`; the day of the trip is its VALUE, not part of the name. The picture, the strip
 * and the flag are decoration. Ids kept from the 004 card where the element still exists:
 * `-status-row`, `-meta-row` (and `-cover`, `-photo` of `TripCoverArt`).
 *
 * The sync marker is what `SyncBadge` already says; nothing here reads or changes
 * synchronisation (Constitution II).
 */
import { View } from 'react-native';

import { FlagChip } from '@/components/ui/flag-chip';
import { Icon } from '@/components/ui/icon';
import { useLiftStyle } from '@/components/ui/lift';
import { metaLines } from '@/components/ui/reflow';
import { Scrim } from '@/components/ui/scrim';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { describeStopCount, eyebrowOf, heroDates } from '@/features/trips/trip-card-copy';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { useFontScale } from '@/hooks/use-font-scale';
import { cornerOf } from '@/theme';

import { PhotoStatusPill } from './photo-status-pill';
import { StopStrip } from './stop-strip';
import { TripCoverArt } from './trip-cover-art';

export interface TripHeroCardProps {
  trip: TripCardModel;
  onPress: () => void;
}

/** The prototype's `min-height: 219px`: a picture of about 16 to 10 on a phone. */
const MIN_HEIGHT = 219;

/** `background-position: 50% 58%`: a little below the middle, where a street or a skyline is. */
const COVER_FOCUS = { left: '50%', top: '58%' } as const;

/** The caption block's own padding: 16 dp at the sides and the foot, 4 dp between lines. */
const CAPTION_BLOCK = { paddingHorizontal: 16, paddingBottom: 16, gap: 4 } as const;

/**
 * `.strip { margin-top: 8px }` under the 4 dp gap of the caption block; the strip's halo box starts
 * 2 dp above the 12 dp dot, so 6 dp puts the dot where the picture has it.
 */
const STRIP_MARGIN = { marginTop: 6 } as const;

function Eyebrow({ trip }: { trip: TripCardModel }) {
  const fontScale = useFontScale();
  return (
    <View className="flex-row items-center gap-2">
      {trip.country ? (
        <FlagChip iso2={trip.country.iso2} testID={`trip-card-${trip.id}-flag`} />
      ) : null}
      <Text
        variant="eyebrow"
        tone="onPhoto"
        numberOfLines={metaLines(fontScale)}
        className="shrink">
        {eyebrowOf(trip)}
      </Text>
    </View>
  );
}

function Dates({ trip }: { trip: TripCardModel }) {
  const dates = heroDates(trip);
  if (dates === null) return null;
  return (
    <View
      testID={`trip-card-${trip.id}-meta-row`}
      className="flex-row items-center"
      style={{ gap: 6 }}>
      <Icon name="calendar" size={16} tone="onPhoto" />
      <Text variant="label" tone="onPhoto" className="shrink">
        {dates}
      </Text>
    </View>
  );
}

export function TripHeroCard({ trip, onPress }: TripHeroCardProps) {
  const lift = useLiftStyle('lift1');
  const { id, dayOf } = trip;

  return (
    <Tappable
      testID={`trip-card-${id}`}
      accessibilityLabel={`${trip.title}, ${trip.status}, ${describeStopCount(trip.stopCount)}`}
      accessibilityHint="Opens the trip"
      accessibilityValue={dayOf ? { text: `Day ${dayOf.day} of ${dayOf.of}` } : undefined}
      feedback="ring"
      onPress={onPress}
      style={[cornerOf('xl'), lift]}>
      <View
        testID={`trip-card-${id}-frame`}
        className="bg-sand"
        style={[
          cornerOf('xl'),
          { minHeight: MIN_HEIGHT, overflow: 'hidden', justifyContent: 'space-between' },
        ]}>
        <TripCoverArt trip={trip} contentPosition={COVER_FOCUS} />
        <View
          testID={`trip-card-${id}-status-row`}
          className="flex-row flex-wrap items-start justify-between gap-2 p-3">
          <PhotoStatusPill status={trip.status} dayOf={dayOf ?? undefined} />
          {trip.pending ? <SyncBadge state="pending" /> : null}
        </View>
        <Scrim kind="caption" contentStyle={CAPTION_BLOCK}>
          <Eyebrow trip={trip} />
          <Text variant="title" tone="onPhoto" numberOfLines={2} accessibilityRole="text">
            {trip.title}
          </Text>
          <Dates trip={trip} />
          <StopStrip dots={trip.strip} labels={trip.stripLabels} style={STRIP_MARGIN} />
        </Scrim>
      </View>
    </Tappable>
  );
}
