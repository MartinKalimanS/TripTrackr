/**
 * The Home sheet's shell as the pictures draw it (feature 005, F2; UI-SPEC 3.6; prototype
 * `.sheet`, `.grab-zone`, `.grab`): the surface, its edge, the grab zone, the grabber and the
 * hit area. The gestures and the settle are `sheet.test.tsx`'s.
 */
import 'react-native-gesture-handler/jestSetup';

import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { Palettes } from '@/theme';

import { appearance } from '../../../test/helpers/appearance';
import { Sheet } from './sheet';
import * as themeTokens from './theme-tokens';

jest.mock('react-native-worklets', () => require('../../../test/mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../../../test/mocks/reanimated-live'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  useHaptics.mockReturnValue({ sheetSnap: jest.fn() });
});

const sheet = () => (
  <Sheet
    detents={{ peek: 212, half: 439, full: 780 }}
    detent="half"
    handleLabel="Countries and trips"
    renderBody={() => null}
  />
);

describe('the shell as pictured (UI-SPEC 3.6; prototype .sheet, .grab-zone, .grab)', () => {
  afterEach(() => jest.restoreAllMocks());

  test('is the paper surface with a 1 dp top hairline in the hairline colour', async () => {
    // The kit's colours are a stand-in under Jest: ask for the light palette itself.
    jest
      .spyOn(themeTokens, 'useColors')
      .mockImplementation(
        (keys) =>
          Object.fromEntries(keys.map((key) => [key, Palettes.light[key]])) as never,
      );
    await render(sheet());
    const style = StyleSheet.flatten(screen.getByTestId('home-sheet').props.style);
    expect(style.backgroundColor).toBe(Palettes.light.surface);
    expect(style.borderColor).toBe(Palettes.light.hairline);
    expect(style.borderTopWidth).toBe(1);
    expect(style.borderBottomWidth ?? 0).toBe(0);
  });

  test('has a 28 dp grab zone above the content, and the grabber stands 10 dp into it', async () => {
    await render(sheet());
    const zone = StyleSheet.flatten(screen.getByTestId('home-sheet-zone').props.style);
    expect(zone.height).toBe(28);
    for (const os of ['ios', 'android'] as const) {
      const restore = jest.replaceProperty(Platform, 'OS', os);
      try {
        await screen.unmount();
        await render(sheet());
        const grabber = screen.getByTestId('home-sheet-grabber');
        expect(StyleSheet.flatten(grabber.props.style).marginTop).toBe(10);
        expect(String(grabber.props.className).split(' ')).toContain('bg-grab');
      } finally {
        restore.restore();
      }
    }
  });

  test('the hit area is 96 by 48 dp, centred on the sheet and 48 dp tall from its top edge', async () => {
    await render(sheet());
    const target = StyleSheet.flatten(
      screen.getByTestId('home-sheet-handle').props.style,
    );
    expect(target).toMatchObject({ width: 96, height: 48 });
    const slot = StyleSheet.flatten(
      screen.getByTestId('home-sheet-handle').parent!.props.style,
    );
    expect(slot).toMatchObject({
      position: 'absolute',
      top: 0,
      left: '50%',
      marginLeft: -48,
      width: 96,
      height: 48,
    });
  });
});
