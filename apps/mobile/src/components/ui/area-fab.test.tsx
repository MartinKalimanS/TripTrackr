/**
 * T548 - `AreaFab` (FR-044, FR-028, FR-074; UI-SPEC 3.1; prototype `.fab`): the one extended
 * action of an area, 16 dp above the bottom, hidden with the keyboard, the same words on both
 * platforms, a pill on iOS and a rounded square on Android.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import {
  hideKeyboard,
  resetKeyboard,
  showKeyboard,
} from '../../../test/helpers/keyboard';
import { AREA_FAB_BOTTOM, AREA_FAB_END, AreaFab, areaFabClearance } from './area-fab';
import { fabHeightAt } from './plan-trip-fab';

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
      <AreaFab
        label="Add photos"
        icon="images"
        testID="area-fab"
        onPress={onPress}
        {...props}
      />
    </SafeAreaInsetsContext.Provider>,
  );
  return onPress;
}

describe('<AreaFab> is the screen state’s one primary', () => {
  test.each(['ios', 'android'] as const)(
    'on %s: a button with words and an icon',
    async (os) => {
      const onPress = await renderFab({}, { os });

      const fab = screen.getByTestId('area-fab');
      expect(fab.props.accessibilityRole).toBe('button');
      expect(fab.props.variant).toBe('primary');
      expect(within(fab).getByText('Add photos')).toBeTruthy();
      expect(
        screen.getByTestId('area-fab-icon', { includeHiddenElements: true }),
      ).toBeTruthy();

      await fireEvent.press(fab);
      expect(onPress).toHaveBeenCalledTimes(1);
    },
  );

  test('is named by its label, or by a longer name a screen gives it', async () => {
    await renderFab();
    expect(screen.getByTestId('area-fab').props.accessibilityLabel).toBe('Add photos');

    await screen.unmount();
    await renderFab({ accessibilityLabel: 'Add photos from your library' });
    expect(screen.getByTestId('area-fab').props.accessibilityLabel).toBe(
      'Add photos from your library',
    );
  });

  test('busy is announced and drops a press', async () => {
    const onPress = await renderFab({ busy: true });
    const fab = screen.getByTestId('area-fab');
    expect(fab.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(fab);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('hidden draws nothing at all', async () => {
    await renderFab({ hidden: true });
    expect(screen.queryByTestId('area-fab', { includeHiddenElements: true })).toBeNull();
  });
});

describe('<AreaFab> shape and size', () => {
  test.each([
    ['ios', 52],
    ['android', 56],
  ] as const)('on %s it is at least %i dp tall, never a fixed height', async (os, dp) => {
    await renderFab({}, { os });
    const style = flat(screen.getByTestId('area-fab'));
    expect(style.minHeight).toBe(dp);
    expect(style.height).toBeUndefined();
  });

  test('a pill on iOS, a rounded square of 16 dp on Android', async () => {
    await renderFab({}, { os: 'ios' });
    expect(flat(screen.getByTestId('area-fab')).borderRadius).not.toBe(16);

    await screen.unmount();
    await renderFab({}, { os: 'android' });
    expect(flat(screen.getByTestId('area-fab')).borderRadius).toBe(16);
  });

  test('pads 16 dp before the icon and 20 dp after the words, as .fab does', async () => {
    await renderFab();
    expect(flat(screen.getByTestId('area-fab'))).toMatchObject({
      paddingStart: 16,
      paddingEnd: 20,
    });
  });

  test('its words stop growing at 1.3 times the text size', async () => {
    await renderFab();
    expect(screen.getByText('Add photos').props.maxFontSizeMultiplier).toBe(1.3);
  });
});

describe('<AreaFab> floats 16 dp above the bottom of the screen (FR-044)', () => {
  test('bottom end: 20 dp from the end, 16 dp above the home indicator', async () => {
    await renderFab();
    const style = flat(screen.getByTestId('area-fab'));
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(34 + AREA_FAB_BOTTOM);
    expect(style.bottom).toBe(34 + 16);
    expect(style.end).toBe(AREA_FAB_END);
    expect(style.end).toBe(20);
  });

  test('bottomInset lifts it further; a notch at the side pushes it in', async () => {
    await renderFab({ bottomInset: 10 }, { insets: { ...INSETS, right: 48 } });
    const style = flat(screen.getByTestId('area-fab'));
    expect(style.bottom).toBe(34 + 16 + 10);
    expect(style.end).toBe(20 + 48);
  });

  test('draws without a safe-area provider (a component test)', async () => {
    platform = jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <AreaFab label="New note" icon="note" testID="area-fab" onPress={jest.fn()} />,
    );
    expect(flat(screen.getByTestId('area-fab')).bottom).toBe(16);
  });
});

describe('<AreaFab> goes with the keyboard', () => {
  test('is not drawn while the keyboard is up, and comes back with it gone', async () => {
    await renderFab();
    expect(screen.getByTestId('area-fab')).toBeTruthy();

    await showKeyboard();
    expect(screen.queryByTestId('area-fab', { includeHiddenElements: true })).toBeNull();

    await hideKeyboard();
    expect(screen.getByTestId('area-fab')).toBeTruthy();
  });
});

describe('areaFabClearance: what a list leaves under its last item', () => {
  test('the button, the 16 dp under it and a 16 dp gap over it', () => {
    expect(areaFabClearance('ios', 1)).toBe(52 + 16 + 16);
    expect(areaFabClearance('android', 1)).toBe(56 + 16 + 16);
  });

  test('grows with the text only up to the 1.3 cap', () => {
    expect(areaFabClearance('ios', 2)).toBe(fabHeightAt('ios', 1.3) + 32);
    expect(areaFabClearance('ios', 3)).toBe(areaFabClearance('ios', 2));
  });
});
