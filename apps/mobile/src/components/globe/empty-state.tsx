/**
 * The globe's empty state — T098, FR-051, Acceptance Scenario 3.6.
 *
 * Two reasons the globe has nothing to draw, each with the one action that
 * moves the traveller forward (spec Edge Cases, "Globe"): no trips yet —
 * plan the first; trips without a stop — go and add one. The map is not
 * mounted behind either, so the traveller never meets a blank sphere, and a
 * first launch does not pay for a map it cannot use (SC-001).
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { EmptyState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';

export type GlobeEmptyReason = 'no-trips' | 'no-stops';

const COPY: Record<
  GlobeEmptyReason,
  { title: string; detail: string; action: string; testID: string }
> = {
  'no-trips': {
    title: 'Your globe is waiting for its first trip',
    detail: 'Add where you are going and the arcs draw themselves.',
    action: 'Plan a trip',
    testID: 'home-plan-trip',
  },
  'no-stops': {
    title: 'Your trips need a first stop',
    detail:
      'A trip appears on the globe once it has a city. Add one and its arcs draw themselves.',
    action: 'Open your trips',
    testID: 'home-open-trips',
  },
};

export type GlobeEmptyStateProps = {
  reason: GlobeEmptyReason;
  onAction: () => void;
};

export function GlobeEmptyState({ reason, onAction }: GlobeEmptyStateProps) {
  const copy = COPY[reason];
  return (
    <View testID="globe-empty-state" style={styles.body}>
      <EmptyState title={copy.title} detail={copy.detail} />
      <PressableSurface
        testID={copy.testID}
        accessibilityLabel={copy.action}
        depth={2}
        onPress={onAction}
        style={styles.action}>
        <ThemedText type="smallBold" style={styles.centred}>
          {copy.action}
        </ThemedText>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Spacing.four,
  },
  action: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
});
