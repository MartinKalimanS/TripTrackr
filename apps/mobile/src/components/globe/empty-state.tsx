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
 * covered whole. The card owns its padding: none on the card itself, so the cap is
 * the card's whole height, and `OVERLAY_CARD_INSET` on the scroller's content, which
 * is also the gutter that keeps the focus ring of the button (4 dp outside it) from
 * being clipped by the scroller's edge.
 *
 * What a screen reader meets (FR-030). The notice is ONE focus stop, an `alert`
 * named by its title and its reason, as the statistics are one summary: a plain
 * `Card` announces nothing of its own and has no `accessible` prop, so the
 * announcement sits on an outer view and the card inside only paints. The invitation
 * is deliberately NOT merged, exactly as before: its title, its reason and its button
 * are separate stops, and the button must stay individually focusable and pressable.
 */
import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ALERT_ICON } from '@/components/ui/alert-icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { ScreenMargin } from '@/theme';

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
export const OVERLAY_MAX_HEIGHT_SHARE = 0.6;
/**
 * The padding of the cards over the globe, on every side, inside the scroller. The kit's
 * card pads 16 dp by class and these cards do not rely on it: the card is told it has
 * none (`styles.card`), so this is the one padding, and the scroller's cap is the card's
 * whole height. It is also the gutter a focus ring needs (`FocusRing` is 4 dp outside).
 */
export const OVERLAY_CARD_INSET = Spacing.three;
/** As wide as the container, up to `max-w-md` (28 rem): never the width of a tablet. */
const CARD_WIDTH = 'self-stretch max-w-md';

/** The tallest a card over the globe may be in a window this high, in dp. */
export function overlayMaxHeight(windowHeight: number): number {
  return Math.max(0, Math.round(windowHeight * OVERLAY_MAX_HEIGHT_SHARE));
}

type OverlayCardProps = PropsWithChildren<{
  testID: string;
  /** Extra padding above the content, for art that overhangs the card (the invitation). */
  topInset?: number;
  /** The pictured invitation (`home-empty.png`): 20 at the sides, centred, 8 dp apart. */
  invite?: boolean;
}>;

/** The invitation's content: 20 dp at the sides, 16 below, centred (prototype `.invite`). */
const INVITE_CONTENT = {
  paddingHorizontal: ScreenMargin.default,
  paddingBottom: OVERLAY_CARD_INSET,
  gap: Spacing.two,
  alignItems: 'center',
} as const;

/**
 * The one card both messages use: opaque over the map, a capped width, and a
 * scroller that only matters when the traveller's text is large enough for the
 * words to outgrow their share of the window.
 */
function OverlayCard({
  testID,
  topInset = 0,
  invite = false,
  children,
}: OverlayCardProps) {
  const { height } = useWindowDimensions();
  return (
    <Card overMap testID={testID} className={CARD_WIDTH} style={styles.card}>
      <ScrollView
        style={{ maxHeight: overlayMaxHeight(height) }}
        contentContainerStyle={
          invite
            ? { ...INVITE_CONTENT, paddingTop: OVERLAY_CARD_INSET + topInset }
            : [styles.content, { paddingTop: OVERLAY_CARD_INSET + topInset }]
        }
        alwaysBounceVertical={false}>
        {children}
      </ScrollView>
    </Card>
  );
}

/** The headline, with its accent word (if the title has it) in the serif accent face. */
function Headline({
  title,
  accent,
  className,
}: {
  title: string;
  accent?: string;
  className?: string;
}) {
  const at = accent ? title.indexOf(accent) : -1;
  if (!accent || at === -1) {
    return (
      <Text type="title" className={className}>
        {title}
      </Text>
    );
  }
  return (
    <Text type="title" className={className}>
      {title.slice(0, at)}
      <Text variant="accent">{accent}</Text>
      {title.slice(at + accent.length)}
    </Text>
  );
}

export type GlobeEmptyStateProps = {
  reason: GlobeEmptyReason;
  /** One word of the headline, set in the serif accent face (feature 005, FR-020). */
  accent?: string;
  /** Extra padding above the words, for the frames that overhang the card. */
  topInset?: number;
  /** With exactly one trip waiting for a stop: its title, and `onAction` opens it. */
  tripTitle?: string;
  onAction: () => void;
  /** The pictured layout (centred words, a full-width primary): the Home's first invitation. */
  invite?: boolean;
  /** A secondary control under the primary (the pictured text button); `invite` only. */
  secondary?: ReactNode;
};

export function GlobeEmptyState({
  reason,
  tripTitle,
  accent,
  topInset,
  onAction,
  invite = false,
  secondary,
}: GlobeEmptyStateProps) {
  const copy = copyFor(reason, tripTitle);
  const centred = invite ? 'text-center' : undefined;
  return (
    <OverlayCard testID="globe-empty-state" topInset={topInset} invite={invite}>
      <Headline title={copy.title} accent={accent} className={centred} />
      <Text type="callout" tone="muted" className={centred}>
        {copy.detail}
      </Text>
      <Button
        variant="primary"
        testID={copy.testID}
        accessibilityLabel={copy.action}
        // The press event is dropped on purpose: `onAction` takes no arguments.
        onPress={() => onAction()}
        className={invite ? 'mt-3 self-stretch' : 'mt-2 self-start'}>
        {copy.action}
      </Button>
      {invite ? secondary : null}
    </OverlayCard>
  );
}

export type GlobeNoticeProps = { title: string; detail?: string };

/** What a screen reader says for the whole notice: its title, then its reason. */
function noticeLabel({ title, detail }: GlobeNoticeProps): string {
  return detail ? `${title}. ${detail}` : title;
}

/**
 * A plain-words problem over the globe: the same card, no action. One announced
 * `alert` (so iOS reads it on appearance as Android does): the announcement is on the
 * outer view, the card inside only paints.
 */
export function GlobeNotice({ title, detail }: GlobeNoticeProps) {
  return (
    <View
      testID="globe-notice"
      accessible
      accessibilityRole="alert"
      accessibilityLabel={noticeLabel({ title, detail })}
      className={CARD_WIDTH}>
      <OverlayCard testID="globe-notice-card">
        <NoticeBody title={title} detail={detail} />
      </OverlayCard>
    </View>
  );
}

/** The leading alert icon beside the title in the danger ink and the muted reason. */
function NoticeBody({ title, detail }: GlobeNoticeProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  // The kit's surface pads by class; this card pads inside its scroller instead.
  card: {
    padding: 0,
  },
  content: {
    padding: OVERLAY_CARD_INSET,
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
