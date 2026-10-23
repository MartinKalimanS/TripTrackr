/**
 * T519 - the one table from a palette key to the theme variable an adapter asks the kit
 * for (feature 005, contract C5-6).
 *
 * An adapter names its colours by PALETTE KEY (`pressed`, `accentLine`: the words of the
 * contract and of the contrast gate) and `useColors` turns them into the colours of the
 * active theme with the kit's `useThemeColor`. The variable behind each key is generated
 * from the key (`scripts/build-theme-css.mjs`); this suite reads the stylesheet in all four
 * themes, so a key that points at the wrong variable, or a variable the generator stopped
 * writing, fails here and not on a device.
 */
import { renderHook } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';

import { themeVariable } from '../../../test/helpers/theme-css';
import { PaletteNames, Palettes } from '@/theme';
import { TOKEN_OF, useColors, type PaletteKey } from './theme-tokens';

afterEach(() => jest.restoreAllMocks());

const ENTRIES = Object.entries(TOKEN_OF) as [PaletteKey, string][];

describe('TOKEN_OF - C5-6', () => {
  describe.each(PaletteNames)('in %s', (theme) => {
    test.each(ENTRIES)('%s is the variable --%s of the stylesheet', (key, token) => {
      expect(themeVariable(theme, `--${token}`)).toBe(Palettes[theme][key].toLowerCase());
    });
  });

  test('names the keys the adapters of T519 and T520 paint with', () => {
    expect(Object.keys(TOKEN_OF).sort()).toEqual(
      [
        'accent',
        'accentInk',
        'accentLine',
        'accentPress',
        'accentText',
        'accentTint',
        'amberInk',
        'amberLine',
        'amberTint',
        'aquaInk',
        'aquaLine',
        'aquaTint',
        'border',
        'danger',
        'dangerInk',
        'dangerTint',
        'focus',
        'hairline',
        'ink',
        'muted',
        'onInk',
        'onPhoto',
        'pressed',
        'sand',
        'scrimButton',
        'scrimButtonLine',
        'subtle',
        'success',
        'successTint',
        'surface',
        'surfaceSecondary',
      ].sort(),
    );
  });
});

describe('useColors', () => {
  test('hands each key the colour of its variable, in one kit call per render', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockImplementation(((tokens: string[]) =>
      tokens.map((token) => `colour:${token}`)) as never);

    let renders = 0;
    const { result } = await renderHook(() => {
      renders += 1;
      return useColors(['pressed', 'ink', 'accentLine']);
    });

    // One kit call per render (the hook also hears the shared accessibility store, whose
    // first read re-renders it once), and the `surface` rides as its last colour: what a
    // tint settles onto when it must be opaque (T562).
    expect(useThemeColor).toHaveBeenCalledTimes(renders);
    for (const call of useThemeColor.mock.calls) {
      expect(call).toEqual([
        ['surface-tertiary', 'foreground', 'accent-line', 'surface'],
      ]);
    }
    expect(result.current).toEqual({
      pressed: 'colour:surface-tertiary',
      ink: 'colour:foreground',
      accentLine: 'colour:accent-line',
    });
  });
});
