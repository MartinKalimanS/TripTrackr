/**
 * T427 (trips and profile) - the two tabs that became nested stacks (research D4-06,
 * contract C4-11 "Navigation structure"; FR-007).
 *
 * `(tabs)/trips` and `(tabs)/profile` are directories now, each with its own `_layout`
 * and an `index`, so the URLs stay `/trips` and `/profile` while the tab gains a native
 * header. `Stack` is replaced by a recorder: what is asserted is the options each layout
 * hands the navigator, per platform, not the navigator itself (which needs a router).
 */
import { render } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { Platform } from 'react-native';

import ProfileLayout from '@/app/(tabs)/profile/_layout';
import TripsLayout from '@/app/(tabs)/trips/_layout';

jest.mock('expo-router', () => ({
  Stack: Object.assign(
    jest.fn(() => null),
    { Screen: jest.fn(() => null) },
  ),
}));

const { Stack } = jest.requireMock('expo-router') as {
  Stack: jest.Mock<null, [Record<string, unknown>]>;
};

const APP = path.resolve(__dirname, '..', '..', 'src', 'app', '(tabs)');

function screenOptions(): Record<string, unknown> {
  const props = Stack.mock.calls.at(-1)?.[0];
  return (props?.screenOptions ?? {}) as Record<string, unknown>;
}

const flat = (style: unknown) => (style ?? {}) as Record<string, unknown>;

describe('the route files (same URLs, nested stacks)', () => {
  test.each(['trips', 'profile'])(
    '(tabs)/%s is a directory with a layout and an index, not a single file',
    (name) => {
      expect(existsSync(path.join(APP, name, '_layout.tsx'))).toBe(true);
      expect(existsSync(path.join(APP, name, 'index.tsx'))).toBe(true);
      expect(existsSync(path.join(APP, `${name}.tsx`))).toBe(false);
    },
  );

  test('the tab layout still names the routes trips and profile', () => {
    const tabs = readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
    expect(tabs).toMatch(/name="trips"/);
    expect(tabs).toMatch(/name="profile"/);
  });
});

describe('<TripsLayout> - a large title on iOS, a standard header on Android', () => {
  test('on iOS: a large title named Trips (options asserted; the collapse is a device check, T408), accent controls, flat header', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<TripsLayout />);
    os.restore();

    const options = screenOptions();
    expect(options).toMatchObject({
      title: 'Trips',
      headerLargeTitleEnabled: true,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
    });
    expect(options.headerTintColor).toEqual(expect.any(String));
    expect(flat(options.headerTitleStyle).color).toEqual(expect.any(String));
    expect(flat(options.contentStyle).backgroundColor).toEqual(expect.any(String));
  });

  test('on Android: the same title, no large title, the canvas behind the header', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await render(<TripsLayout />);
    os.restore();

    const options = screenOptions();
    expect(options.title).toBe('Trips');
    expect(options.headerLargeTitleEnabled).toBeFalsy();
    expect(options.headerShadowVisible).toBe(false);
    expect(flat(options.headerStyle).backgroundColor).toEqual(expect.any(String));
  });

  test('shows the header (the tab bar has none of its own)', async () => {
    await render(<TripsLayout />);
    expect(screenOptions().headerShown).not.toBe(false);
  });

  // trips-toast.png: a toast of this stack (the header's Search too) stands 8 dp above the zone
  // the pill takes, so the layout owns the toast zone for the header and every screen below.
  test('wraps the stack in the toast zone of the pill (the header and the screen share it)', async () => {
    await render(
      <BottomTabBarHeightContext.Provider value={88}>
        <TripsLayout />
      </BottomTabBarHeightContext.Provider>,
    );
    expect(Stack).toHaveBeenCalled();
    expect(readFileSync(path.join(APP, 'trips', '_layout.tsx'), 'utf8')).toMatch(
      /<ToastZone bottom=\{tabZone\}>/,
    );
  });
});

describe('<ProfileLayout> - the identity block on iOS, a standard header on Android (T448, F13)', () => {
  test('on iOS: the options still name the screen You (the header itself is hidden), accent controls, flat, the canvas behind', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<ProfileLayout />);
    os.restore();

    const options = screenOptions();
    expect(options).toMatchObject({
      title: 'You',
      headerLargeTitleEnabled: true,
      headerLargeTitleShadowVisible: false,
      headerShadowVisible: false,
    });
    expect(options.headerTintColor).toEqual(expect.any(String));
    expect(flat(options.headerTitleStyle).color).toEqual(expect.any(String));
    expect(flat(options.contentStyle).backgroundColor).toEqual(expect.any(String));
  });

  test('on Android: the same title, no large title, the canvas behind the header', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await render(<ProfileLayout />);
    os.restore();

    const options = screenOptions();
    expect(options.title).toBe('You');
    expect(options.headerLargeTitleEnabled).toBeFalsy();
    expect(options.headerShadowVisible).toBe(false);
    expect(flat(options.headerStyle).backgroundColor).toEqual(expect.any(String));
  });

  test('iOS hides the header: the identity block replaces the large title (UI-SPEC section 8)', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<ProfileLayout />);
    os.restore();
    expect(screenOptions().headerShown).toBe(false);
    expect(screenOptions().title).toBe('You');
  });

  test('Android shows its standard "You" header', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await render(<ProfileLayout />);
    os.restore();
    expect(screenOptions().headerShown).toBe(true);
  });

  test('wraps the stack in the toast zone of the pill (the coming-soon toasts of the screen)', () => {
    expect(readFileSync(path.join(APP, 'profile', '_layout.tsx'), 'utf8')).toMatch(
      /<ToastZone bottom={tabZone}>/,
    );
  });
});
