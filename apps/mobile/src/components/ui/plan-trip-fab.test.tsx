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

import {
  hideKeyboard,
  resetKeyboard,
  showKeyboard,
} from '../../../test/helpers/keyboard';
import {
  FAB_TOAST_LIFT,
  PlanTripFab,
  fabHeightAt,
  planTripFabHidden,
} from './plan-trip-fab';

const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };

let platform: { restore: () => void } | undefined;
afterEach(() => {
  resetKeyboard();
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

  // The pictures: a 52 dp pill on iOS, a 56 dp rounded square on Android (UI-SPEC 2.4;
  // prototype --fab-h), as a minimum, so the largest text grows it by wrapping.
  test.each([
    ['ios', 52],
    ['android', 56],
  ] as const)(
    'is %s: at least %i dp tall, a minimum and never a height',
    async (os, dp) => {
      await renderFab({}, { os });
      const style = flat(screen.getByTestId('trips-plan-trip'));
      expect(style.minHeight).toBe(dp);
      expect(style.height).toBeUndefined();
    },
  );

  test('pads 16 dp before the plus and 20 dp after the words, as .fab does', async () => {
    await renderFab();
    expect(flat(screen.getByTestId('trips-plan-trip'))).toMatchObject({
      paddingStart: 16,
      paddingEnd: 20,
    });
  });

  test('its words stop growing at 1.3 times the text size (FR-074; home-scale2.png)', async () => {
    await renderFab();
    expect(screen.getByText('Plan a trip').props.maxFontSizeMultiplier).toBe(1.3);
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

describe('planTripFabHidden: when Home does not show the button (FR-018, feature 007)', () => {
  test('is shown below the full detent, with trips or with none (the tour points at it)', () => {
    expect(planTripFabHidden({ sheetFull: false })).toBe(false);
    expect(planTripFabHidden({})).toBe(false);
  });

  test('is hidden at the full detent, where the Countries list fills the sheet', () => {
    expect(planTripFabHidden({ sheetFull: true })).toBe(true);
  });
});

describe('<PlanTripFab> lifts above a toast (trips-toast.png: .fab.is-raised)', () => {
  test('rises 68 dp while a toast is up (it is the screen that says so)', async () => {
    await renderFab({ bottomInset: 88 });
    expect(flat(screen.getByTestId('trips-plan-trip')).bottom).toBe(88 + 16);

    await screen.rerender(
      <SafeAreaInsetsContext.Provider value={INSETS}>
        <PlanTripFab onPress={jest.fn()} bottomInset={88} lifted />
      </SafeAreaInsetsContext.Provider>,
    );
    expect(FAB_TOAST_LIFT).toBe(68);
    expect(flat(screen.getByTestId('trips-plan-trip')).bottom).toBe(88 + 16 + 68);
  });
});

describe('<PlanTripFab> goes with the keyboard (UI-SPEC 3.1: hides when the keyboard is open)', () => {
  test('is not drawn while the keyboard is up, and is back when it goes', async () => {
    await renderFab();
    expect(screen.getByTestId('trips-plan-trip')).toBeTruthy();

    await showKeyboard();
    expect(screen.queryByTestId('trips-plan-trip')).toBeNull();
    expect(screen.queryByText('Plan a trip')).toBeNull();

    await hideKeyboard();
    expect(screen.getByTestId('trips-plan-trip')).toBeTruthy();
  });

  test('the collapsed button on Home goes with it too', async () => {
    await renderFab({ screen: 'home', collapsed: true });
    await showKeyboard();
    expect(screen.queryByTestId('home-plan-trip-fab')).toBeNull();
  });
});

describe('fabHeightAt: the room the list leaves for the button (172 dp, 176 on Android)', () => {
  test.each([
    ['ios', 1, 52],
    ['android', 1, 56],
  ] as const)('%s at the default text size is the pictured %i dp', (os, scale, dp) => {
    expect(fabHeightAt(os, scale)).toBe(dp);
  });

  test('its words stop at 1.3 times the size, so the button stops growing there', () => {
    expect(fabHeightAt('ios', 1.3)).toBe(fabHeightAt('ios', 2));
    expect(fabHeightAt('ios', 3)).toBeLessThanOrEqual(56);
    expect(fabHeightAt('android', 3)).toBe(56);
  });

  test('never below the pictured minimum, whatever the scale', () => {
    expect(fabHeightAt('ios', 0.8)).toBe(52);
  });
});
