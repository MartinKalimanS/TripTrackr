/**
 * The pans of the Home sheet (feature 005, T534; contract C5-22; FR-012; research D5-03).
 *
 * Every callback here is a worklet: the sheet follows the finger on the UI thread, with no
 * JavaScript per frame, and the JS thread hears of it once, when the finger lifts
 * (`announce`, then `finish` when the spring settles; `sheet-motion.ts`).
 *
 * Two kinds of pan, one body of code:
 *
 * - A DRAG ZONE (the handle and the header) always takes the finger. Beyond `full` and below
 *   `peek` the sheet is rubber-banded.
 * - The BODY shares the finger with the list inside it. The sheet takes it when the sheet is
 *   below `full` (the list is not scrolling then: `scrollEnabled` is false), and at `full`
 *   only when the list is at its top and the finger moves DOWN. Part-way down the list, or
 *   dragging up, the finger is the list's. The decision is made again on every update, so the
 *   drag passes to the sheet in the middle of a gesture when the list reaches its top, and
 *   back to the list when the sheet is at `full` again and the finger keeps rising. The list
 *   is a Native gesture that the body pan runs simultaneously with (Gesture Handler's pattern
 *   for a scroller inside a pan; `SheetScrollable`).
 *
 * A pan activates after 10 dp of vertical travel and fails after 16 dp of horizontal, so a
 * horizontal swipe in the sheet (a chip row) wins. The sheet starts moving from where the
 * pan activated, so the slack before it is not added and the sheet does not jump.
 */
import { Gesture, type GestureType } from 'react-native-gesture-handler';
import { cancelAnimation, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { rubberBand, settleTarget } from './sheet-geometry';
import type { SheetMotion } from './sheet-motion';

/** The parts of the motion a worklet closes over: shared values, worklets and one JS callback. */
export type SheetUi = Pick<SheetMotion, 'detents' | 'visible' | 'driveTo' | 'announce'>;

const ACTIVATE_Y = 10;
const FAIL_X = 16;
/** Below this the sheet counts as at `full`. */
const AT_FULL = 0.5;

export interface PanState {
  /** The list's scroll offset, written from its `onScroll`. */
  scrollY: SharedValue<number>;
  /** 1 while the sheet owns the finger. */
  taking: SharedValue<number>;
  /** The sheet's height when it took the finger. */
  anchor: SharedValue<number>;
  /** The finger's translation when it took it. */
  origin: SharedValue<number>;
  /** The finger's translation when the pan activated. */
  startedAt: SharedValue<number>;
  /** The finger's translation at the previous update. */
  last: SharedValue<number>;
  /** 1 while the list has been at its top since the pan activated. */
  atTop: SharedValue<number>;
}

interface PanEvent {
  translationY: number;
  velocityY: number;
}

/**
 * Hands the finger to the sheet from here. This is where a spring in flight is stopped (the
 * sheet then follows the finger from where it is): a finger that goes to the LIST must leave a
 * spring up to `full` alone, or its settle never comes and the list stays switched off.
 */
function take(motion: SheetUi, state: PanState, translationY: number, from: number) {
  'worklet';
  cancelAnimation(motion.visible);
  state.taking.set(1);
  state.anchor.set(motion.visible.get());
  state.origin.set(from);
  state.last.set(translationY);
}

/** Pan activated: take the finger at once, unless the list may want it. */
function begin(
  motion: SheetUi,
  state: PanState,
  event: PanEvent,
  sharedWithList: boolean,
) {
  'worklet';
  state.startedAt.set(event.translationY);
  state.atTop.set(state.scrollY.get() <= 0 ? 1 : 0);
  state.taking.set(0);
  state.last.set(event.translationY);
  if (!sharedWithList || motion.visible.get() < motion.detents.full - AT_FULL) {
    take(motion, state, event.translationY, event.translationY);
  }
}

/** One update: follow the finger, or decide whether the list or the sheet has it. */
function follow(
  motion: SheetUi,
  state: PanState,
  event: PanEvent,
  sharedWithList: boolean,
) {
  'worklet';
  const step = event.translationY - state.last.get();
  state.last.set(event.translationY);
  if (state.taking.get() === 0) {
    if (state.scrollY.get() > 0) state.atTop.set(0);
    if (!(state.scrollY.get() <= 0 && step > 0)) return;
    const from = state.atTop.get() === 1 ? state.startedAt.get() : event.translationY;
    take(motion, state, event.translationY, from);
  }
  const raw = state.anchor.get() - (event.translationY - state.origin.get());
  if (sharedWithList && raw > motion.detents.full) {
    // At full and still rising: the finger is the list's again.
    state.taking.set(0);
    state.atTop.set(0);
    motion.visible.set(motion.detents.full);
    return;
  }
  motion.visible.set(rubberBand(raw, motion.detents));
}

/** The finger lifted (or the system took it): settle on the nearest detent. */
function release(motion: SheetUi, state: PanState, event: PanEvent) {
  'worklet';
  if (state.taking.get() === 0) return;
  state.taking.set(0);
  const velocityUp = -event.velocityY;
  const next = settleTarget(motion.visible.get(), velocityUp, motion.detents);
  scheduleOnRN(motion.announce, next);
  motion.driveTo(next, velocityUp);
}

/**
 * A pan over the sheet. `sharedWithList` is the body's: it yields to the list at the top of
 * `full`, and runs simultaneously with the list's own `scroller` gesture. The id is Gesture
 * Handler's test id, which only a test reads.
 */
export function sheetPan(
  testId: string,
  motion: SheetUi,
  state: PanState,
  sharedWithList: boolean,
  scroller?: GestureType,
) {
  const pan = Gesture.Pan()
    .withTestId(testId)
    .activeOffsetY([-ACTIVATE_Y, ACTIVATE_Y])
    .failOffsetX([-FAIL_X, FAIL_X])
    .onStart((event) => {
      'worklet';
      begin(motion, state, event, sharedWithList);
    })
    .onUpdate((event) => {
      'worklet';
      follow(motion, state, event, sharedWithList);
    })
    .onEnd((event) => {
      'worklet';
      release(motion, state, event);
    });
  return scroller === undefined ? pan : pan.simultaneousWithExternalGesture(scroller);
}
