/**
 * T449 - the not-found screen on the Atlas primitives (FR-035, FR-030, FR-037; contract
 * C4-11 "not-found").
 *
 * Rendered through `expo-router/testing-library`, which mounts a real router over an
 * in-memory route map, so the `Link` in the screen is the real one: it hands its child
 * `href`, `role` and `onPress`, and what is asserted is that the Atlas `Button` takes them
 * and the traveller lands on the home route. NOT colocated in `src/app/`: every file there
 * is a route.
 */
import { renderRouter, screen, fireEvent } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { Text } from 'react-native';

import NotFoundScreen from '@/app/+not-found';

jest.setTimeout(60_000);

// The `Button` plays a haptic; the real module loads `expo`, which the Jest stand-in for
// `expo-constants` does not satisfy (see test/app/tab-screens.test.tsx).
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

function renderLost() {
  return renderRouter(
    {
      index: () => <Text>home-screen</Text>,
      '+not-found': NotFoundScreen,
    },
    { initialUrl: '/this/route/does/not/exist' },
  );
}

describe('<NotFoundScreen>', () => {
  test('is a designed state in plain words, on the screen id Maestro and the router know', async () => {
    await renderLost();

    expect(await screen.findByTestId('not-found-screen')).toBeTruthy();
    expect(screen.getByText('This page does not exist')).toBeTruthy();
    expect(
      screen.getByText('The link may be out of date, or the trip may have been removed.'),
    ).toBeTruthy();
  });

  test('has ONE control, the way home, named as it always was and a link to assistive technology', async () => {
    await renderLost();

    const back = await screen.findByLabelText('Back to your globe');
    // `Link asChild` hands the child `role="link"`, which wins over the button role: a
    // link, as before, and the only control on the screen.
    expect(back.props.role).toBe('link');
    expect(screen.getAllByRole('link')).toEqual([back]);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Back to your globe')).toBeTruthy();
  });

  test('the way home is the single primary control (FR-005) and takes the traveller to the home route', async () => {
    const app = renderLost();
    await app;

    const back = await screen.findByLabelText('Back to your globe');
    expect(back.props.variant).toBe('primary');
    expect(app.getPathname()).toBe('/this/route/does/not/exist');

    await fireEvent.press(back);

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/');
  });

  test('is built on the Atlas primitives: none of the retired ones, and no kit import', () => {
    const source = readFileSync(require.resolve('@/app/+not-found'), 'utf8');
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
  });
});
