/**
 * `HomePeek` - what the Home sheet shows at its lowest detent (feature 005, T535; contract
 * C5-23; FR-015): ONLY the live trip as a compact `NowCard` (a 56 dp thumbnail, a one-line
 * title), or, with none live, the next planned trip; and nothing when there is neither, where
 * the screen's invitation card takes over (`InvitationCard`, T537).
 *
 *   <HomePeek now={trips.now} onOpenTrip={(id) => router.push(`/trip/${id}`)} />
 *   <HomePeek now={trips.now} onOpenTrip={open} onExpand={() => setDetent('half')} />
 *
 * `onExpand` is the pictured behaviour: the peek card's chevron points up and the card raises
 * the sheet (`NowCard`); without it the card opens the trip.
 *
 * It leaves room at the end for the floating "Plan a trip" button, which at peek is the 56 dp
 * round one beside the card (56 plus a 12 dp gap, as the prototype: `padding-right`), so the
 * card never runs under it. The screen's own margins (20 dp) and the tab zone are the sheet's
 * content padding, not this component's.
 */
import { StyleSheet, View } from 'react-native';

import type { HomeTrip } from '@/features/home/home-trips';
import { Space } from '@/theme';

import { NowCard } from './now-card';

export interface HomePeekProps {
  /** The live trip, else the next planned one, else `null`. */
  now: HomeTrip | null;
  onOpenTrip: (tripId: string) => void;
  /** Raises the sheet to half: the card's press, with the up chevron. */
  onExpand?: () => void;
}

/** The round button's width and the gap between it and the card. */
const FAB_ROOM = 56 + Space[3];

export function HomePeek({ now, onOpenTrip, onExpand }: HomePeekProps) {
  if (now === null) return null;
  return (
    <View testID="home-peek" style={styles.peek}>
      <NowCard
        trip={now}
        compact
        onPress={() => onOpenTrip(now.id)}
        onExpand={onExpand}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  peek: { paddingEnd: FAB_ROOM },
});
