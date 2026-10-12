/**
 * `StampIn` - the landing of a new stamp (feature 005; FR-060, FR-061, FR-073; contract C5-9;
 * research D5-14), a wrapper around a `Stamp` and nothing else.
 *
 *   <StampIn tiltDeg={spec.rotationDeg} play={earnedThisWeek && !landedThisSession}>
 *     <Stamp spec={spec} />
 *   </StampIn>
 *
 * The stamp comes down: scale 1.6 to 1 and a turn from -14 degrees to the stamp's own tilt, easing
 * out, in `Motion.stampLandMs` (200 ms, inside the 180 to 220 ms of the contract), fading in as it
 * comes. When it lands, `useHaptics().stamp()` gives the heavy thud, once. A stamp holds its own
 * tilt in its style, so the wrapper turns from `-14 - tiltDeg` to 0 and the two together go from
 * -14 degrees to the tilt: the wrapper's `transform` and the stamp's never fight.
 *
 * It is a Reanimated layout animation (`entering` with a `Keyframe`): declarative, played once on
 * mount on the UI thread, with no shared value to keep. It animates `transform` and `opacity`
 * only (FR-022). `play` is read at mount: the screen decides ("earned in the last seven days and
 * not yet landed this session", data-model section 11) and keeps its own once-per-session set.
 *
 * It does NOT move, wait or buzz when the traveller asked for reduced motion (the stamp simply
 * appears, FR-073), nor when `play` is false (it landed before). There is then no animation, no
 * timer and no haptic; the haptic hook is silent under reduced motion as well. The timer is
 * cleared if the stamp goes away before it lands, and a re-render never restarts it.
 */
import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import { useAppearance } from '@/hooks/use-appearance';
import { useHaptics } from '@/hooks/use-haptics';
import { Motion } from '@/theme';

export interface StampInProps {
  children: ReactNode;
  /** The stamp's own tilt in degrees (`spec.rotationDeg`), which the child already holds. */
  tiltDeg?: number;
  /** Whether it lands. Default true; read at mount. */
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Default `stamp-in`. */
  testID?: string;
}

/** The landing as a keyframe animation: from big, turned and unseen, to rest. */
function landing(tiltDeg: number) {
  return new Keyframe({
    from: {
      transform: [
        { scale: Motion.stampScaleFrom },
        { rotate: `${Motion.stampRotateFromDeg - tiltDeg}deg` },
      ],
      opacity: 0,
    },
    to: {
      transform: [{ scale: 1 }, { rotate: '0deg' }],
      opacity: 1,
      easing: Easing.out(Easing.cubic),
    },
  }).duration(Motion.stampLandMs);
}

export function StampIn({
  children,
  tiltDeg = 0,
  play = true,
  style,
  testID = 'stamp-in',
}: StampInProps) {
  const { prefersLessMotion } = useAppearance();
  const haptics = useHaptics();
  const animate = play && !prefersLessMotion;

  useEffect(() => {
    if (!animate) return undefined;
    const timer = setTimeout(() => haptics.stamp(), Motion.stampLandMs);
    return () => clearTimeout(timer);
  }, [animate, haptics]);

  return (
    <Animated.View
      testID={testID}
      style={style}
      entering={animate ? landing(tiltDeg) : undefined}>
      {children}
    </Animated.View>
  );
}
