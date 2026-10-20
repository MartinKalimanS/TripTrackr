/**
 * `StopStrip` - one dot per stop over a hero picture (feature 005, T540; contract C5-19;
 * FR-031; prototype `.strip`).
 *
 *   <StopStrip dots={['done', 'now', 'next']} labels={['LIS', 'SIN', 'POR']} />
 *
 * 12 dp dots joined by a 2 dp line. The line before a dot is SOLID when the traveller has
 * reached that stop (it is done or here) and DASHED when it is still ahead. A done stop is a
 * filled dot; the stop here a thick ring with a halo; the next stop a ring; a later one a
 * thinner ring. The state is the shape (filled, thick ring, thin ring) and never a colour: all of
 * it is the opaque on-photo ink, because text and marks over a picture are never an alpha white
 * (D5-10) and the picture under them carries the caption scrim. The abbreviation of each city
 * (`labels`, from the card model) sits under its dot in the eyebrow role, only while there are
 * five stops or fewer (more would collide) and never for a city this device has not cached.
 *
 * It is decoration: the card's one accessible name already says the stops, so the strip is
 * hidden from assistive technology with everything in it. No stops, nothing drawn.
 */
import { View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import type { StopDot } from '@/features/trips/trip-card-model';
import { cornerOf, withAlpha } from '@/theme';

export interface StopStripProps {
  dots: readonly StopDot[];
  /** One abbreviation per dot; an empty one draws nothing. */
  labels?: readonly string[];
}

/** The id of the strip; its parts are `-dot-<i>`, `-halo-<i>`, `-link-<i>`, `-label-<i>`. */
const STRIP_ID = 'stop-strip';

const DOT = 12;
const LINE = 2;
/** Above this many stops the abbreviations would run into each other. */
const MAX_LABELLED = 5;

const COLOR_KEYS = ['onPhoto'] as const;

/** The ring of each hollow state, in dp, and the halo of the stop that is here. */
const RING: Record<Exclude<StopDot, 'done'>, number> = { now: 3, next: 2, later: 1.5 };
const HALO = { now: 4, done: 2 } as const;
const HALO_ALPHA = { now: 0.28, done: 0.32 } as const;

/** The halo box around a dot: 16 dp, so the line meets the dot's centre at 7 dp. */
const HALO_BOX = DOT + 2 * HALO.done;

function dotStyle(state: StopDot, ink: string): ViewStyle {
  return {
    width: DOT,
    height: DOT,
    ...cornerOf('full'),
    ...(state === 'done'
      ? { backgroundColor: ink }
      : { backgroundColor: 'transparent', borderWidth: RING[state], borderColor: ink }),
  };
}

/**
 * The ring around a dot: 2 dp round a done stop, 4 dp round the one here (so it overhangs the
 * 16 dp box by 2 dp each side, taken back by a negative margin: layout is the same for all),
 * none for the rest.
 */
function haloStyle(state: StopDot, ink: string): ViewStyle {
  const width = state === 'now' ? HALO.now : state === 'done' ? HALO.done : 0;
  const overhang = Math.max(0, width - HALO.done);
  const size = HALO_BOX + 2 * overhang;
  return {
    width: size,
    height: size,
    margin: -overhang,
    alignItems: 'center',
    justifyContent: 'center',
    ...cornerOf('full'),
    ...(width > 0
      ? {
          borderWidth: width,
          borderColor: withAlpha(ink, state === 'now' ? HALO_ALPHA.now : HALO_ALPHA.done),
        }
      : null),
  };
}

function linkStyle(solid: boolean, ink: string): ViewStyle {
  return {
    position: 'absolute',
    top: (HALO_BOX - LINE) / 2,
    // From the previous dot's edge to this one's: half a column to the left, less a dot.
    left: '-50%',
    right: '50%',
    marginLeft: HALO_BOX / 2,
    marginRight: HALO_BOX / 2,
    borderTopWidth: LINE,
    borderStyle: solid ? 'solid' : 'dashed',
    borderColor: ink,
  };
}

interface StopProps {
  state: StopDot;
  index: number;
  label: string | undefined;
  ink: string;
}

function Stop({ state, index, label, ink }: StopProps) {
  const reached = state === 'done' || state === 'now';
  return (
    <View className="flex-1 items-center" style={{ minWidth: 0 }}>
      {index > 0 ? (
        <View testID={`${STRIP_ID}-link-${index}`} style={linkStyle(reached, ink)} />
      ) : null}
      <View testID={`${STRIP_ID}-halo-${index}`} style={haloStyle(state, ink)}>
        <View testID={`${STRIP_ID}-dot-${index}`} style={dotStyle(state, ink)} />
      </View>
      {label ? (
        <Text
          variant="eyebrow"
          tone="onPhoto"
          numberOfLines={1}
          testID={`${STRIP_ID}-label-${index}`}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function StopStrip({ dots, labels }: StopStripProps) {
  const { onPhoto } = useColors(COLOR_KEYS);
  if (dots.length === 0) return null;
  const named = dots.length <= MAX_LABELLED ? labels : undefined;
  return (
    <View
      testID={STRIP_ID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-start">
      {dots.map((state, index) => (
        <Stop
          key={index}
          state={state}
          index={index}
          label={named?.[index]}
          ink={onPhoto}
        />
      ))}
    </View>
  );
}
