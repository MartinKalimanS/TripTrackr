/**
 * T522 - the skeletons, the banner and the toast ADAPTERS over the REAL `heroui-native`
 * under Jest (research D4-13), once.
 *
 * Every adapter suite sees the shared stand-in (test/mocks/heroui-native.tsx). This one puts
 * the kit's own SkeletonGroup, Skeleton, Spinner, Button and Toast under the adapters, so what
 * the stand-ins claim is checked against the real thing: a Bone needs the kit's group (and
 * works in one), our classes follow the kit's, the toast root is a polite `status` that
 * carries the stack props we hand it, and its action is the kit's button. How a class LOOKS
 * and whether the shimmer runs is Uniwind's and Reanimated's, on a device.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { anyGlyph, glyphNamesIn } from '../helpers/icons';
import { Banner } from '@/components/ui/banner';
import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { TripDetailSkeleton, TripListSkeleton } from '@/components/ui/screen-skeletons';
import { Toast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const mockChain = (): unknown =>
    new Proxy(() => undefined, { get: () => mockChain, apply: () => mockChain() });
  return {
    GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
    // The kit builds its swipe gesture with a chain of calls; any chain will do here.
    Gesture: { Pan: () => mockChain() },
    GestureHandlerRootView: View,
  };
});
jest.mock('@/hooks/use-appearance');
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

const CONFIG = { devInfo: { stylingPrinciples: false } };
const hidden = { includeHiddenElements: true };
const tokens = (className: unknown) =>
  String(className ?? '')
    .split(/\s+/)
    .filter(Boolean);

function renderKit(ui: React.ReactElement) {
  return render(<HeroUINativeProvider config={CONFIG}>{ui}</HeroUINativeProvider>);
}

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
});

describe('skeletons over the real kit', () => {
  test('a Bone inside a ShimmerGroup is the kit\u2019s skeleton, with our fill after the kit\u2019s', async () => {
    await renderKit(
      <ShimmerGroup>
        <Bone testID="bone" className="h-4 w-1/2 rounded-lg" />
      </ShimmerGroup>,
    );
    const classes = tokens(screen.getByTestId('bone').props.className);
    expect(classes).toEqual(
      expect.arrayContaining(['skeleton__root', 'bg-skeleton', 'h-4', 'rounded-lg']),
    );
    expect(classes.indexOf('bg-skeleton')).toBeGreaterThan(
      classes.indexOf('skeleton__root'),
    );
  });

  test('the kit refuses a Bone outside a group, which is why every skeleton has one at its root', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderKit(<Bone className="h-4" />)).rejects.toThrow(/SkeletonGroup/);
    error.mockRestore();
  });

  test('the trip list skeleton is one progressbar over the real kit, shapes hidden', async () => {
    await renderKit(<TripListSkeleton />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    const region = screen.getByTestId('trips-skeleton');
    expect(region.props.accessibilityLabel).toBe('Loading trips');
    expect(screen.queryByTestId(anyGlyph)).toBeNull();
    expect(glyphNamesIn()).toEqual(['map-pin']);
  });

  test('the trip detail skeleton renders its tiles and stops over the real kit', async () => {
    await renderKit(<TripDetailSkeleton />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByTestId('trip-skeleton')).toBeTruthy();
  });
});

describe('banner over the real kit', () => {
  test('the action is a button beside an alert, and presses', async () => {
    const onPress = jest.fn();
    await renderKit(
      <Banner
        tone="error"
        message="Couldn't sync 2 changes."
        action={{ label: 'Retry', onPress, testID: 'retry' }}
        testID="banner"
      />,
    );
    expect(screen.getByRole('alert')).toBe(screen.getByTestId('banner-message'));
    expect(screen.getByTestId('retry').props.accessibilityRole).toBe('button');
    await fireEvent.press(screen.getByTestId('retry'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('toast over the real kit', () => {
  // The kit's Toast.Action derives its highlight from theme colours that Uniwind resolves on a
  // device; under Jest they are unresolved and its colour maths logs. That is the kit's.
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const useStack = () => {
    const { useSharedValue } = jest.requireMock('react-native-reanimated') as {
      useSharedValue: <T>(value: T) => { value: T; get: () => T; set: (v: T) => void };
    };
    return {
      id: 't1',
      index: 0,
      total: useSharedValue(1) as never,
      heights: useSharedValue<Record<string, number>>({}) as never,
      show: jest.fn(),
      hide: jest.fn(),
    };
  };

  function Harness({ onUndo, hide }: { onUndo: () => void; hide: jest.Mock }) {
    const props = useStack();
    return (
      <Toast
        {...props}
        hide={hide}
        message="Trip deleted"
        action={{ label: 'Undo', onPress: onUndo, testID: 'undo' }}
        durationMs={5000}
      />
    );
  }

  test('the root is the kit\u2019s polite status, and its stack props reach it', async () => {
    const hide = jest.fn();
    await renderKit(<Harness onUndo={jest.fn()} hide={hide} />);
    const roots = screen.getAllByTestId('toast-t1', hidden);
    // The kit renders the root twice: the second, invisible, measures the height.
    expect(roots.length).toBeGreaterThanOrEqual(1);
    for (const root of roots) {
      expect(root.props.role).toBe('status');
      expect(root.props['aria-live']).toBe('polite');
    }
    const flat = StyleSheet.flatten(roots[0].props.style);
    expect(flat).toMatchObject({ borderRadius: 16, borderCurve: 'continuous' });
    expect(tokens(roots[0].props.className)).toEqual(
      expect.arrayContaining(['toast__root', 'bg-toast-surface']),
    );
  });

  test('the action is the kit\u2019s button: named, pressable, and it dismisses', async () => {
    const hide = jest.fn();
    const onUndo = jest.fn();
    await renderKit(<Harness onUndo={onUndo} hide={hide} />);
    const undo = screen.getAllByTestId('undo')[0];
    expect(undo.props.accessibilityLabel).toBe('Undo');
    expect(undo.props.accessibilityRole).toBe('button');
    await fireEvent.press(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith('t1');
  });
});
