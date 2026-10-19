/**
 * T541 - `PlanTripFab` (contract C5-32 "Trips" and "Home"; FR-018, FR-024, FR-028, FR-029;
 * owner answer Q-4): the one extended "Plan a trip" button, floating at the bottom end of a
 * screen 16 dp above the tab pill, with the same words on iOS and Android. A full pill on iOS, a
 * rounded square (16 dp) on Android; the screen's one primary; the second lift. The Trips screen
 * shows it always; Home hides it at the full detent and while there are no trips (the
 * invitation card carries the action then), which `planTripFabHidden` says.
 *
 * Its id is the screen's: `trips-plan-trip` on Trips (the id the flows tap, unique on that
 * screen), `home-plan-trip-fab` on Home.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

import { PlanTripFab, planTripFabHidden } from './plan-trip-fab';

const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

let platform: { restore: () => void } | undefined;
afterEach(() => {
  platform?.restore();
  platform = undefined;
});

async function renderFab(
  props: Record<string, unknown> = {},
  {
    os = 'ios',
    insets = INSETS,
  }: { os?: 'ios' | 'android'; insets?: typeof INSETS } = {},
) {
  platform = jest.replaceProperty(Platform, 'OS', os);
  const onPress = jest.fn();
  await render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <PlanTripFab onPress={onPress} {...props} />
    </SafeAreaInsetsContext.Provider>,
  );
  return onPress;
}

describe('<PlanTripFab> says "Plan a trip" on both platforms', () => {
  test.each(['ios', 'android'] as const)(
    'on %s: a primary button with words',
    async (os) => {
      const onPress = await renderFab({}, { os });

      const fab = screen.getByTestId('trips-plan-trip');
      expect(fab.props.accessibilityLabel).toBe('Plan a trip');
      expect(fab.props.accessibilityRole).toBe('button');
      expect(fab.props.variant).toBe('primary');
      expect(within(fab).getByText('Plan a trip')).toBeTruthy();
      expect(screen.getAllByTestId('trips-plan-trip')).toHaveLength(1);

      await fireEvent.press(fab);
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  test('has a plus beside the words', async () => {
    await renderFab();
    expect(
      screen.getByTestId('trips-plan-trip-icon', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  test('is at least 56 dp tall: a minimum, so the largest text grows it', async () => {
    await renderFab();
    const style = flat(screen.getByTestId('trips-plan-trip'));
    expect(style.minHeight).toBeGreaterThanOrEqual(56);
    expect(style.height).toBeUndefined();
  });
});

describe('<PlanTripFab> floats above the pill (FR-024)', () => {
  test('is 16 dp above the bottom of its screen, and 16 dp from the end', async () => {
    await renderFab();
    const style = flat(screen.getByTestId('trips-plan-trip'));

    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(Spacing.three);
    expect(style.end).toBe(Spacing.three);
  });

  test('floats 16 dp above the zone the pill takes', async () => {
    await renderFab({ bottomInset: 88 });
    expect(flat(screen.getByTestId('trips-plan-trip')).bottom).toBe(88 + Spacing.three);
  });

  test('keeps clear of the side insets (a notch in landscape)', async () => {
    await renderFab({}, { insets: { ...INSETS, left: 0, right: 48 } });
    expect(flat(screen.getByTestId('trips-plan-trip')).end).toBe(Spacing.three + 48);
  });

  test('draws without a safe-area provider (a component test)', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<PlanTripFab onPress={jest.fn()} />);
    expect(flat(screen.getByTestId('trips-plan-trip')).end).toBe(Spacing.three);
  });
});

describe('<PlanTripFab> shape and depth (FR-003, FR-028)', () => {
  test('is a full pill on iOS', async () => {
    await renderFab({}, { os: 'ios' });
    expect(flat(screen.getByTestId('trips-plan-trip')).borderRadius).toBe(999);
  });

  test('is a rounded square of 16 dp on Android', async () => {
    await renderFab({}, { os: 'android' });
    expect(flat(screen.getByTestId('trips-plan-trip')).borderRadius).toBe(16);
  });

  test('floats on the second lift', async () => {
    await renderFab();
    const style = flat(screen.getByTestId('trips-plan-trip'));
    expect(style.boxShadow ?? style.elevation).toBeDefined();
  });
});

describe('<PlanTripFab> is the screen’s, by id', () => {
  test('on Home it is home-plan-trip-fab, and trips-plan-trip is not drawn', async () => {
    await renderFab({ screen: 'home' });
    expect(screen.getByTestId('home-plan-trip-fab')).toBeTruthy();
    expect(screen.queryByTestId('trips-plan-trip')).toBeNull();
  });

  test('hidden draws nothing at all', async () => {
    await renderFab({ hidden: true });
    expect(screen.queryByTestId('trips-plan-trip')).toBeNull();
    expect(screen.queryByText('Plan a trip')).toBeNull();
  });
});

describe('<PlanTripFab collapsed> is the round button of the peek sheet (contract C5-23)', () => {
  test('keeps the name, the id and the press, and draws no words', async () => {
    const onPress = await renderFab({ screen: 'home', collapsed: true });
    const fab = screen.getByTestId('home-plan-trip-fab');
    expect(fab.props.accessibilityLabel).toBe('Plan a trip');
    expect(fab.props.accessibilityRole).toBe('button');
    expect(fab.props.variant).toBe('primary');
    expect(within(fab).queryByText('Plan a trip')).toBeNull();
    await fireEvent.press(fab);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['ios', 999],
    ['android', 16],
  ] as const)('is a 56 dp square with the platform corner on %s', async (os, radius) => {
    await renderFab({ screen: 'home', collapsed: true }, { os });
    const style = flat(screen.getByTestId('home-plan-trip-fab'));
    expect(style.minWidth).toBe(56);
    expect(style.minHeight).toBe(56);
    expect(style.borderRadius).toBe(radius);
  });

  test('floats where the extended button does: 16 dp above the zone the pill takes', async () => {
    await renderFab({ screen: 'home', collapsed: true, bottomInset: 88 });
    const style = flat(screen.getByTestId('home-plan-trip-fab'));
    expect(style.bottom).toBe(88 + Spacing.three);
    expect(style.end).toBe(Spacing.three);
  });
});

describe('planTripFabHidden: when Home does not show the button (FR-018)', () => {
  test('is shown with trips below the full detent', () => {
    expect(planTripFabHidden({ tripCount: 3, sheetFull: false })).toBe(false);
    expect(planTripFabHidden({ tripCount: 1 })).toBe(false);
  });

  test('is hidden at the full detent, where the Countries list fills the sheet', () => {
    expect(planTripFabHidden({ tripCount: 3, sheetFull: true })).toBe(true);
  });

  test('is hidden with no trips: the invitation card carries the action then', () => {
    expect(planTripFabHidden({ tripCount: 0, sheetFull: false })).toBe(true);
    expect(planTripFabHidden({ tripCount: 0, sheetFull: true })).toBe(true);
  });
});
