/**
 * T561 - the text-scale sweep, part two: Welcome, Sign in and Create account (feature 005;
 * FR-074, SC-007; UI-SPEC 7; `as-built/f12-auth.md`). Each screen is rendered at a font scale
 * of 1, 1.15, 1.5 and 2. What is asserted is what keeps every control reachable when the text
 * is large:
 *
 * - Welcome: the content is a scroller with the three buttons (Apple, Google, email) and the
 *   "Sign in" link inside it, in order; from a text scale of 1.3 the decoration yields (no stamp,
 *   a hero as short as the wordmark row) and the hero never shrinks below that; the sheet has
 *   no fixed height; every pill grows with the text (a minimum, never a height).
 * - Sign in and Create account: a keyboard-aware scroller holds the fields and the actions, a
 *   field is at least as tall as the text scales it, and nothing that holds text pins a height.
 *
 * Whether the three buttons can be reached by a thumb at the largest size, and that the Maestro
 * flows can tap them, is the device check in `as-built/f14-scale.md`; `e2e/01-appearance.yaml`
 * scrolls to each before it asserts or taps.
 */
import { render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import LoginScreen from '@/app/(auth)/login';
import RegisterScreen from '@/app/(auth)/register';
import WelcomeScreen from '@/app/(auth)/welcome';
import { PILL_MIN_HEIGHT } from '@/components/auth/pill-button';
import { fieldMinHeight } from '@/components/ui/field';
import { MinTouchTarget } from '@/constants/theme';

import { appearance } from '../helpers/appearance';
import { classesOf, hostsWhere, scrollers, type HostNode } from '../helpers/host-nodes';
import {
  TEXT_SCALES,
  fixedHeightTextContainers,
  phoneAtFontScale,
  styleOf,
} from '../helpers/text-scale';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

type MutationStub = { mutate: jest.Mock; isPending: boolean; error: unknown };
const stub = (): MutationStub => ({ mutate: jest.fn(), isPending: false, error: null });
const mockMutations = { apple: stub(), google: stub(), login: stub(), register: stub() };
jest.mock('@/features/auth/use-session', () => ({
  useLogin: () => mockMutations.login,
  useRegister: () => mockMutations.register,
  useAppleSignIn: () => mockMutations.apple,
  useGoogleSignIn: () => mockMutations.google,
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockIonicons({ name }: { name: string }) {
    return <Text testID={`icon-${name}`}>{name}</Text>;
  };
});
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));
jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const { View, Text } = require('react-native') as typeof import('react-native');
  const standIn = (kind: string, Host: React.ElementType = View) => {
    const StandIn = ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(Host, { testID: `svg-${kind}`, ...props }, children);
    StandIn.displayName = kind;
    return StandIn;
  };
  const Svg = standIn('Svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Defs: standIn('Defs'),
    ClipPath: standIn('ClipPath'),
    RadialGradient: standIn('RadialGradient'),
    Stop: standIn('Stop'),
    G: standIn('G'),
    Mask: standIn('Mask'),
    Path: standIn('Path'),
    Circle: standIn('Circle'),
    Rect: standIn('Rect'),
    Line: standIn('Line'),
    Polygon: standIn('Polygon'),
    Ellipse: standIn('Ellipse'),
    Text: standIn('Text', Text),
    TextPath: standIn('TextPath', Text),
  };
});
jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const hidden = { includeHiddenElements: true };

/** The stamp is a picture of letters painted by the SVG: they do not scale and it is decorative. */
const ART = [/^welcome-stamp-art$/];

/** Every host node below the scroller, outermost first (a test instance cannot be searched here). */
const inScroller = (match: (node: HostNode) => boolean) =>
  hostsWhere(match, scrollers()[0] as unknown as HostNode);
const withId = (testID: string) => (node: HostNode) => node.props.testID === testID;

/** The decoration yields from this text scale (`welcome.tsx`, FR-029). */
const DECORATION_YIELDS_AT = 1.3;

beforeEach(() => {
  Platform.OS = 'ios';
  for (const mutation of Object.values(mockMutations)) mutation.mutate.mockReset();
});
afterEach(() => jest.restoreAllMocks());

function atScale(fontScale: number) {
  phoneAtFontScale(fontScale);
  useAppearance.mockReturnValue(appearance({ fontScale }));
}

