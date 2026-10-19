/**
 * The Jest stand-in for `react-native-reanimated` that the app's own components run on
 * (feature 005, T526). `jest.setup.ts` installs it for every suite with
 * `jest.mock('react-native-reanimated', () => require('./test/mocks/reanimated-app'))`.
 *
 * Reanimated 4 drives animations through a native worklets runtime that does not exist
 * under Jest: merely IMPORTING a component that uses it throws at require time, and the
 * library's own `mock` entry point re-imports the real entry (`test/mocks/reanimated-full.ts`
 * is for the suites that load the real kit, on top of a fuller worklets double). This file
 * covers exactly what this codebase uses and no more, so it cannot quietly diverge from the
 * real API in ways tests would miss:
 *
 * - `default` is `{ View, Text, ScrollView, Image }`, the plain native components, and
 *   `createAnimatedComponent`, which answers the component itself.
 * - `FadeIn`, `FadeOut`, `Easing` and `Keyframe` are inert builders that accept the same
 *   calls (entering and exiting animations are chainable in the real API).
 * - `useSharedValue(initial)` is an object with a `value` accessor. Writing a CHANGED value
 *   re-renders the component, so a style computed from it is read again: that is the part
 *   of the UI thread a test can observe.
 * - `useAnimatedStyle(updater)` runs the updater at render and returns its result.
 * - `withSpring(to, config)` and `withTiming(to)` answer the destination at once, as if the
 *   animation had finished; `withSpring` is a mock function so a suite can read the spring
 *   it was asked for (`toHaveBeenCalledWith(to, Motion.sheetSpring)`), and a suite that
 *   expects NO spring (reduced motion) asserts it was not called.
 * - `useReducedMotion()` answers `false`; the app's own switch is `useAppearance()`.
 *
 * It animates nothing: how a spring moves is a device check. What it proves is which
 * destination was asked for, with which spring, and that no opacity was involved.
 *
 * `expo-router/testing-library` replaces Reanimated for a suite that imports it, with what it
 * finds at `react-native-reanimated/mock`. `jest.config.js` maps that path to THIS file, so a
 * router tree that renders the tab pill gets the same stand-in as every other suite (the
 * library's real mock stays reachable as `react-native-reanimated/mock.js`, for
 * `test/mocks/reanimated-full.ts`).
 */
import { useReducer, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

/** Entering and exiting animations are chainable builders; here they are inert. */
const builder = {
  duration: () => builder,
  delay: () => builder,
  springify: () => builder,
};

class Keyframe {
  duration() {
    return this;
  }
  delay() {
    return this;
  }
}

export interface SharedValue<T> {
  value: T;
}

export function useSharedValue<T>(initial: T): SharedValue<T> {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const [shared] = useState<SharedValue<T>>(() => {
    let current = initial;
    return {
      get value() {
        return current;
      },
      set value(next: T) {
        if (next === current) return;
        current = next;
        rerender();
      },
    };
  });
  return shared;
}

export function useAnimatedStyle<T>(updater: () => T): T {
  return updater();
}

export const withSpring = jest.fn((toValue: number) => toValue);

export function withTiming(toValue: number): number {
  return toValue;
}

export function useReducedMotion(): boolean {
  return false;
}

// `createAnimatedComponent` is what react-native-gesture-handler asks of it at import.
export default {
  View,
  Text,
  ScrollView,
  Image,
  createAnimatedComponent: <T>(component: T): T => component,
};
export const FadeIn = builder;
export const FadeOut = builder;
// Easing functions are consumed as opaque values by the animation driver, so returning an
// inert object preserves every call shape the code uses.
export const Easing = new Proxy({}, { get: () => () => ({}) });
export { Keyframe };
