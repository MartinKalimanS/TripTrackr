/**
 * `TourOverlay` - the first-run tour (feature 007; spec FR-003 to FR-005, FR-008; mock-up
 * option A "spotlight tour", chosen by the owner 2026-10-24).
 *
 * Over the whole screen, above the tab bar: the screen is dimmed except for ONE real control,
 * which gets a ring, and a small card says what it is for. The card has a title, one or two
 * sentences, "2 of 5", a primary "Next" ("Done" on the last step), a text "Skip tour" and a
 * close (X). The tour closes at any moment: the X, Skip, Done, and the Android back button.
 *
 * - The dim is four plain views around the lit control (`dimPanels`), the same on both
 *   platforms. A touch on the dim does nothing and is not let through; a transparent blocker
 *   over the lit control stops it being pressed while the tour is open.
 * - Where the control is comes from `measureTourTarget` (the control registers itself with
 *   `useTourTarget`), measured when the step changes and again once the screen has settled
 *   (the Home sheet and the tab pill are still moving at the first frame). A step with no
 *   target, or whose target cannot be measured, dims the whole screen and centres the card.
 * - No animation: a step changes in place, so there is nothing for reduced motion to remove.
 * - The card is the app's opaque over-the-map card (hairline, second lift). It scrolls inside
 *   itself under a share of the window, so at the largest text size every word and every
 *   button stays reachable. The dim and the ring are decoration, hidden from assistive
 *   technology; the overlay is one modal group, and the title is a heading.
 *
 * Ids: `tour-overlay`, `tour-dim-<n>`, `tour-ring`, `tour-hole-blocker`, `tour-card`,
 * `tour-next`, `tour-skip`, `tour-close`. Nothing is read or sent: the layout passes
 * `onClosed` to record that the tour was seen.
 */
import { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { TOUR_STEPS, type TourStep, type TourTarget } from '@/features/tour/tour-steps';
import { useTourStore } from '@/features/tour/tour-store';
import { Space, cornerOf } from '@/theme';

import { cardTop, dimPanels, padRect, type Rect } from './tour-geometry';
import { measureTourTarget } from './tour-targets';

/** The card takes at most this share of the window before it scrolls inside itself. */
const CARD_MAX_SHARE = 0.6;
/** What the card is assumed to be tall until it has been laid out. */
const CARD_GUESS = 200;
/** The first frame is mid-motion (sheet, pill): measure once more when it has settled. */
const SETTLE_MS = 350;

export interface TourOverlayProps {
  /** Called whenever the tour closes (X, Skip, Done, back): the layout records it as seen. */
  onClosed: () => void;
}

/**
 * The rectangle of the current step's control, measured now and again after the screen settles.
 * A measurement belongs to the target it was taken for, so a step never shows the previous
 * step's rectangle while its own is being measured.
 */
function useHole(target: TourStep['target'], active: boolean): Rect | null {
  const { width, height } = useWindowDimensions();
  const [measured, setMeasured] = useState<{
    target: TourTarget;
    rect: Rect | null;
  } | null>(null);

  useEffect(() => {
    if (!active || target === null) return undefined;
    let cancelled = false;
    const measure = () =>
      measureTourTarget(target).then((rect) => {
        if (cancelled) return;
        setMeasured({
          target,
          rect: rect === null ? null : padRect(rect, { width, height }),
        });
      });
    void measure();
    const timer = setTimeout(() => void measure(), SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [target, active, width, height]);

  return active && target !== null && measured?.target === target ? measured.rect : null;
}

/** Android's back button closes the tour instead of leaving the screen behind it. */
function useTourBack(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [active, close]);
}

function Dots({ step }: { step: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.dots}>
      {TOUR_STEPS.map((tourStep, index) => (
        <View
          key={tourStep.id}
          className={index === step ? 'bg-foreground' : 'bg-separator'}
          style={styles.dot}
        />
      ))}
    </View>
  );
}

export function TourOverlay({ onClosed }: TourOverlayProps) {
  const open = useTourStore((state) => state.open);
  const step = useTourStore((state) => state.step);
  const { width, height } = useWindowDimensions();
  const [cardHeight, setCardHeight] = useState(CARD_GUESS);
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0]!;
  const hole = useHole(current.target, open);
  const last = step === TOUR_STEPS.length - 1;

  const finish = () => {
    useTourStore.getState().close();
    onClosed();
  };
  const advance = () => {
    if (last) finish();
    else useTourStore.getState().next();
  };
  useTourBack(open, finish);

  if (!open) return null;

  const bounds = { width, height };
  const top = cardTop(hole, bounds, cardHeight);

  return (
    <View
      testID="tour-overlay"
      accessibilityViewIsModal
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}>
      {dimPanels(hole, bounds).map((panel, index) => (
        <View
          key={index}
          testID={`tour-dim-${index}`}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="bg-backdrop"
          style={rectStyle(panel)}
        />
      ))}
      {hole === null ? null : (
        <>
          <View
            testID="tour-hole-blocker"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={rectStyle(hole)}
          />
          <View
            testID="tour-ring"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="border-2 border-accent"
            style={[rectStyle(hole), cornerOf('xl')]}
          />
        </>
      )}
      <View
        pointerEvents="box-none"
        onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        style={[styles.cardSlot, { top }]}>
        <Card overMap testID="tour-card" style={styles.card}>
          <ScrollView
            style={{ maxHeight: Math.round(height * CARD_MAX_SHARE) }}
            contentContainerStyle={styles.cardContent}
            alwaysBounceVertical={false}>
            <View style={styles.cardHead}>
              <Text variant="callout" accessibilityRole="header" style={styles.title}>
                {current.title}
              </Text>
              <IconButton
                icon="x"
                variant="ghost"
                accessibilityLabel="Close tour"
                testID="tour-close"
                onPress={finish}
              />
            </View>
            <Text variant="label" tone="muted">
              {current.body}
            </Text>
            <View style={styles.footer}>
              <View style={styles.progress}>
                <Dots step={step} />
                <Text variant="caption" tone="muted">
                  {`${step + 1} of ${TOUR_STEPS.length}`}
                </Text>
              </View>
              <View style={styles.actions}>
                <Button
                  variant="text"
                  size="sm"
                  testID="tour-skip"
                  accessibilityLabel="Skip tour"
                  onPress={finish}>
                  Skip tour
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  testID="tour-next"
                  accessibilityLabel={last ? 'Done' : 'Next'}
                  onPress={advance}>
                  {last ? 'Done' : 'Next'}
                </Button>
              </View>
            </View>
          </ScrollView>
        </Card>
      </View>
    </View>
  );
}

/** A rectangle as an absolute position. */
function rectStyle({ x, y, width, height }: Rect) {
  return { position: 'absolute', left: x, top: y, width, height } as const;
}

const styles = StyleSheet.create({
  cardSlot: {
    position: 'absolute',
    left: Space[4],
    right: Space[4],
    alignItems: 'center',
  },
  card: { alignSelf: 'stretch', maxWidth: 448, padding: 0 },
  cardContent: { padding: Space[4], gap: Space[2] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Space[2] },
  title: { flex: 1 },
  footer: { marginTop: Space[2], gap: Space[3] },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Space[3] },
  dots: { flexDirection: 'row', gap: Space[1] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Space[2],
  },
});
