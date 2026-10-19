/**
 * The callout of the live trip — feature 005, T533 (FR-011, FR-019, FR-073; research D5-04,
 * contract C5-24).
 *
 * ONE `MarkerView` for the whole globe. A coral ring sits round the live trip's pin with a
 * slow pulse, and a white card names the trip, "Portugal Road Trip / Day 3 of 8 · Sintra",
 * on the side of the pin that has room (`callout-layout.ts`; the caller passes `side` and the
 * `maxWidth` the card is narrowed to).
 *
 * The marker is laid out so the PIN IS ITS MIDDLE whichever side the card takes, and the
 * anchor is always (0.5, 0.5): the card is on one side of the ring and an invisible copy of
 * it, the same size, on the other. The card is therefore never positioned by measuring it.
 * The marker leaves touches to the map (`pointerEvents: 'none'`); the pin underneath answers
 * a tap.
 *
 * The pulse is a Reanimated CSS animation (`animationName`, declarative, on the UI thread, no
 * shared value), paused while the globe is not on screen or the app is away (`running`). Under
 * reduced motion it is STILL: no animation at all, a faint static ring, as the prototype's
 * static render (FR-019, FR-073). The map is one image to a screen reader and the callout
 * cannot be focused, so it is hidden from the reader and ANNOUNCED instead, once for each
 * thing it says: "Portugal Road Trip, Day 3 of 8, Sintra".
 */
import { MarkerView } from '@rnmapbox/maps';
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { useLiftStyle } from '@/components/ui/lift';
import {
  GlobeColors,
  GlobeLayers,
  GlobeStyle,
  type GlobeScheme,
} from '@/constants/theme';
import type { LngLat } from '@/features/globe/great-circle';
import { useAppearance } from '@/hooks/use-appearance';
import { Motion, Radii, Space } from '@/theme';

import type { CalloutSide } from './callout-layout';

const { callout: layout } = GlobeLayers;

export type ActiveCalloutProps = {
  coordinate: LngLat;
  title: string;
  /** "Day 3 of 8 · Sintra". */
  detail: string;
  /** Where the card sits relative to the pin. Default left, the prototype's first choice. */
  side?: CalloutSide;
  /** The width the card is narrowed to when its side is short of room. Default the maximum. */
  maxWidth?: number;
  /** The ring round the pin: round a dot by default, bigger round a roundel. */
  ringSize?: number;
  /** False while the globe is not on screen or the app is away: the pulse pauses. */
  running?: boolean;
  /** The card's measured size, for the placement. */
  onCardLayout?: (size: { width: number; height: number }) => void;
};

/** "Day 3 of 8 · Sintra" read aloud: the middle dot is not a word. */
function spoken(title: string, detail: string): string {
  return `${title}, ${detail.replace(/\s*·\s*/g, ', ')}`;
}

type CardProps = {
  scheme: GlobeScheme;
  title: string;
  detail: string;
  side: CalloutSide;
  maxWidth: number;
  /** The invisible copy that balances the real one: no ids, no layout report, no lift. */
  mirror?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
};

/** The small square that points the card at the pin, on the card's side facing the ring. */
function arrowStyle(side: CalloutSide, color: string): ViewStyle {
  const half = layout.arrow / 2;
  const near = -half + 1;
  const base: ViewStyle = {
    position: 'absolute',
    width: layout.arrow,
    height: layout.arrow,
    borderRadius: 2,
    backgroundColor: color,
    transform: [{ rotate: '45deg' }],
  };
  switch (side) {
    case 'left':
      return { ...base, right: near, top: '50%', marginTop: -half };
    case 'right':
      return { ...base, left: near, top: '50%', marginTop: -half };
    case 'above':
      return { ...base, bottom: near, left: '50%', marginLeft: -half };
    case 'below':
      return { ...base, top: near, left: '50%', marginLeft: -half };
  }
}

function CalloutCard({
  scheme,
  title,
  detail,
  side,
  maxWidth,
  mirror,
  onLayout,
}: CardProps) {
  const colours = GlobeStyle[scheme].callout;
  const lift = useLiftStyle(mirror ? null : 'lift2');
  return (
    <View
      testID={mirror ? undefined : 'globe-callout'}
      onLayout={onLayout}
      style={[
        styles.card,
        { backgroundColor: colours.surface, maxWidth, borderRadius: Radii.lg },
        lift,
      ]}>
      <Text
        variant="callout"
        numberOfLines={1}
        testID={mirror ? undefined : 'globe-callout-title'}
        style={{ color: colours.title }}>
        {title}
      </Text>
      <View style={styles.detailRow}>
        <View
          testID={mirror ? undefined : 'globe-callout-dot'}
          style={[styles.dot, { backgroundColor: colours.liveDot }]}
        />
        <Text
          variant="caption"
          numberOfLines={1}
          testID={mirror ? undefined : 'globe-callout-detail'}
          style={[styles.detail, { color: colours.detail }]}>
          {detail}
        </Text>
      </View>
      {mirror ? null : <View style={arrowStyle(side, colours.surface)} />}
    </View>
  );
}

