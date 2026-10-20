/**
 * The Jest stand-in for `expo-glass-effect` (feature 005, research D5-05, D5-19).
 *
 * `jest.setup.ts` installs it for every suite with
 * `jest.mock('expo-glass-effect', () => require('./test/mocks/expo-glass-effect'))`.
 * The real module draws a `UIGlassEffectView` on iOS 26 and is a plain `View` elsewhere
 * (its non-iOS files); a native view manager does not exist under Jest, so the stand-in
 * is the plain `View` for every platform, carrying the glass props (`glassEffectStyle`,
 * `tintColor`, `isInteractive`, `colorScheme`) so a suite can read what the tab pill
 * asked of the glass. `test/mocks/native-batch.test.tsx` pins the shape.
 *
 * What it does, and does not do:
 * - `GlassView` and `GlassContainer` render `children` and forward EVERY prop, `ref`
 *   included (React 19 passes it as a prop), with a default `testID` of `glass-view`
 *   and `glass-container`; a caller's `testID` replaces it.
 * - `isLiquidGlassAvailable` and `isGlassEffectAPIAvailable` answer `false`, which is
 *   what Android and an iPhone before iOS 26 answer: the fallbacks (blur, solid) are the
 *   default under test. A suite for the glass branch opts in with
 *   `mockReturnValue(true)` or `mockReturnValueOnce(true)`.
 * - It does NOT draw glass, animate a style change or tint anything: that is the
 *   device check V4 (tasks T510). The real module's known trap (opacity 0 on a
 *   `GlassView` or an ancestor makes the glass vanish, expo/expo#41024) cannot be seen
 *   here; the pill is hidden with `translateY` and a test pins that style instead.
 */
import { createElement, type ComponentType } from 'react';
import { View } from 'react-native';

type StandInProps = Record<string, unknown>;
const Host = View as unknown as ComponentType<StandInProps>;

export function GlassView({ testID, ...props }: StandInProps) {
  return createElement(Host, { ...props, testID: testID ?? 'glass-view' });
}

export function GlassContainer({ testID, ...props }: StandInProps) {
  return createElement(Host, { ...props, testID: testID ?? 'glass-container' });
}

export const isLiquidGlassAvailable = jest.fn(() => false);
export const isGlassEffectAPIAvailable = jest.fn(() => false);
