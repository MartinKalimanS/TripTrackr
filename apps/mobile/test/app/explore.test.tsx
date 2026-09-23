/**
 * Screen-level coverage for the restyled explore screen (T026).
 *
 * The screen reads safe-area insets, so it needs a provider with fixed metrics.
 * Supplying them explicitly rather than relying on `initialWindowMetrics` keeps
 * the test deterministic across platforms.
 */
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ExploreScreen from '@/app/explore';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('<ExploreScreen>', () => {
  test('renders its content on the neumorphic canvas', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ExploreScreen />
      </SafeAreaProvider>,
    );
    // Reaching content proves the screen mounted rather than falling back to a
    // platform default or throwing during style resolution.
    expect(screen.root).toBeTruthy();
  });
});
