/**
 * What floats over the globe when it has nothing to draw — T098, FR-051,
 * Acceptance Scenario 3.6; amended by feature 003 (FR-001 to FR-003).
 *
 * The globe is no longer replaced by a message: it is always there, and one
 * compact card names the single action that moves the traveller forward (spec
 * Edge Cases, "Globe"): no trips yet — plan the first; trips without a stop —
 * add one (that trip's own stop, when there is exactly one). The card sits over
 * map content, so feature 002 contract C12 decides its treatment: flat — no
 * shadow falls onto the map (FR-024) — and opaque with a compliant border, so
 * it reads over light and dark imagery alike (FR-025), as the statistics panel
 * does.
 */
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { Colors, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

export type GlobeEmptyReason = 'no-trips' | 'no-stops';

type Copy = { title: string; detail: string; action: string; testID: string };

function copyFor(reason: GlobeEmptyReason, tripTitle?: string): Copy {
  if (reason === 'no-trips') {
    return {
      title: 'Your globe is waiting for its first trip',
      detail: 'Add where you are going and the arcs draw themselves.',
      action: 'Plan a trip',
      testID: 'home-plan-trip',
    };
  }
  if (tripTitle) {
    return {
      title: 'Your trip needs a first stop',
      detail: `“${tripTitle}” appears on the globe once it has a city.`,
      action: 'Add a first stop',
      testID: 'home-add-stop',
    };
  }
  return {
    title: 'Your trips need a first stop',
    detail:
      'A trip appears on the globe once it has a city. Add one and its arcs draw themselves.',
    action: 'Open your trips',
    testID: 'home-open-trips',
  };
}

export type GlobeEmptyStateProps = {
  reason: GlobeEmptyReason;
  /** With exactly one trip waiting for a stop: its title, and `onAction` opens it. */
  tripTitle?: string;
  onAction: () => void;
};

export function GlobeEmptyState({ reason, tripTitle, onAction }: GlobeEmptyStateProps) {
  const copy = copyFor(reason, tripTitle);
  return (
    <Surface
      testID="globe-empty-state"
      treatment="flat"
      interactive
      radius="lg"
      style={styles.card}>
      <ThemedText type="smallBold">{copy.title}</ThemedText>
      <ThemedText type="small" themeColor="textMuted" numberOfLines={3}>
        {copy.detail}
      </ThemedText>
      <PressableSurface
        testID={copy.testID}
        accessibilityLabel={copy.action}
        depth={1}
        onPress={onAction}
        style={styles.action}>
        <ThemedText type="smallBold">{copy.action}</ThemedText>
      </PressableSurface>
    </Surface>
  );
}

export type GlobeNoticeProps = { title: string; detail?: string };

/** A plain-words problem over the globe: the same card, no action. */
export function GlobeNotice({ title, detail }: GlobeNoticeProps) {
  const { theme } = useAppearance();
  return (
    <Surface
      testID="globe-notice"
      treatment="flat"
      interactive
      radius="lg"
      accessibilityRole="alert"
      style={styles.card}>
      <ThemedText type="smallBold" style={{ color: Colors[theme].danger }}>
        {title}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textMuted">
          {detail}
        </ThemedText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  action: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
