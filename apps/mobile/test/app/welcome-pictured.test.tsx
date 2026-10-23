/**
 * F12 - Welcome as pictured (`screens/core/welcome.png`, `welcome-dark.png`; UI-SPEC 7;
 * owner decision Q-11): the sky, a static composed globe with the coral countries and arcs,
 * the FIRST STAMP stamp, the wordmark row, a 28 dp sheet (padding 24 20 34) with the eyebrow,
 * the existing tagline as the headline with ONE nested accent word, the lede, THREE 52 dp
 * buttons (Apple's own button on iOS only, Google, email) and the legal line with real links; plus the
 * quiet "Already have an account? Sign in" link the picture does not show.
 *
 * Jest renders no styles: classes, props and the style objects are what is asserted. How the
 * composition looks in four themes and at both text scales is a device check
 * (`reference/as-built/f12-auth.md`).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Linking, Platform, StyleSheet } from 'react-native';

import WelcomeScreen from '@/app/(auth)/welcome';
import { LEGAL_URLS } from '@/constants/legal-urls';
import { MinTouchTarget } from '@/constants/theme';
import { GoogleButton } from '@/theme/brand-artwork';

import { appearance, appearanceOf } from '../helpers/appearance';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
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

const mockPromptAsync = jest.fn();
let mockGoogleResponse: {
  type: string;
  params: Record<string, string>;
  error?: Error;
} | null = null;
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, mockGoogleResponse, mockPromptAsync],
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

const isAvailable = AppleAuthentication.isAvailableAsync as jest.Mock;
const signInAsync = AppleAuthentication.signInAsync as jest.Mock;
const hidden = { includeHiddenElements: true };

const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const resting = (node: { props: { style?: unknown } }) =>
  flat(
    typeof node.props.style === 'function'
      ? (node.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
      : node.props.style,
  );

const buttonIds = () =>
  screen.getAllByRole('button').map((button) => button.props.testID as string);

function configureGoogle() {
  const key =
    Platform.OS === 'ios'
      ? 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'
      : 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID';
  process.env[key] = 'client-id';
}

beforeEach(() => {
  mockPush.mockReset();
  mockPromptAsync.mockReset();
  mockGoogleResponse = null;
  for (const mutation of Object.values(mockMutations)) {
    mutation.mutate.mockReset();
    mutation.isPending = false;
    mutation.error = null;
  }
  delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  isAvailable.mockResolvedValue(true);
  signInAsync.mockReset();
  useAppearance.mockReturnValue(appearance());
});

describe('Welcome - the words', () => {
  test('the eyebrow, the app’s own tagline as the headline, the lede and the wordmark', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('Your travel passport')).toBeTruthy();
    expect(screen.getByText('Plan it. Live it. Share what you want.')).toBeTruthy();
    expect(
      screen.getByText(
        'Trips, photos and notes on one globe, even offline. Expenses stay only yours.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('TripTrackr')).toBeTruthy();
    expect(screen.getByTestId('welcome-mark', hidden)).toBeTruthy();
  });

  test('the headline carries exactly ONE nested serif accent word and its text is unchanged', async () => {
    await render(<WelcomeScreen />);
    const headline = screen.getByText('Plan it. Live it. Share what you want.');
    const accents = within(headline).getAllByText(/^\w+$/);
    expect(accents).toHaveLength(1);
    expect(classesOf(accents[0]).join(' ')).toMatch(/font-accent|instrument|serif/i);
  });

  test('the headline is the screen’s one heading', async () => {
    await render(<WelcomeScreen />);
    const headings = screen.getAllByRole('header');
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Plan it. Live it. Share what you want.');
  });
});

describe('Welcome - the three buttons (owner decision Q-11)', () => {
  test('iOS: Apple, Google, then email, in that order, and nothing else is a button but the link', async () => {
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');
    expect(buttonIds()).toEqual([
      'apple-sign-in',
      'google-sign-in-unavailable',
      'welcome-create-account',
      'welcome-sign-in',
    ]);
  });

  test('iOS: the three are the same 52 dp size, the same pill and the same width', async () => {
    configureGoogle();
    await render(<WelcomeScreen />);
    const apple = await screen.findByTestId('apple-sign-in');
    const google = screen.getByTestId('google-sign-in');
    const email = screen.getByTestId('welcome-create-account');
    for (const button of [google, email]) {
      expect(resting(button).minHeight).toBeGreaterThanOrEqual(52);
      expect(resting(button).borderRadius).toBeGreaterThanOrEqual(999);
      expect(classesOf(button)).toContain('self-stretch');
    }
    // Apple's own button is a frame of exactly that minimum, a capsule, across the column.
    expect(resting(apple).height).toBe(52);
    expect(apple.props.cornerRadius).toBe(26);
    expect(resting(apple).alignSelf).toBe('stretch');
    expect(resting(apple).height).toBe(resting(email).minHeight);
    expect(resting(apple).height).toBe(resting(google).minHeight);
  });

  test.each([1, 1.15, 1.5, 2])(
    'iOS at text scale %s: Apple is as tall and as wide as the Google button beside it',
    async (fontScale) => {
      configureGoogle();
      useAppearance.mockReturnValue(appearance({ fontScale }));
      await render(<WelcomeScreen />);
      const apple = await screen.findByTestId('apple-sign-in');
      const google = screen.getByTestId('google-sign-in');
      expect(resting(apple).height).toBe(resting(google).minHeight);
      expect(resting(apple).height).toBe(Math.max(52, MinTouchTarget * fontScale));
      expect(apple.props.cornerRadius).toBe((resting(apple).height as number) / 2);
      expect(resting(apple).alignSelf).toBe('stretch');
      expect(classesOf(google)).toContain('self-stretch');
    },
  );

  test('Apple is the system "Continue with Apple" button, black (white in the dark): Apple draws its logo and title', async () => {
    const { rerender } = await render(<WelcomeScreen />);
    const apple = await screen.findByTestId('apple-sign-in');
    expect(apple.props.buttonType).toBe(
      AppleAuthentication.AppleAuthenticationButtonType.CONTINUE,
    );
    expect(apple.props.buttonStyle).toBe(
      AppleAuthentication.AppleAuthenticationButtonStyle.BLACK,
    );
    expect(apple.props.accessibilityLabel).toBe('Continue with Apple');
    expect(resting(apple)).not.toHaveProperty('backgroundColor');
    expect(resting(apple)).not.toHaveProperty('borderRadius');

    useAppearance.mockReturnValue(appearanceOf('dark'));
    await rerender(<WelcomeScreen />);
    expect(screen.getByTestId('apple-sign-in').props.buttonStyle).toBe(
      AppleAuthentication.AppleAuthenticationButtonStyle.WHITE,
    );
  });

  test.each([
    ['light', 'BLACK'],
    ['light-contrast', 'BLACK'],
    ['dark', 'WHITE'],
    ['dark-contrast', 'WHITE'],
  ] as const)(
    'in the %s theme the button is Apple’s %s style: it stays visible and needs no outline',
    async (themeName, style) => {
      useAppearance.mockReturnValue(appearanceOf(themeName));
      await render(<WelcomeScreen />);
      const apple = await screen.findByTestId('apple-sign-in');
      expect(apple.props.buttonStyle).toBe(
        AppleAuthentication.AppleAuthenticationButtonStyle[style],
      );
    },
  );

  test('Google is its own light button with its four-colour G, email is cream with an envelope', async () => {
    configureGoogle();
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');

    const google = screen.getByTestId('google-sign-in');
    expect(classesOf(google)).toContain('border');
    expect(resting(google).backgroundColor).toBe(GoogleButton.light.fill);
    expect(resting(google).borderColor).toBe(GoogleButton.light.border);
    expect(within(google).getAllByTestId('svg-Path', hidden)).toHaveLength(4);

    const email = screen.getByTestId('welcome-create-account');
    expect(classesOf(email)).toContain('bg-surface-secondary');
    expect(within(email).getByText('Continue with email')).toBeTruthy();
    expect(email.props.accessibilityLabel).toBe('Continue with email');
  });

  test('Android: the Apple button is not drawn and is never asked about; Google and email remain', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await render(<WelcomeScreen />);
      expect(buttonIds()).toEqual([
        expect.stringMatching(/^google-sign-in/),
        'welcome-create-account',
        'welcome-sign-in',
      ]);
      expect(screen.queryByLabelText(/Apple/)).toBeNull();
      expect(isAvailable).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test('Apple starts the same flow as the login screen: the sheet, then the same mutation with the same input', async () => {
    signInAsync.mockResolvedValue({
      identityToken: 'apple-token',
      fullName: { givenName: 'Ana', familyName: 'Lopez' },
    });
    await render(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('apple-sign-in'));
    await screen.findByTestId('apple-sign-in');
    expect(signInAsync).toHaveBeenCalledTimes(1);
    expect(mockMutations.apple.mutate).toHaveBeenCalledWith({
      identityToken: 'apple-token',
      displayName: 'Ana Lopez',
    });
  });

  test('Google starts the same flow as the login screen: the prompt, then the same mutation with the id_token', async () => {
    configureGoogle();
    const { rerender } = await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('google-sign-in'));
    expect(mockPromptAsync).toHaveBeenCalledTimes(1);

    mockGoogleResponse = { type: 'success', params: { id_token: 'google-token' } };
    await rerender(<WelcomeScreen />);
    expect(mockMutations.google.mutate).toHaveBeenCalledWith('google-token');
  });

  test('a provider failure or refusal is said inline, in words, as an alert, on Welcome', async () => {
    mockMutations.google.error = new Error('SQLSTATE secret');
    await render(<WelcomeScreen />);
    const error = screen.getByTestId('social-sign-in-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText(/SQLSTATE/)).toBeNull();
  });

  test('a cancelled Apple sheet says nothing', async () => {
    signInAsync.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }),
    );
    await render(<WelcomeScreen />);
    await fireEvent.press(await screen.findByTestId('apple-sign-in'));
    expect(screen.queryByTestId('social-sign-in-error')).toBeNull();
    expect(mockMutations.apple.mutate).not.toHaveBeenCalled();
  });

  test('while one provider signs in the others wait, and the busy one says so', async () => {
    configureGoogle();
    mockMutations.apple.isPending = true;
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');
    expect(screen.getByTestId('apple-sign-in-frame').props).toMatchObject({
      accessibilityLabel: 'Continue with Apple',
      accessibilityState: { busy: true, disabled: true },
      pointerEvents: 'none',
    });
    expect(screen.getByText('Signing in with Apple…')).toBeTruthy();
    expect(screen.getByTestId('google-sign-in').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  test('an unavailable Apple draws nothing, not even a disabled copy of its logo; the sentence says so', async () => {
    isAvailable.mockResolvedValue(false);
    await render(<WelcomeScreen />);
    expect(
      await screen.findByText('Google and Apple sign-in are coming soon.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    expect(screen.queryByTestId('apple-sign-in-unavailable')).toBeNull();
    expect(screen.queryByLabelText(/Apple/)).toBeNull();
    expect(buttonIds()).toEqual([
      'google-sign-in-unavailable',
      'welcome-create-account',
      'welcome-sign-in',
    ]);
  });

  test('none of the three is the coral primary: Welcome has no Button primary', async () => {
    await render(<WelcomeScreen />);
    await screen.findByTestId('apple-sign-in');
    for (const button of screen.getAllByRole('button')) {
      expect(button.props.variant).not.toBe('primary');
    }
  });
});

describe('Welcome - the ids, names and routes the flows rely on', () => {
  test('every id resolves', async () => {
    await render(<WelcomeScreen />);
    for (const id of [
      'welcome-screen',
      'welcome-hero',
      'welcome-actions',
      'welcome-create-account',
      'welcome-sign-in',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    const actions = screen.getByTestId('welcome-actions');
    expect(within(actions).getByTestId('welcome-create-account')).toBeTruthy();
    expect(within(actions).getByTestId('welcome-sign-in')).toBeTruthy();
  });

  test('"Continue with email" goes to Create account and says nothing in the route', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('welcome-create-account'));
    expect(mockPush.mock.calls).toEqual([['/register']]);
  });

  test('"Already have an account? Sign in": a quiet text link named Sign in, id welcome-sign-in, to Login', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByText('Already have an account?')).toBeTruthy();
    const link = screen.getByTestId('welcome-sign-in');
    expect(link.props.accessibilityLabel).toBe('Sign in');
    expect(within(link).getByText('Sign in')).toBeTruthy();
    expect(screen.getByLabelText('Sign in')).toBe(link);
    // Quiet: a text button, not a pill.
    expect(link.props.variant).toBe('ghost');
    await fireEvent.press(link);
    expect(mockPush.mock.calls).toEqual([['/login']]);
  });

  test('the link row wraps instead of clipping at the largest text size', async () => {
    await render(<WelcomeScreen />);
    expect(classesOf(screen.getByTestId('welcome-sign-in-row'))).toEqual(
      expect.arrayContaining(['flex-row', 'flex-wrap']),
    );
  });
});

describe('Welcome - the legal line', () => {
  test('says "By continuing you accept the Terms and Privacy Policy." with real links', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-legal')).toHaveTextContent(
      'By continuing you accept the Terms and Privacy Policy.',
    );
    await fireEvent.press(screen.getByTestId('legal-terms-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.terms);
    await fireEvent.press(screen.getByTestId('legal-privacy-link'));
    expect(openURL).toHaveBeenLastCalledWith(LEGAL_URLS.privacy);
    openURL.mockRestore();
  });
});

describe('Welcome - the composition', () => {
  test('the sky is the backdrop, then the globe, the stamp and the wordmark row over it', async () => {
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('scrim-sky', hidden)).toBeTruthy();
    expect(screen.getByTestId('welcome-globe', hidden)).toBeTruthy();
    const hero = screen.getByTestId('welcome-hero');
    expect(within(hero).getByTestId('welcome-stamp', hidden)).toBeTruthy();
    expect(within(hero).getByText('TripTrackr')).toBeTruthy();
  });

  test('the globe is decoration: hidden, touch-less, in the GlobeColors of the theme', async () => {
    await render(<WelcomeScreen />);
    const globe = screen.getByTestId('welcome-globe', hidden);
    expect(globe.props.pointerEvents).toBe('none');
    expect(globe.props.accessibilityElementsHidden).toBe(true);
    expect(globe.props.importantForAccessibility).toBe('no-hide-descendants');
    const fills = within(globe)
      .getAllByTestId('svg-Path', hidden)
      .map((path) => path.props.fill);
    // The land, then the coral countries: the visited fill token of the light globe.
    expect(fills.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(
      within(globe).getAllByTestId('svg-Path', hidden).length,
    ).toBeGreaterThanOrEqual(7);
  });

  test('the stamp is the decorative FIRST STAMP: hidden, with the code TT', async () => {
    await render(<WelcomeScreen />);
    const stamp = screen.getByTestId('welcome-stamp', hidden);
    expect(stamp.props.accessibilityElementsHidden).toBe(true);
    expect(within(stamp).getAllByText(/FIRST STAMP|TT/, hidden).length).toBeGreaterThan(
      0,
    );
  });

  test('the sheet is 28 dp at the top, padded 24 20 and the home-indicator inset, over the surface', async () => {
    await render(<WelcomeScreen />);
    const sheet = flat(screen.getByTestId('welcome-sheet').props.style);
    expect(sheet.borderTopLeftRadius).toBe(28);
    expect(sheet.borderTopRightRadius).toBe(28);
    expect(sheet.paddingTop).toBe(24);
    expect(sheet.paddingHorizontal).toBe(20);
    expect(sheet.paddingBottom).toBeGreaterThanOrEqual(24);
  });

  test('the hero takes the spare room and the content scrolls at the largest text size (FR-029)', async () => {
    useAppearance.mockReturnValue(appearance({ fontScale: 2 }));
    await render(<WelcomeScreen />);
    const scroller = screen.toJSON() as { children: { type: string }[] };
    expect(JSON.stringify(scroller)).toContain('RCTScrollView');
    const hero = screen.getByTestId('welcome-hero');
    expect(classesOf(hero)).toEqual(expect.arrayContaining(['grow', 'shrink-0']));
    expect(flat(hero.props.style).minHeight).toBeGreaterThan(0);
    // Every button is still in the tree, reachable by scrolling.
    expect(screen.getByTestId('welcome-create-account')).toBeTruthy();
    expect(screen.getByTestId('welcome-sign-in')).toBeTruthy();
  });

  test('at the largest text sizes the decoration yields: no stamp, a shorter hero, every button still there', async () => {
    useAppearance.mockReturnValue(appearance());
    const { rerender } = await render(<WelcomeScreen />);
    const roomy = flat(screen.getByTestId('welcome-hero').props.style)
      .minHeight as number;
    expect(screen.getByTestId('welcome-stamp', hidden)).toBeTruthy();

    useAppearance.mockReturnValue(appearance({ fontScale: 1.3 }));
    await rerender(<WelcomeScreen />);
    expect(screen.queryByTestId('welcome-stamp', hidden)).toBeNull();
    expect(flat(screen.getByTestId('welcome-hero').props.style).minHeight).toBeLessThan(
      roomy,
    );
    expect(screen.getByText('TripTrackr')).toBeTruthy();
    expect(screen.getByTestId('welcome-globe', hidden)).toBeTruthy();
    for (const id of ['welcome-create-account', 'welcome-sign-in']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
  });

  test('the globe is a still frame: no timer, no frame loop, with or without reduced motion', async () => {
    for (const prefersLessMotion of [false, true]) {
      useAppearance.mockReturnValue(appearance({ prefersLessMotion }));
      const interval = jest.spyOn(global, 'setInterval');
      const raf = jest.spyOn(global, 'requestAnimationFrame');
      const view = await render(<WelcomeScreen />);
      const globe = screen.getByTestId('welcome-globe', hidden);
      expect(globe).toBeTruthy();
      expect(interval).not.toHaveBeenCalled();
      expect(raf).not.toHaveBeenCalled();
      await view.unmount();
      interval.mockRestore();
      raf.mockRestore();
    }
  });

  test('dark: the same composition draws from the dark globe tokens', async () => {
    useAppearance.mockReturnValue(appearanceOf('dark'));
    await render(<WelcomeScreen />);
    expect(screen.getByTestId('welcome-globe', hidden)).toBeTruthy();
    expect(screen.getByTestId('scrim-sky', hidden)).toBeTruthy();
  });
});
