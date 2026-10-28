/**
 * How the Home sheet moves (feature 005, T534; contract C5-22; FR-012, FR-027, FR-062;
 * research D5-03): the one shared value that is its height, the spring that settles it, and
 * the three things the JS thread is told about, each ONCE:
 *
 * - `announce(detent)`: the traveller moved the sheet (a release, a tap, an accessibility
 *   action, the back button); the parent follows by passing the same `detent` back.
 * - `finish(detent)`: the sheet came to rest. This is the one settle: the selection haptic
 *   (only when the detent CHANGED: a drag that springs back to where it began is silent, T558),
 *   the `settled` state the body's scroller reads, and `onSettle`, which the Home uses to
 *   re-fit the camera. A spring that is taken over by a finger, or by another spring, never
 *   reaches it, because Reanimated calls an interrupted animation back with `finished: false`.
 * - nothing per frame: while a finger is down only the UI thread moves the value.
 *
 * `driveTo` is a worklet: the pan calls it on the UI thread when the finger lifts, and the
 * JS thread calls it for a tap or a parent's change (a worklet is an ordinary function there).
 * Under reduced motion it assigns the height with no spring and still reports the settle
 * (FR-073); the haptic hook is silent under reduced motion by itself.
 *
 * The sheet is drawn by `translateY` of a sheet as tall as `full` (plus a skirt for the rubber
 * band), so a frame of dragging is one transform and no layout (`useSheetStyle`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useAppearance } from '@/hooks/use-appearance';
import { useHaptics } from '@/hooks/use-haptics';
import { springOf } from '@/theme';

import { stepDetent, type SheetDetent, type SheetHeights } from './sheet-geometry';

export interface SheetMotionInput {
  detents: SheetHeights;
  detent: SheetDetent;
  onDetentChange?: (detent: SheetDetent) => void;
  onSettle?: (detent: SheetDetent) => void;
}

export interface SheetMotion {
  detents: SheetHeights;
  /** The visible height of the sheet, in dp, drawn on the UI thread. */
  visible: SharedValue<number>;
  /** The detent the sheet last came to rest on: what the body's scroller reads. */
  settled: SheetDetent;
  /** UI or JS thread: spring (or jump, under reduced motion) to `next`, then settle. */
  driveTo: (next: SheetDetent, velocityUp: number) => void;
  /** UI or JS thread (through `scheduleOnRN`): the traveller chose `next`. */
  announce: (next: SheetDetent) => void;
  /** JS thread: the traveller chose `next`; tell the parent and move. */
  moveTo: (next: SheetDetent) => void;
  /** JS thread: one detent up (`1`) or down (`-1`) from where the sheet is going. */
  step: (direction: 1 | -1) => SheetDetent;
  /** JS thread: the detent the sheet is at or heading for. */
  current: () => SheetDetent;
}

/** Keeps the latest callbacks where a stable function can read them. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * What the JS thread is told, each through a stable function a worklet can hand to
 * `scheduleOnRN`: the traveller chose a detent (`announce`) and the sheet came to rest on one
 * (`finish`: the `settled` state, the haptic, `onSettle`).
 */
function useReports(input: SheetMotionInput) {
  const haptics = useHaptics();
  // The detent the sheet is at or heading for: what a parent's change is compared with.
  const headingRef = useRef<SheetDetent>(input.detent);
  const [settled, setSettled] = useState<SheetDetent>(input.detent);
  // The detent the sheet last rested on: the haptic is for a change, not for every settle.
  const restedRef = useRef<SheetDetent>(input.detent);
  const latest = useLatest({ ...input, haptics });

  const finish = useCallback(
    (next: SheetDetent) => {
      const changed = restedRef.current !== next;
      restedRef.current = next;
      setSettled(next);
      if (changed) latest.current.haptics.sheetSnap();
      latest.current.onSettle?.(next);
    },
    [latest],
  );

  const announce = useCallback(
    (next: SheetDetent) => {
      headingRef.current = next;
      latest.current.onDetentChange?.(next);
    },
    [latest],
  );

  return { settled, finish, announce, headingRef };
}

/**
 * The worklet that moves the sheet: a spring to the detent, handed the finger's velocity, that
 * reports the settle when it finishes (an interrupted one reports `finished: false` and says
 * nothing); under reduced motion (`spring === null`) a jump that reports the settle at once.
 */
function springDriver(
  detents: SheetHeights,
  visible: SharedValue<number>,
  spring: ReturnType<typeof springOf>,
  finish: (next: SheetDetent) => void,
) {
  return (next: SheetDetent, velocityUp: number) => {
    'worklet';
    const to = detents[next];
    if (spring === null) {
      cancelAnimation(visible);
      visible.set(to);
      scheduleOnRN(finish, next);
      return;
    }
    visible.set(
      withSpring(to, { ...spring, velocity: velocityUp }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finish, next);
      }),
    );
  };
}

/**
 * New heights under a mounted sheet (an inset that arrived late, a window that resized): `visible`
 * still holds the OLD height of the detent, so the sheet would sit that far from where it
 * belongs, at rest. It is re-seated on the new height of the detent it is at or heading for:
 * no spring and no report, because no detent changed. Declared before the effect that follows a
 * parent's new `detent`, so that one springs on from the re-seated height.
 */
function useReseat(
  detents: SheetHeights,
  visible: SharedValue<number>,
  headingRef: { current: SheetDetent },
) {
  const key = `${detents.peek} ${detents.half} ${detents.full}`;
  const seatedFor = useRef(key);
  useEffect(() => {
    if (seatedFor.current === key) return;
    seatedFor.current = key;
    visible.set(detents[headingRef.current]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function useSheetMotion(input: SheetMotionInput): SheetMotion {
  const { detents, detent } = input;
  const { prefersLessMotion } = useAppearance();
  const visible = useSharedValue(detents[detent]);
  const { settled, finish, announce, headingRef } = useReports(input);
  const driveTo = springDriver(
    detents,
    visible,
    springOf('sheetSpring', prefersLessMotion),
    finish,
  );
  useReseat(detents, visible, headingRef);

  // A parent that changes `detent` (a country was chosen) moves the sheet; one that is only
  // following a drag or a tap has already been announced, so nothing starts twice.
  useEffect(() => {
    if (detent === headingRef.current) return;
    headingRef.current = detent;
    driveTo(detent, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detent]);

  return {
    detents,
    visible,
    settled,
    driveTo,
    announce,
    moveTo: (next) => {
      announce(next);
      driveTo(next, 0);
    },
    step: (direction) => stepDetent(headingRef.current, direction),
    current: () => headingRef.current,
  };
}

/** The sheet's transform: its top edge is `full - visible` below where `full` would put it. */
export function useSheetStyle(motion: Pick<SheetMotion, 'detents' | 'visible'>) {
  const { detents, visible } = motion;
  return useAnimatedStyle(() => {
    return { transform: [{ translateY: detents.full - visible.get() }] };
  });
}
