/**
 * T558 - the ONE gate of the delight (feature 005; FR-060, FR-061, FR-062, FR-073; research
 * D5-14): every haptic goes through `useHaptics`, and `useAppearance().prefersLessMotion`
 * decides, live, whether it plays. This file runs the REAL hook (the suites of each control
 * replace it, so they prove WHICH haptic a control asks for) under the reduced-motion helper
 * (`test/helpers/appearance.ts`) and proves, control by control, that a haptic plays when
 * motion is allowed and never when it is not:
 *
 *   chip selection, segment selection (only when the selection CHANGES), a tab change (only
 *   when the tab changes) and the stamp thud (the heavy impact, once, when it lands).
 *
 * And that nothing can go round the gate: no file but the hook imports `expo-haptics`.
 * (The sheet detent's own rule, one haptic for each change of detent, is pinned in
 * `components/ui/sheet.test.tsx`; the count-up's in `count-up-policy.test.tsx`.)
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import fs from 'node:fs';
import path from 'node:path';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { ChipGroup } from '@/components/ui/chip';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { StampIn } from '@/components/ui/stamp-in';
import { Motion } from '@/theme';

import { appearance } from '../helpers/appearance';
import { mockThemeColors } from '../helpers/theme-colors';

jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-accessibility-flags');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { useAccessibilityFlags } = jest.requireMock('@/hooks/use-accessibility-flags') as {
  useAccessibilityFlags: jest.Mock;
};
const haptics = jest.mocked(ExpoHaptics);

function motion(prefersLessMotion: boolean) {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion }));
  useAccessibilityFlags.mockReturnValue({
    prefersMoreContrast: false,
    prefersLessMotion,
    prefersLessTransparency: false,
    ready: true,
  });
}

const played = () =>
  haptics.selectionAsync.mock.calls.length +
  haptics.impactAsync.mock.calls.length +
  haptics.notificationAsync.mock.calls.length;

beforeEach(() => {
  for (const fn of [
    haptics.selectionAsync,
    haptics.impactAsync,
    haptics.notificationAsync,
  ]) {
    fn.mockReset().mockResolvedValue(undefined);
  }
  mockThemeColors('light');
  motion(false);
});
afterEach(() => jest.restoreAllMocks());

const OPTIONS = [
  { key: 'all', label: 'All', testID: 'opt-all', accessibilityLabel: 'All' },
  { key: 'year', label: '2026', testID: 'opt-year', accessibilityLabel: '2026' },
];

describe.each([
  ['a chip', 'opt-year', 'opt-all'],
  ['a segment', 'opt-year', 'opt-all'],
] as const)('%s is selected', (name, other, same) => {
  const control = () =>
    name === 'a chip' ? (
      <ChipGroup options={OPTIONS} selectedKey="all" onSelect={jest.fn()} />
    ) : (
      <SegmentedPill options={OPTIONS} selectedKey="all" onSelect={jest.fn()} />
    );

  test('a different one plays the selection haptic, once', async () => {
    await render(control());
    await fireEvent.press(screen.getByTestId(other));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('the selected one again is silent', async () => {
    await render(control());
    await fireEvent.press(screen.getByTestId(same));
    expect(played()).toBe(0);
  });

  test('under reduced motion nothing plays', async () => {
    motion(true);
    await render(control());
    await fireEvent.press(screen.getByTestId(other));
    expect(played()).toBe(0);
  });
});

describe('a tab is pressed', () => {
  const ROUTES = [
    { key: 'index-1', name: 'index', title: 'Globe' },
    { key: 'trips-1', name: 'trips', title: 'Trips' },
  ] as const;

  function tabs(focusedIndex: number): BottomTabBarProps {
    return {
      state: {
        key: 'tabs',
        index: focusedIndex,
        routeNames: ROUTES.map((r) => r.name),
        routes: ROUTES.map((r) => ({ key: r.key, name: r.name })),
        type: 'tab',
        stale: false,
        history: [],
        preloadedRouteKeys: [],
      },
      descriptors: Object.fromEntries(
        ROUTES.map((r) => [
          r.key,
          { options: { title: r.title }, route: { key: r.key, name: r.name } },
        ]),
      ),
      navigation: {
        emit: jest.fn(() => ({ defaultPrevented: false })),
        navigate: jest.fn(),
      },
      insets: { top: 47, left: 0, right: 0, bottom: 34 },
    } as unknown as BottomTabBarProps;
  }

  test('another tab plays the selection haptic, once', async () => {
    await render(<TabBar {...tabs(0)} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('the tab already in front is silent', async () => {
    await render(<TabBar {...tabs(1)} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(played()).toBe(0);
  });

  test('under reduced motion nothing plays', async () => {
    motion(true);
    await render(<TabBar {...tabs(0)} />);
    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(played()).toBe(0);
  });
});

describe('a stamp lands', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const land = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  const stamp = (props: { play?: boolean; delayMs?: number } = {}) => (
    <StampIn {...props}>
      <Text>stamp</Text>
    </StampIn>
  );

  test('the heavy impact plays once, when it lands and not before', async () => {
    await render(stamp());
    await land(Motion.stampLandMs - 1);
    expect(played()).toBe(0);
    await land(1);
    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(haptics.impactAsync).toHaveBeenCalledWith('heavy');
    await land(5_000);
    expect(played()).toBe(1);
  });

  test('a queued stamp thuds after its wait', async () => {
    await render(stamp({ delayMs: 240 }));
    await land(Motion.stampLandMs + 239);
    expect(played()).toBe(0);
    await land(1);
    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  test('one that landed before simply appears', async () => {
    await render(stamp({ play: false }));
    await land(5_000);
    expect(played()).toBe(0);
  });

  test('under reduced motion it simply appears: no haptic', async () => {
    motion(true);
    await render(stamp());
    await land(5_000);
    expect(played()).toBe(0);
  });
});

describe('nothing goes round the gate', () => {
  const SRC = path.resolve(__dirname, '../../src');

  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)
        ? [full]
        : [];
    });
  }

  test('only hooks/use-haptics.ts imports expo-haptics', () => {
    const importers = sources(SRC)
      .filter((file) => /from ['"]expo-haptics['"]/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'));
    expect(importers).toEqual(['hooks/use-haptics.ts']);
  });
});
