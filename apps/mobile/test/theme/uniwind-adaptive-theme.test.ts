/**
 * T412 / T406 — what `Uniwind.setTheme` does to the system colour scheme (research D4-05).
 *
 * The root layout never passes `'light'` or `'dark'` to `setTheme`; it passes `'system'`
 * (src/app/_layout.tsx, `kitThemeFor`). The reason is in Uniwind 1.12's `setTheme`, which
 * these tests pin against the REAL module so that an upgrade changing it fails here instead
 * of silently changing how the app follows the OS:
 *
 *   - a built-in name switches adaptive themes OFF and PINS the native scheme with
 *     `Appearance.setColorScheme('light' | 'dark')`. On Android that is
 *     `AppCompatDelegate.setDefaultNightMode(MODE_NIGHT_YES | MODE_NIGHT_NO)`, on iOS
 *     `window.overrideUserInterfaceStyle`, so the system scheme stops reaching the app;
 *   - `'system'` switches adaptive themes back ON and hands the scheme back to the OS.
 *
 * Uniwind registers its theme list from the Metro transform, which Jest has no part in,
 * so only the built-in names and `'system'` can be exercised here.
 */
import { Appearance } from 'react-native';
import { Uniwind } from 'uniwind';

describe('Uniwind.setTheme and the native colour scheme', () => {
  let setColorScheme: jest.SpyInstance;

  beforeEach(() => {
    setColorScheme = jest
      .spyOn(Appearance, 'setColorScheme')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    setColorScheme.mockRestore();
  });

  test('starts adaptive, following the device scheme', () => {
    expect(Uniwind.hasAdaptiveThemes).toBe(true);
  });

  test.each(['light', 'dark'] as const)(
    'setTheme(%s) pins the native scheme and stops following the OS',
    (name) => {
      Uniwind.setTheme(name);

      expect(Uniwind.hasAdaptiveThemes).toBe(false);
      expect(Uniwind.currentTheme).toBe(name);
      expect(setColorScheme).toHaveBeenCalledWith(name);
    },
  );

  test('setTheme("system") follows the OS again and releases the pinned scheme', () => {
    Uniwind.setTheme('dark');
    setColorScheme.mockClear();

    Uniwind.setTheme('system');

    expect(Uniwind.hasAdaptiveThemes).toBe(true);
    expect(setColorScheme).toHaveBeenCalledTimes(1);
    expect(setColorScheme).not.toHaveBeenCalledWith('light');
    expect(setColorScheme).not.toHaveBeenCalledWith('dark');
  });

  test('repeating setTheme("system") is idempotent, so calling it on every change is safe', () => {
    Uniwind.setTheme('system');
    const before = [Uniwind.hasAdaptiveThemes, Uniwind.currentTheme];

    Uniwind.setTheme('system');

    expect([Uniwind.hasAdaptiveThemes, Uniwind.currentTheme]).toEqual(before);
  });
});
