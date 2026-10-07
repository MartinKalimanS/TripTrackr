/**
 * A fuller `react-native-reanimated` double for the suites that load the REAL kit
 * (`test/ui-kit/real-render.test.tsx`).
 *
 * `jest.setup.ts` keeps the minimal stand-in the app's own code needs (`FadeIn`,
 * `Easing`, `Keyframe`). The kit uses the whole hook surface (`useSharedValue`,
 * `useAnimatedStyle`, `withTiming`, ...), which the library's own `mock` entry point
 * provides on top of the worklets double in `./worklets`. That entry point has no
 * `useReducedMotion`, which the kit's provider calls on every render, so it is added
 * here, answering "motion is allowed" (the app's own switch is the kit's
 * `animation: 'disable-all'`).
 */
const Reanimated = jest.requireActual('react-native-reanimated/mock');

module.exports = {
  ...Reanimated,
  default: Reanimated.default,
  useReducedMotion: () => false,
};
