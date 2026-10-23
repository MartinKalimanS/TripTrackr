/**
 * T562 - the appearance changes with the app open (feature 005; FR-073, FR-078, FR-079; SC-008;
 * 004 FR-028, FR-031, FR-032 "Acceptance Scenario 3.2"): a screen that is already mounted
 * follows the theme, reduced motion and reduced transparency without being remounted, without
 * losing what the traveller typed and without a React error.
 *
 * Two paths are exercised. The OS path: the real appearance store listens to
 * `AccessibilityInfo`, a change event makes it read the three signals again and every
 * subscribed screen re-renders (`OS signals`). The scope path: `AppearanceScope` (the dev
 * gallery's mechanism, which feeds the same hooks) changes the colour scheme, the flags and
 * the scale of a mounted tree (`theme`). That the phone's own settings screen delivers the
 * events is a device check (as-built note, "Device checks").
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

import LoginScreen from '@/app/(auth)/login';
import { TabBar } from '@/components/navigation/tab-bar';
import { Colors } from '@/constants/theme';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';

import { motionIn } from './motion';
import { Scoped, auditNow, installThemeAwareKit, THEMES, treeNow } from './sweep';
import { tabBarProps } from './tab-bar-props';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
const mockMutation = () => ({ mutate: jest.fn(), isPending: false, error: null });
jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutation(),
  useRegister: () => mockMutation(),
  useAppleSignIn: () => mockMutation(),
  useGoogleSignIn: () => mockMutation(),
}));
jest.mock('expo-apple-authentication', () => ({
  ...require('../mocks/expo-apple-authentication'),
  isAvailableAsync: jest.fn(async () => false),
}));
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

const hapticCalls = () =>
  [
    ExpoHaptics.impactAsync,
    ExpoHaptics.selectionAsync,
    ExpoHaptics.notificationAsync,
  ].reduce((sum, fn) => sum + (fn as jest.Mock).mock.calls.length, 0);

let errors: jest.SpyInstance;

beforeEach(() => {
  installThemeAwareKit();
  errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  __resetAppearanceStoreForTests();
  jest.restoreAllMocks();
});

const flat = (testID: string) =>
  (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<
    string,
    unknown
  >;

describe('the theme, on a mounted form (the scope)', () => {
  test('every theme repaints the canvas and keeps what was typed, with nothing remounted', async () => {
    const view = await render(
      <Scoped setup={{ theme: 'light' }}>
        <LoginScreen />
      </Scoped>,
    );
    await fireEvent.changeText(screen.getByTestId('login-email'), 'ana@example.com');
    const field = screen.getByTestId('login-email');

    for (const theme of [...THEMES, 'light'] as const) {
      await view.rerender(
        <Scoped setup={{ theme }}>
          <LoginScreen />
        </Scoped>,
      );
      expect(flat('login-screen').backgroundColor).toBe(Colors[theme].canvas);
      expect(screen.getByTestId('login-email')).toBe(field);
      expect(screen.getByTestId('login-email').props.value).toBe('ana@example.com');
      expect(auditNow({ theme, opaque: theme.endsWith('-contrast') })).toEqual([]);
    }
  });
});

describe('the tab pill, on a mounted screen (the scope)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  test('reduced transparency and increased contrast swap the blur for a solid pill and back', async () => {
    const pill = () => <TabBar {...tabBarProps()} />;
    const view = await render(<Scoped setup={{ theme: 'dark' }}>{pill()}</Scoped>);
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();

    await view.rerender(
      <Scoped setup={{ theme: 'dark', reduceTransparency: true }}>{pill()}</Scoped>,
    );
    expect(screen.queryByTestId('tab-surface-blur')).toBeNull();
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    expect(auditNow({ theme: 'dark', opaque: true })).toEqual([]);

    await view.rerender(<Scoped setup={{ theme: 'dark-contrast' }}>{pill()}</Scoped>);
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    expect(auditNow({ theme: 'dark-contrast', opaque: true })).toEqual([]);

    await view.rerender(<Scoped setup={{ theme: 'light' }}>{pill()}</Scoped>);
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();
  });

  test('reduced motion silences the haptic of the next tab press, then restores it', async () => {
    const pill = () => <TabBar {...tabBarProps()} />;
    const view = await render(<Scoped setup={{ theme: 'light' }}>{pill()}</Scoped>);
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls()).toBeGreaterThan(0);
    jest.clearAllMocks();

    await view.rerender(
      <Scoped setup={{ theme: 'light', reduceMotion: true }}>{pill()}</Scoped>,
    );
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls()).toBe(0);
    expect(motionIn(treeNow())).toEqual([]);

    await view.rerender(
      <Scoped setup={{ theme: 'light', reduceMotion: false }}>{pill()}</Scoped>,
    );
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls()).toBeGreaterThan(0);
  });
});

describe('OS signals: the accessibility settings change while the app is open', () => {
  type Listener = () => void;
  const listeners = new Map<string, Listener>();
  const settings = { motion: false, transparency: false, contrast: false };
  const removed = jest.fn();

  beforeEach(() => {
    listeners.clear();
    removed.mockClear();
    Object.assign(settings, { motion: false, transparency: false, contrast: false });
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      listener: Listener,
    ) => {
      listeners.set(event, listener);
      return { remove: removed };
    }) as never);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockImplementation(async () => settings.motion);
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockImplementation(async () => settings.transparency);
    Object.assign(AccessibilityInfo, {
      isDarkerSystemColorsEnabled: jest.fn(async () => settings.contrast),
    });
  });
  afterEach(() => {
    delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
      .isDarkerSystemColorsEnabled;
  });

  /** The traveller flips a setting: the OS tells the app, which reads all three again. */
  async function change(event: string, update: Partial<typeof settings>) {
    Object.assign(settings, update);
    await act(async () => {
      listeners.get(event)?.();
    });
  }

  test('reduced transparency, increased contrast and reduced motion each reach the mounted pill', async () => {
    await render(<TabBar {...tabBarProps()} />);
    await act(async () => undefined);
    const pill = screen.getByTestId('tab-bar');
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();
    expect([...listeners.keys()].sort()).toEqual([
      'darkerSystemColorsChanged',
      'reduceMotionChanged',
      'reduceTransparencyChanged',
    ]);

    await change('reduceTransparencyChanged', { transparency: true });
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    expect(screen.queryByTestId('tab-surface-blur')).toBeNull();

    await change('reduceTransparencyChanged', { transparency: false });
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();

    await change('darkerSystemColorsChanged', { contrast: true });
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    await change('darkerSystemColorsChanged', { contrast: false });
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();

    jest.clearAllMocks();
    await change('reduceMotionChanged', { motion: true });
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls()).toBe(0);
    await change('reduceMotionChanged', { motion: false });
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls()).toBeGreaterThan(0);

    expect(screen.getByTestId('tab-bar')).toBe(pill);
  });
});
