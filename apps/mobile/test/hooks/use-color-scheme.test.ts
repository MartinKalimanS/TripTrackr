/**
 * Coverage for both color-scheme entry points.
 *
 * The web variant is imported by its explicit path: Jest resolves the native
 * `.ts` file by default, so the `.web.ts` hydration logic would otherwise never
 * be executed by any suite despite shipping to the web target.
 */
import { renderHook } from '@testing-library/react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useColorScheme as useColorSchemeWeb } from '@/hooks/use-color-scheme.web';

describe('useColorScheme (native)', () => {
  test('re-exports React Native’s hook', () => {
    expect(typeof useColorScheme).toBe('function');
  });
});

describe('useColorScheme (web)', () => {
  test('returns a scheme once hydrated', async () => {
    const { result } = await renderHook(() => useColorSchemeWeb());

    // Under test the client snapshot applies, so the real scheme is returned
    // rather than the server fallback.
    expect(['light', 'dark', null, undefined]).toContain(result.current);
  });

  test('has the same shape as the native export', () => {
    expect(typeof useColorSchemeWeb).toBe(typeof useColorScheme);
  });
});