type PulseProps = {
  scheme: GlobeScheme;
  size: number;
  reduced: boolean;
  running: boolean;
};

/** The ring that grows and fades, or, under reduced motion, a faint still one. */
function Pulse({ scheme, size, reduced, running }: PulseProps) {
  // An absolute child sits inside its parent's border: pull it out by the ring's own width so
  // the two rings share a middle, and the pulse grows round the pin.
  const base = {
    position: 'absolute',
    top: -layout.ringWidth,
    left: -layout.ringWidth,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: layout.pulseWidth,
    borderColor: GlobeColors[scheme].active,
  } as const;
  const style = reduced
    ? {
        ...base,
        opacity: layout.stillOpacity,
        transform: [{ scale: layout.stillScale }],
      }
    : {
        ...base,
        animationName: {
          from: { transform: [{ scale: 1 }], opacity: Motion.pulseOpacityFrom },
          to: { transform: [{ scale: Motion.pulseScaleTo }], opacity: 0 },
        },
        animationDuration: `${Motion.pulseMs}ms`,
        animationTimingFunction: 'ease-out' as const,
        animationIterationCount: 'infinite' as const,
        animationPlayState: running ? ('running' as const) : ('paused' as const),
      };
  return (
    <Animated.View testID="globe-callout-pulse" pointerEvents="none" style={style} />
  );
}

const DIRECTION = {
  left: 'row',
  right: 'row',
  above: 'column',
  below: 'column',
} as const;

/** The invisible copy: never touched, never read. */
const MIRROR_PROPS = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

type BodyProps = {
  scheme: GlobeScheme;
  side: CalloutSide;
  ringSize: number;
  reduced: boolean;
  running: boolean;
  /** Draws the card, or its invisible copy. */
  card: (mirror: boolean) => ReactNode;
};

/** Card, ring and mirror in a row or a column, the ring in the middle of the marker. */
function CalloutBody({ scheme, side, ringSize, reduced, running, card }: BodyProps) {
  const cardSlot = (
    <View testID="globe-callout-card-slot" style={styles.slot}>
      {card(false)}
    </View>
  );
  const mirror = (
    <View testID="globe-callout-mirror" style={styles.mirror} {...MIRROR_PROPS}>
      {card(true)}
    </View>
  );
  const ring = (
    <View
      testID="globe-callout-ring"
      style={{
        width: ringSize,
        height: ringSize,
        borderRadius: ringSize / 2,
        borderWidth: layout.ringWidth,
        borderColor: GlobeColors[scheme].active,
      }}>
      <Pulse scheme={scheme} size={ringSize} reduced={reduced} running={running} />
    </View>
  );
  const cardFirst = side === 'left' || side === 'above';
  return (
    <View
      testID="globe-callout-layout"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layout, { flexDirection: DIRECTION[side], gap: layout.gap }]}>
      {cardFirst ? cardSlot : mirror}
      {ring}
      {cardFirst ? mirror : cardSlot}
    </View>
  );
}

export function ActiveCallout({
  coordinate,
  title,
  detail,
  side = 'left',
  maxWidth = layout.maxWidth,
  ringSize = layout.ringSize.dot,
  running = true,
  onCardLayout,
}: ActiveCalloutProps) {
  const { theme, prefersLessMotion } = useAppearance();
  const message = spoken(title, detail);

  // Once for each thing it says: a re-render, a pulse or a move to another side is silent.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  const card = (mirror: boolean): ReactNode => (
    <CalloutCard
      scheme={theme}
      title={title}
      detail={detail}
      side={side}
      maxWidth={maxWidth}
      mirror={mirror}
      onLayout={
        mirror || !onCardLayout
          ? undefined
          : ({ nativeEvent: { layout: l } }) =>
              onCardLayout({ width: l.width, height: l.height })
      }
    />
  );

  return (
    <MarkerView
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      allowOverlap
      pointerEvents="none">
      <CalloutBody
        scheme={theme}
        side={side}
        ringSize={ringSize}
        reduced={prefersLessMotion}
        running={running}
        card={card}
      />
    </MarkerView>
  );
}

const styles = StyleSheet.create({
  layout: { alignItems: 'center', justifyContent: 'center' },
  slot: { zIndex: 1 },
  mirror: { opacity: 0 },
  card: {
    paddingHorizontal: Space[3],
    paddingVertical: Space[2],
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  detail: { flexShrink: 1 },
});
