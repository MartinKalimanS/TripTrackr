/**
 * Feature 005, T519: `useAccessibilityFlags` is the leaner sibling of `useAppearance`, for
 * a control repeated down a list (a `Button`, an `IconButton`, a chip) that needs two
 * flags, reduced motion and increased contrast, and nothing of the colour scheme or the
 * font scale. It reads the shared store (`appearance-store.ts`), so it adds no
 * `AccessibilityInfo` listener of its own and no per-component colour-scheme subscription.
 */
import { act, render, renderHook } from '@testing-library/react-native';
import { Profiler } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import {
  __resetAppearanceStoreForTests,
  getAppearanceSnapshot,
} from './appearance-store';
import { useAccessibilityFlags } from './use-accessibility-flags';
import * as UseColorScheme from './use-color-scheme';

let handlers: (() => void)[];
let reduceMotion: boolean;
let os: ReturnType<typeof jest.replaceProperty>;

beforeEach(() => {
  handlers = [];
  reduceMotion = false;
  os = jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    _event: string,
    handler: () => void,
  ) => {
    handlers.push(handler);
    return { remove: jest.fn() };
  }) as never);
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(async () => reduceMotion);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  Object.assign(AccessibilityInfo, { isDarkerSystemColorsEnabled: async () => false });
});

afterEach(() => {
  __resetAppearanceStoreForTests();
  jest.restoreAllMocks();
  os.restore();
  delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
    .isDarkerSystemColorsEnabled;
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useAccessibilityFlags', () => {
  test('answers the flags of the shared store, defaults before the first read', async () => {
    const { result } = await renderHook(() => useAccessibilityFlags());
    expect(result.current.prefersLessMotion).toBe(false);
    expect(result.current.prefersMoreContrast).toBe(false);
    expect(result.current).toBe(getAppearanceSnapshot());
    await settle();
  });

  test('follows a change the OS reports', async () => {
    const { result } = await renderHook(() => useAccessibilityFlags());
    await settle();
    expect(result.current.prefersLessMotion).toBe(false);

    reduceMotion = true;
    await act(async () => {
      for (const handler of handlers) handler();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.prefersLessMotion).toBe(true);
  });

  test('subscribes to nothing of its own: no colour scheme, one shared registration', async () => {
    const colourScheme = jest.spyOn(UseColorScheme, 'useColorScheme');
    function Many() {
      useAccessibilityFlags();
      return null;
    }
    const onRender = jest.fn();
    await render(
      <Profiler id="many" onRender={onRender}>
        <Many />
        <Many />
        <Many />
      </Profiler>,
    );
    await settle();
    expect(colourScheme).not.toHaveBeenCalled();
    // Three consumers, three events: not nine.
    expect(handlers.length).toBeLessThanOrEqual(3);
  });
});
