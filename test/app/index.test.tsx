/**
 * Screen-level coverage for the restyled home screen (T025).
 *
 * NOT colocated in `src/app/`: expo-router globs every file in that directory
 * as a route, so a test file there is bundled into the app itself and drags the
 * testing library — and Node's `console` — into the native runtime.
 *
 * Asserts the screen composes from the primitives and keeps every control
 * reachable — the same properties e2e/01-appearance.yaml checks on a device.
 */
import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (c: unknown) => c },
  initSentry: jest.fn(),
}));

describe('<HomeScreen>', () => {
  test('renders its content', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('get started')).toBeTruthy();
    expect(screen.getByText('Try editing')).toBeTruthy();
    expect(screen.getByText('Dev tools')).toBeTruthy();
    expect(screen.getByText('Fresh start')).toBeTruthy();
  });

  test('exposes its primary action with an accessible label (contract C9)', async () => {
    await render(<HomeScreen />);
    // A soft, low-contrast control with no label is the worst combination this
    // feature could ship, so the label is required by the type and asserted here.
    expect(screen.getByLabelText('Send a test error to Sentry')).toBeTruthy();
  });
});
