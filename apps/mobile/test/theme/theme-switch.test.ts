/**
 * T037–T038 — US3, FR-022 and FR-023.
 *
 * The failure this guards against is the "half-converted" screen: a theme
 * change that reaches some surfaces and not others. Because every treatment is
 * derived from one resolver, a switch either changes everything or nothing —
 * these tests assert that property rather than sampling components one by one.
 */
import { Colors } from '@/constants/theme';
import { resolveElevationProfile } from '@/theme/elevation-profile';
import { surfaceStyle, type ThemeName } from '@/theme/surfaces';

const THEMES: ThemeName[] = ['light', 'dark'];

describe('theme switching — FR-022, FR-023', () => {
  test('both themes expose a complete ramp — neither is a partial conversion', () => {
    const lightKeys = Object.keys(Colors.light).sort();
    const darkKeys = Object.keys(Colors.dark).sort();
    expect(lightKeys).toEqual(darkKeys);
    expect(lightKeys.length).toBeGreaterThan(0);
  });

  test('no token holds the same value in both themes by accident', () => {
    // A token identical across themes is almost always one that was added to
    // one ramp and copied without being re-chosen for the other.
    // Widened to `string`: with the legacy tokens gone the two literal unions
    // no longer overlap, and TypeScript (correctly) flags the comparison as
    // always-false — which is precisely the property being asserted at runtime.
    const light: Record<string, string> = Colors.light;
    const dark: Record<string, string> = Colors.dark;
    const shared = Object.keys(light).filter((key) => light[key] === dark[key]);
    expect(shared).toEqual([]);
  });

  test.each(THEMES)(
    'every treatment resolves to a complete style in the %s theme',
    (theme) => {
      const treatments = [
        'raised',
        'recessed',
        'flat',
        'pressed',
        'busy',
        'disabled',
      ] as const;
      for (const treatment of treatments) {
        const style = surfaceStyle(treatment, { theme, profile: 'full' });
        // A treatment with no background is a surface that would show whatever
        // is behind it — the half-converted look this story exists to prevent.
        expect(style.backgroundColor).toBeDefined();
        expect(style.borderRadius).toBeDefined();
      }
    },
  );

  test('switching theme changes every rendered surface value', () => {
    const light = surfaceStyle('raised', { theme: 'light', profile: 'full' });
    const dark = surfaceStyle('raised', { theme: 'dark', profile: 'full' });

    expect(light.backgroundColor).not.toBe(dark.backgroundColor);
    // Including the shadows: a dark surface lit with light-theme shadows is the
    // classic half-converted artefact.
    expect(JSON.stringify(light.boxShadow)).not.toBe(JSON.stringify(dark.boxShadow));
  });

  test.each(THEMES)(
    'the raised/recessed distinction survives in the %s theme',
    (theme) => {
      const raised = surfaceStyle('raised', { theme, profile: 'full' });
      const recessed = surfaceStyle('recessed', { theme, profile: 'full' });

      const raisedShadows = raised.boxShadow as unknown as { inset: boolean }[];
      const recessedShadows = recessed.boxShadow as unknown as { inset: boolean }[];

      expect(raisedShadows.every((s) => !s.inset)).toBe(true);
      expect(recessedShadows.every((s) => s.inset)).toBe(true);
    },
  );

  test('the theme does not influence which elevation profile is chosen', () => {
    // Profile depends on capability and contrast preference only. If theme ever
    // leaked into it, dark mode could silently lose its shadows.
    const input = { os: 'ios', apiLevel: null, prefersMoreContrast: false };
    expect(resolveElevationProfile(input)).toBe('full');
  });
});
