/**
 * FR-016 and SC-008 — every screen renders completely and operably at the
 * platform's largest text size, with nothing clipped, overlapped, or pushed
 * off screen.
 *
 * Found on a real device (T058, Android, `adb shell settings put system
 * font_scale 1.8`): the text grew but the home screen did not adapt to it.
 * `explore.tsx` was wrapped in a ScrollView and behaved; `index.tsx` was a
 * `flex: 1` column with no scroll container at all, so once the content grew
 * past the viewport there was nowhere for it to go and the lower controls were
 * simply unreachable.
 *
 * Jest has no layout engine, so "is it clipped?" cannot be measured here — that
 * remains a device check. What CAN be asserted is the structural precondition
 * that makes clipping impossible to fix at runtime: content taller than the
 * viewport must live in a scrollable container, and no section may collapse
 * below its own content when a sibling grows.
 */
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ExploreScreen from '@/app/explore';
import HomeScreen from '@/app/index';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (c: unknown) => c },
  initSentry: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Host component names present in the rendered tree. */
function hostTypes(tree: unknown): Set<string> {
  const types = new Set<string>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const element = node as { type?: unknown; children?: unknown[] };
    if (typeof element.type === 'string') types.add(element.type);
    (element.children ?? []).forEach(walk);
  };
  walk(tree);
  return types;
}

const SCREENS = [
  { name: '<HomeScreen>', element: <HomeScreen /> },
  { name: '<ExploreScreen>', element: <ExploreScreen /> },
];

describe('large text — FR-016, SC-008', () => {
  test.each(SCREENS)(
    '$name puts its content in a scrollable container so nothing is stranded',
    async ({ element }) => {
      const view = await render(
        <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
      );
      // Without this, growing the text has nowhere to overflow to: the content
      // below the fold becomes permanently unreachable rather than merely
      // further down.
      expect(hostTypes(view.toJSON())).toContain('RCTScrollView');
    },
  );

  test('the home hero grows into spare space but never collapses below its content', async () => {
    const view = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <HomeScreen />
      </SafeAreaProvider>,
    );
    const style = StyleSheet.flatten(view.getByTestId('home-hero').props.style);

    // `flex: 1` would be flexGrow 1 / flexShrink 1 / flexBasis 0 — inside a
    // scroll container that lets the hero be squeezed to nothing when the text
    // below it grows, which hides the icon and title instead of scrolling.
    expect(style.flexGrow).toBe(1);
    expect(style.flexShrink).toBe(0);
    expect(style.flexBasis).toBe('auto');
  });
});
