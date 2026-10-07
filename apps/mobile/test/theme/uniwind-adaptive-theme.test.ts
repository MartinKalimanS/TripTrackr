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
 *   - `'system'` switches adaptive themes back ON and hands the scheme back to the OS by
 *     calling `Appearance.setColorScheme` with the value the module picks for the React
 *     Native version it runs on: `'unspecified'` on 0.82 to 0.86, `'auto'` from 0.87, and
 *     nothing before 0.82 (`config.common.ts`, `SYSTEM_COLOR_SCHEME`).
 *
 * Uniwind reads the React Native version once, when it is first required, and Jest's
 * react-native stand-in reports 1000.0.0, so each test loads a fresh copy of the module
 * with the version this app really runs on (`node_modules/react-native/package.json`).
 * Uniwind registers its theme list from the Metro transform, which Jest has no part in, so
 * only the built-in names and `'system'` can be exercised here; that every name the app
 * passes is registered is checked against `metro.config.js` in test/config.
 */
import { Appearance } from 'react-native';
import type { Uniwind as UniwindType } from 'uniwind';

/** The `SYSTEM_COLOR_SCHEME` gate of Uniwind 1.12 (`core/config/config.common.ts`). */
function systemSchemeFor(minor: number): 'auto' | 'unspecified' | undefined {
  if (minor >= 87) return 'auto';
  if (minor >= 82) return 'unspecified';
  return undefined;
}

/** The minor version of the React Native this app is built on, e.g. 86 for 0.86.3. */
const INSTALLED_MINOR = Number(
  (require('react-native/package.json') as { version: string }).version.split('.')[1],
);

/**
 * A fresh `uniwind`, the way a device would first load it: the version it reads is the one
 * the isolated `react-native` reports at that moment. Uniwind looks `Appearance` up again
 * at each call, in this file's own registry, so `setColorScheme` is spied on the
 * `Appearance` imported above, not on the isolated one.
 */
function loadUniwind(minor: number): typeof UniwindType {
  let loaded!: typeof UniwindType;
  jest.isolateModules(() => {
    const { Platform } = require('react-native') as typeof import('react-native');
    Object.defineProperty(Platform, 'constants', {
      value: { ...Platform.constants, reactNativeVersion: { major: 0, minor, patch: 0 } },
      configurable: true,
    });
    loaded = (jest.requireActual('uniwind') as typeof import('uniwind')).Uniwind;
  });
  return loaded;
}

describe('Uniwind.setTheme and the native colour scheme', () => {
  let Uniwind: typeof UniwindType;
  let setColorScheme: jest.SpyInstance;

  beforeEach(() => {
    setColorScheme = jest
      .spyOn(Appearance, 'setColorScheme')
      .mockImplementation(() => {});
    Uniwind = loadUniwind(INSTALLED_MINOR);
  });

  afterEach(() => {
    setColorScheme.mockRestore();
  });

  test('is tested against the React Native this app is on, which has a system value', () => {
    expect(INSTALLED_MINOR).toBeGreaterThan(0);
    expect(systemSchemeFor(INSTALLED_MINOR)).toBeDefined();
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
    expect(setColorScheme).toHaveBeenCalledWith(systemSchemeFor(INSTALLED_MINOR));
    expect(setColorScheme).not.toHaveBeenCalledWith('light');
    expect(setColorScheme).not.toHaveBeenCalledWith('dark');
  });

  test('on React Native 0.82 to 0.86 that value is "unspecified"', () => {
    // Pinned by number, not by the gate above, so a change to the gate shows up here.
    loadUniwind(86).setTheme('system');

    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  test.each([
    [81, undefined],
    [82, 'unspecified'],
    [86, 'unspecified'],
    [87, 'auto'],
  ])('React Native 0.%i releases the scheme with %s', (minor, expected) => {
    loadUniwind(minor).setTheme('system');

    expect(setColorScheme).toHaveBeenCalledWith(expected);
  });

  test('repeating setTheme("system") is idempotent, so calling it on every change is safe', () => {
    Uniwind.setTheme('system');
    const before = [Uniwind.hasAdaptiveThemes, Uniwind.currentTheme];
    setColorScheme.mockClear();

    Uniwind.setTheme('system');

    expect([Uniwind.hasAdaptiveThemes, Uniwind.currentTheme]).toEqual(before);
    // The same call again: the native side sees no change in what it is asked for.
    expect(setColorScheme.mock.calls).toEqual([[systemSchemeFor(INSTALLED_MINOR)]]);
  });
});
