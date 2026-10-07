/**
 * T053 — US5, FR-013 through FR-016.
 *
 * These four settings are an explicit statement that the default presentation
 * does not work for this person. A decorative style that ignores them makes the
 * product unusable for the travellers who most depend on them.
 */
import { Colors } from '@/constants/theme';
import { ContrastFloor, contrastRatio } from '@/theme/contrast';
import { resolveElevationProfile } from '@/theme/elevation-profile';
import { resolveInk } from '@/theme/ink';
import { surfaceStyle, type ThemeName } from '@/theme/surfaces';

const THEMES: ThemeName[] = ['light', 'dark'];

describe('increased contrast — FR-013', () => {
  test.each(THEMES)('renders explicit borders in the %s theme', (theme) => {
    const profile = resolveElevationProfile({
      os: 'ios',
      apiLevel: null,
      prefersMoreContrast: true,
    });
    const style = surfaceStyle('raised', { theme, profile, interactive: true });

    // 004 D4-12: every profile is flat now, and a flat surface carries the stronger border.
    expect(profile).toBe('flat');
    expect(style.borderWidth).toBeGreaterThan(0);
    // The stronger tone, not the minimum-passing one.
    expect(style.borderColor).toBe(Colors[theme].borderStrong);
  });

  test.each(THEMES)('promotes muted text to primary ink in the %s theme', (theme) => {
    const palette = Colors[theme];

    // Muted text clears AA. Under increased contrast it is promoted to primary ink
    // for the unmigrated screens that still read the two-theme `Colors`; the Atlas
    // contrast themes carry their own 7:1 muted tone (palette-gate.test.ts), so the
    // promotion is a fallback now, not the only route to AAA. It never lowers contrast.
    expect(contrastRatio(palette.textMuted, palette.canvas)).toBeGreaterThanOrEqual(
      ContrastFloor.normalText,
    );

    const promoted = resolveInk(palette, 'muted', true);
    expect(promoted).toBe(palette.textPrimary);
    expect(contrastRatio(promoted, palette.canvas)).toBeGreaterThanOrEqual(
      ContrastFloor.increasedContrast,
    );
  });

  test.each(THEMES)(
    'leaves ink untouched in the %s theme when not requested',
    (theme) => {
      const palette = Colors[theme];
      expect(resolveInk(palette, 'muted', false)).toBe(palette.textMuted);
      expect(resolveInk(palette, 'primary', false)).toBe(palette.textPrimary);
    },
  );
});

describe('reduced transparency — FR-014', () => {
  test.each(THEMES)('every %s surface is opaque by construction', (theme) => {
    for (const profile of ['full', 'reduced', 'flat'] as const) {
      for (const treatment of ['raised', 'recessed', 'flat'] as const) {
        const style = surfaceStyle(treatment, { theme, profile });
        // No alpha channel anywhere in the fill: an 8-digit hex or an rgba()
        // string would mean the setting has something to switch off.
        expect(String(style.backgroundColor)).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(style.opacity).toBeUndefined();
      }
    }
  });
});

describe('reduced motion — FR-015', () => {
  test('needs no branch, because transitions are discrete (research R-004)', () => {
    // The requirement is "resolve instantly while still showing the destination
    // state". A discrete swap IS the destination state, arrived at instantly,
    // so there is nothing to suppress. This test exists to catch a future
    // change that introduces an animation and quietly breaks that property.
    const options = {
      theme: 'light' as const,
      profile: 'full' as const,
      interactive: true,
    };
    for (const treatment of ['raised', 'pressed', 'busy', 'disabled'] as const) {
      const style = surfaceStyle(treatment, options) as Record<string, unknown>;
      expect(style.transitionDuration).toBeUndefined();
      expect(style.transitionProperty).toBeUndefined();
      expect(style.animationName).toBeUndefined();
      expect(style.transform).toBeUndefined();
    }
  });
});

describe('enlarged text — FR-016', () => {
  test('no treatment fixes a height that large text could overflow', () => {
    for (const theme of THEMES) {
      for (const treatment of ['raised', 'recessed', 'flat'] as const) {
        const style = surfaceStyle(treatment, { theme, profile: 'full' }) as Record<
          string,
          unknown
        >;
        // A fixed height is precisely what clips a label at 200% text size.
        expect(style.height).toBeUndefined();
        expect(style.maxHeight).toBeUndefined();
      }
    }
  });
});
