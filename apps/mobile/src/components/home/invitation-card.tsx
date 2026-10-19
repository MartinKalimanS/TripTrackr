/**
 * `InvitationCard` - what floats over the globe when it has nothing to draw (feature 005, T537;
 * contract C5-23; FR-020, FR-018; research D5-14, owner answer Q-8): the existing
 * `globe-empty-state` card with its one primary action, and, for a traveller with NO trips,
 * three tilted EMPTY photo frames over its top edge and one serif accent word in the headline.
 * Stock photographs are never shipped (FR-020): the frames are the `StateArt` of every empty
 * state, a pin glyph on a plain fill.
 *
 *   <InvitationCard reason="no-trips" onAction={planTrip} />
 *   <InvitationCard reason="no-stops" tripTitle="Alps, spring" onAction={openTrip} />
 *
 * - `no-trips`: "Your globe is waiting for its first trip", "Plan a trip" (`home-plan-trip`).
 * - `no-stops` (trips exist, none has a place): "Your trip needs a first stop" and "Add a first
 *   stop" (`home-add-stop`), or "Your trips need a first stop" and "Open your trips"
 *   (`home-open-trips`); no frames, the card alone.
 *
 * The card, its ids, its words and its one primary are those of feature 003 (`empty-state.tsx`,
 * flows 03, 04 and 05); only the art and the accent word are new. The frames overhang the top of
 * the card by 64 dp: they sit in an absolute slot drawn AFTER the card (so over it), the card's
 * content is padded to clear them, and the slot is decoration (hidden from assistive technology,
 * no touch), so the card's own focus order and presses are unchanged.
 */
import { StyleSheet, View } from 'react-native';

import {
  GlobeEmptyState,
  type GlobeEmptyReason,
  type GlobeEmptyStateProps,
} from '@/components/globe/empty-state';
import { StateArt } from '@/components/ui/state-art';

/** How far the frames stand above the card's top edge, in dp. */
export const ART_OVERHANG = 64;
/** The frames' box is 112 dp tall: the part of it that is inside the card. */
const ART_INSIDE = 48;
/** The headline's one accent word. */
const ACCENT = 'first';

export interface InvitationCardProps extends Pick<
  GlobeEmptyStateProps,
  'tripTitle' | 'onAction'
> {
  reason: GlobeEmptyReason;
}

export function InvitationCard({ reason, tripTitle, onAction }: InvitationCardProps) {
  if (reason !== 'no-trips') {
    return <GlobeEmptyState reason={reason} tripTitle={tripTitle} onAction={onAction} />;
  }
  return (
    <View testID="home-invitation" style={styles.wrap}>
      <GlobeEmptyState
        reason="no-trips"
        accent={ACCENT}
        topInset={ART_INSIDE}
        onAction={onAction}
      />
      <View
        testID="home-invitation-art-slot"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.art}>
        <StateArt variant="frames" testID="home-invitation-art" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', paddingTop: ART_OVERHANG },
  art: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
});
