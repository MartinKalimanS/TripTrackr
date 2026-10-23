/**
 * T562 - reduced motion removes every movement (feature 005; FR-073, SC-008; UI-SPEC 2.3
 * "Motion"): the figures' count-up, the stamp landing, the shimmer, the tab capsule's spring,
 * the globe's rotation on Welcome and every haptic.
 *
 * Each component is rendered through the REAL appearance chain (an `AppearanceScope` provides
 * the flag, `useAppearance` and `useAccessibilityFlags` answer for it), once with motion
 * allowed (the control: the movement IS there) and once with reduced motion (it is gone). The
 * Home's own movements (idle spin, beacon, live pulse, sheet spring) are
 * `reduced-motion-home.test.tsx`; the existing per-component suites pin the details.
 */
import { fireEvent, screen } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { withSpring } from 'react-native-reanimated';

import WelcomeScreen from '@/app/(auth)/welcome';
import { TabBar } from '@/components/navigation/tab-bar';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Button } from '@/components/ui/button';
import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { StampIn } from '@/components/ui/stamp-in';
import { useHaptics } from '@/hooks/use-haptics';
import { Motion } from '@/theme';

import { captureIntervals, type CapturedIntervals } from '../helpers/captured-interval';
import { hostsWhere } from '../helpers/host-nodes';

import { motionIn } from './motion';
import { installThemeAwareKit, renderIn, treeNow } from './sweep';
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
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [{ loaded: true }, null, jest.fn()],
}));

const haptics = () =>
  [
    ExpoHaptics.impactAsync,
    ExpoHaptics.selectionAsync,
    ExpoHaptics.notificationAsync,
  ] as jest.Mock[];
const hapticCalls = () => haptics().reduce((sum, fn) => sum + fn.mock.calls.length, 0);

let intervals: CapturedIntervals;

beforeEach(() => {
  installThemeAwareKit();
  intervals = captureIntervals(60_000);
});
afterEach(() => jest.restoreAllMocks());

const MOTION = [
  ['allowed', false],
  ['reduced', true],
] as const;

describe('the count-up (FR-060, FR-073)', () => {
  test('motion allowed: the figure counts on a frame timer (the control)', async () => {
    await renderIn(<AnimatedNumber value={1234} testID="figure" />, { theme: 'light' });
    expect(intervals.live().length).toBeGreaterThan(0);
  });

  test('reduced motion: the final figure at once and no timer at all', async () => {
    await renderIn(<AnimatedNumber value={1234} testID="figure" />, {
      theme: 'light',
      reduceMotion: true,
    });
    expect(intervals.all).toHaveLength(0);
    expect(screen.getByTestId('figure').props.children).toBe('1,234');
  });
});

describe('the shimmer (FR-064, FR-073)', () => {
  const shimmer = () => hostsWhere((node) => node.props.variant !== undefined);

  test('motion allowed: the group shimmers for the stated duration (the control)', async () => {
    await renderIn(
      <ShimmerGroup>
        <Bone className="h-4 w-full" />
      </ShimmerGroup>,
      { theme: 'light' },
    );
    const [group] = shimmer();
    expect(group.props.variant).toBe('shimmer');
    expect(
      (group.props.animation as { shimmer: { duration: number } }).shimmer.duration,
    ).toBe(Motion.shimmerMs);
  });

  test('reduced motion: no shimmer and no fade, the group is still', async () => {
    await renderIn(
      <ShimmerGroup>
        <Bone className="h-4 w-full" />
      </ShimmerGroup>,
      { theme: 'light', reduceMotion: true },
    );
    const [group] = shimmer();
    expect(group.props.variant).toBe('none');
    expect(group.props.animation).toBe('disable-all');
  });
});

describe('the stamp landing (FR-060, FR-073)', () => {
  const landing = () =>
    (setTimeout as unknown as jest.Mock).mock.calls.filter(
      ([, ms]) => ms === Motion.stampLandMs,
    );

  beforeEach(() => {
    jest.spyOn(globalThis, 'setTimeout');
  });

  test.each(MOTION)('motion %s', async (_label, reduceMotion) => {
    await renderIn(
      <StampIn>
        <Text>stamp</Text>
      </StampIn>,
      { theme: 'light', reduceMotion },
    );
    const moving = motionIn(treeNow());
    expect(moving.length > 0).toBe(!reduceMotion);
    expect(landing().length > 0).toBe(!reduceMotion);
  });
});

describe('haptics (FR-062, FR-073)', () => {
  function EveryHaptic() {
    const feedback = useHaptics();
    useEffect(() => {
      feedback.tap();
      feedback.select();
      feedback.sheetSnap();
      feedback.tabChange();
      feedback.success();
      feedback.warning();
      feedback.error();
      feedback.stamp();
      feedback.impact('light');
      feedback.impact('heavy');
    }, [feedback]);
    return null;
  }

  test('motion allowed: the hook plays them (the control)', async () => {
    await renderIn(<EveryHaptic />, { theme: 'light' });
    expect(hapticCalls()).toBeGreaterThan(0);
  });

  test('reduced motion: not one of them plays', async () => {
    await renderIn(<EveryHaptic />, { theme: 'light', reduceMotion: true });
    expect(hapticCalls()).toBe(0);
  });

  test.each(MOTION)('a primary button press, motion %s', async (_label, reduceMotion) => {
    await renderIn(
      <Button variant="primary" accessibilityLabel="Save" onPress={jest.fn()}>
        Save
      </Button>,
      {
        theme: 'light',
        reduceMotion,
      },
    );
    await fireEvent.press(screen.getByLabelText('Save'));
    expect(hapticCalls() > 0).toBe(!reduceMotion);
  });

  test.each(MOTION)('a tab change, motion %s', async (_label, reduceMotion) => {
    await renderIn(<TabBar {...tabBarProps()} />, { theme: 'light', reduceMotion });
    await fireEvent.press(screen.getByTestId('tab-trips'));
    expect(hapticCalls() > 0).toBe(!reduceMotion);
  });
});

describe('the tab capsule spring (FR-027, FR-073)', () => {
  test('motion allowed: the capsule springs to its tab (the control)', async () => {
    await renderIn(<TabBar {...tabBarProps()} />, { theme: 'light' });
    expect(withSpring).toHaveBeenCalledWith(expect.any(Number), Motion.sheetSpring);
  });

  test('reduced motion: it jumps, there is no spring', async () => {
    await renderIn(<TabBar {...tabBarProps()} />, { theme: 'light', reduceMotion: true });
    expect(withSpring).not.toHaveBeenCalled();
  });
});

describe('Welcome: the globe is still, whatever the setting (UI-SPEC 7)', () => {
  test.each(MOTION)(
    'motion %s: no rotation, no timer, no animation',
    async (_l, reduceMotion) => {
      await renderIn(<WelcomeScreen />, { theme: 'light', reduceMotion });
      expect(motionIn(treeNow())).toEqual([]);
      expect(intervals.all).toHaveLength(0);
    },
  );
});
