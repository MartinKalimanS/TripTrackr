/**
 * What floats over the globe when it has nothing to draw — T098, FR-051,
 * Acceptance Scenario 3.6; amended by feature 003 (FR-001 to FR-003); Atlas cards
 * by feature 004 (T428; FR-005, FR-018, FR-029, FR-033, research D4-11).
 *
 * The globe is no longer replaced by a message: it is always there, and one
 * compact card names the single action that moves the traveller forward (spec
 * Edge Cases, "Globe"): no trips yet — plan the first; trips without a stop —
 * add one (that trip's own stop, when there is exactly one). The card sits over
 * map content, so it is a `Card overMap`: the opaque `surface` fill with a
 * hairline `border`, no shadow, no tint and no translucency, so it reads over
 * light and dark imagery alike, as the statistics chip does.
 *
 * The invitation is a `title`, a muted reason and ONE primary `Button` (FR-005);
 * the notice is an `alert` with a leading alert icon, so a problem is never
 * colour alone (FR-025).
 *
 * Largest text size (FR-029). The words wrap in full — nothing is truncated — and
 * the card has a capped width, so it never spans a tablet. Its height is capped at
 * a share of the window, and only past that does the card scroll inside itself, so
 * every word and the action stay reachable while the globe, which the container
 * leaves interactive (`pointerEvents: 'box-none'` in the Home route), is never
 * covered whole.
 */
import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ALERT_ICON } from '@/components/ui/alert-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

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

/** The share of the window a card may take before it scrolls inside itself. */
const MAX_HEIGHT_SHARE = 0.6;
/** The kit's card pads every side by this much; the scroller sits inside it. */
const CARD_INSET = Spacing.three;

type OverlayCardProps = PropsWithChildren<{
  testID: string;
  accessibilityRole?: 'alert';
}>;

/**
 * The one card both messages use: opaque over the map, a capped width, and a
 * scroller that only matters when the traveller's text is large enough for the
 * words to outgrow their share of the window.
 */
function OverlayCard({ testID, accessibilityRole, children }: OverlayCardProps) {
  const { height } = useWindowDimensions();
  const maxHeight = Math.max(0, Math.round(height * MAX_HEIGHT_SHARE - 2 * CARD_INSET));
  return (
    <Card
      overMap
      testID={testID}
      accessibilityRole={accessibilityRole}
      className="self-stretch max-w-md">
      <ScrollView
        style={{ maxHeight }}
        contentContainerStyle={styles.content}
        alwaysBounceVertical={false}>
        {children}
      </ScrollView>
    </Card>
  );
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
    <OverlayCard testID="globe-empty-state">
      <Text type="title">{copy.title}</Text>
      <Text type="callout" tone="muted">
        {copy.detail}
      </Text>
      <Button
        variant="primary"
        testID={copy.testID}
        accessibilityLabel={copy.action}
        onPress={() => onAction()}
        className="mt-2 self-start">
        {copy.action}
      </Button>
    </OverlayCard>
  );
}

export type GlobeNoticeProps = { title: string; detail?: string };

/** A plain-words problem over the globe: the same card, no action. */
export function GlobeNotice({ title, detail }: GlobeNoticeProps) {
  return (
    <OverlayCard testID="globe-notice" accessibilityRole="alert">
      <View style={styles.notice}>
        <View style={styles.noticeIcon}>
          <Icon name={ALERT_ICON} size={20} tone="danger" />
        </View>
        <View style={styles.noticeText}>
          <Text type="headline" tone="danger">
            {title}
          </Text>
          {detail ? (
            <Text type="callout" tone="muted">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
    </OverlayCard>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  // Centres the 20 dp glyph on the first line of the 24 dp headline.
  noticeIcon: {
    paddingTop: Spacing.half,
  },
  noticeText: {
    flex: 1,
    gap: Spacing.one,
  },
});