describe.each(TEXT_SCALES)('Welcome at a font scale of %s', (scale) => {
  beforeEach(() => atScale(scale));

  test('is one scroller that holds the three buttons and the Sign in link, in order', async () => {
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');

    const [scroller, ...others] = scrollers();
    expect(others).toEqual([]);
    expect(scroller.props.keyboardShouldPersistTaps).toBe('handled');
    const order = inScroller(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.testID === 'string',
    ).map((button) => button.props.testID);
    expect(order).toEqual([
      'apple-sign-in',
      'google-sign-in-unavailable',
      'welcome-create-account',
      'welcome-sign-in',
    ]);
  });

  test('the stamp is drawn below 1.3 and dropped from it; the hero never shrinks below the wordmark row', async () => {
    await render(<WelcomeScreen />);
    const decorated = scale < DECORATION_YIELDS_AT;
    expect(screen.queryByTestId('welcome-stamp', hidden) !== null).toBe(decorated);
    expect(screen.getByText('TripTrackr')).toBeOnTheScreen();

    const hero = screen.getByTestId('welcome-hero');
    expect(classesOf(hero)).toEqual(expect.arrayContaining(['grow', 'shrink-0']));
    expect(styleOf(hero).height).toBeUndefined();
    expect(styleOf(hero).minHeight).toBe(decorated ? 180 : 54);
  });

  test('the buttons are minimums that grow with the text, the sheet and the legal line have no height', async () => {
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');

    const pill = styleOf(screen.getByTestId('google-sign-in-unavailable'));
    expect(pill.height).toBeUndefined();
    expect(pill.minHeight).toBe(
      Math.max(PILL_MIN_HEIGHT, MinTouchTarget * Math.max(1, scale)),
    );
    // Apple's own button draws its title inside the frame it is given (the system sizes the
    // title to the frame, so no app text can clip); the frame is the same minimum, grown by
    // the text size, and holds no text of the app's.
    const apple = screen.getByTestId('apple-sign-in');
    expect(styleOf(apple).height).toBe(pill.minHeight);
    expect(apple.children).toHaveLength(0);
    const email = styleOf(screen.getByTestId('welcome-create-account'));
    expect(email.minHeight).toBe(
      Math.max(PILL_MIN_HEIGHT, MinTouchTarget * Math.max(1, scale)),
    );
    expect(styleOf(screen.getByTestId('welcome-sheet')).height).toBeUndefined();
    expect(fixedHeightTextContainers(undefined, ART)).toEqual([]);
  });

  test('the content grows into spare room at the bottom and scrolls when it does not fit', async () => {
    await render(<WelcomeScreen />);
    const [scroller] = scrollers();
    const content = styleOf({
      props: { style: scroller.props.contentContainerStyle },
    });
    expect(content.flexGrow).toBe(1);
    expect(content.justifyContent).toBe('flex-end');
  });
});

describe.each([
  ['Sign in', LoginScreen, 'login-screen', 'login-submit', ['login-email']],
  [
    'Create account',
    RegisterScreen,
    'register-screen',
    'register-submit',
    ['register-display-name', 'register-email', 'register-password'],
  ],
] as const)('%s', (_name, Screen, screenId, submitId, fieldIds) => {
  describe.each(TEXT_SCALES)('at a font scale of %s', (scale) => {
    beforeEach(() => atScale(scale));

    test('a scroller holds the fields and the action, and nothing that holds text has a height', async () => {
      await render(<Screen />);
      expect(screen.getByTestId(screenId)).toBeOnTheScreen();

      const [scroller] = scrollers();
      expect(scroller).toBeDefined();
      expect(inScroller(withId(submitId))).toHaveLength(1);
      for (const id of fieldIds) expect(inScroller(withId(id))).toHaveLength(1);
      expect(fixedHeightTextContainers()).toEqual([]);
    });

    test('a field is at least as tall as the text scales it, and the action is a minimum', async () => {
      await render(<Screen />);
      for (const id of fieldIds) {
        const field = styleOf(screen.getByTestId(id));
        expect(field.height).toBeUndefined();
        expect(field.minHeight).toBeGreaterThanOrEqual(fieldMinHeight(scale) * 0.99);
      }
      const submit = styleOf(screen.getByTestId(submitId));
      expect(submit.height).toBeUndefined();
      expect(submit.minHeight).toBeGreaterThanOrEqual(56);
    });
  });
});
