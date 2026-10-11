/**
 * A finger on a React Native `Pressable`, split into its two moments (feature 004, T460;
 * FR-019, SC-005). `fireEvent.press` fires `onPress` alone and never enters the pressed
 * state, so it cannot tell a control that shows its pressed appearance at touch-down from
 * one that shows it after release. These helpers drive the responder events `Pressability`
 * listens to: after `touchDown` the host node carries the style (or render-prop state) of
 * a held press, with no timer advanced; `touchUp` releases it. Not a test file.
 */
import { fireEvent } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

/** The synthetic event `Pressability` reads (it calls `persist`, and the touch fields). */
function touchEvent() {
  return {
    nativeEvent: {
      touches: [],
      changedTouches: [],
      identifier: 1,
      pageX: 0,
      pageY: 0,
      locationX: 0,
      locationY: 0,
      timestamp: Date.now(),
      target: 1,
    },
    currentTarget: 1,
    persist: () => undefined,
  };
}

/** Puts a finger on `host`: the responder is granted and the press starts. */
export async function touchDown(host: ReactTestInstance): Promise<void> {
  await fireEvent(host, 'responderGrant', touchEvent());
}

/** Lifts the finger: the press ends (and `onPress` fires, as a tap does). */
export async function touchUp(host: ReactTestInstance): Promise<void> {
  await fireEvent(host, 'responderRelease', touchEvent());
}
