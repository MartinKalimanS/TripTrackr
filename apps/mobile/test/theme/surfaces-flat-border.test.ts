/**
 * 004 D4-12, review fix: the interim look of unmigrated screens.
 *
 * The elevation profile is forced to `flat`, so the old neumorphic shadows are gone and
 * a static card would be a canvas-coloured rectangle on a canvas-coloured screen. Until
 * phase 7 deletes this code, a flat, NON-interactive surface that used to be separated
 * by shadow carries a hairline in the palette's `separator` colour. Interactive surfaces
 * keep their stronger 3:1 border, and the full and reduced profiles are untouched.
 */
import { BorderHairline, Colors } from '@/constants/theme';
import { Palettes } from '@/theme/palette';
import { surfaceStyle, type SurfaceTreatment, type ThemeName } from '@/theme/surfaces';

const THEMES: ThemeName[] = ['light', 'dark'];
/** The treatments that carried a shadow, and so lose their separation when flat. */
const SHADOWED: SurfaceTreatment[] = ['raised', 'recessed', 'pressed', 'busy'];
/** Flat by nature: dense rows and backgrounds, and the inert disabled state. */
const UNSHADOWED: SurfaceTreatment[] = ['flat', 'disabled'];

describe('Colors.separator', () => {
  test.each(THEMES)(
    '%s is the palette separator, a decorative hairline tone',
    (theme) => {
      expect(Colors[theme].separator).toBe(Palettes[theme].separator);
    },
  );
});

describe('a flat, non-interactive surface keeps a hairline (004 D4-12)', () => {
  describe.each(THEMES)('%s theme', (theme) => {
    test.each(SHADOWED)(
      '%s gets a hairline border in the separator colour',
      (treatment) => {
        const style = surfaceStyle(treatment, { theme, profile: 'flat' });
        expect(style.borderWidth).toBe(BorderHairline);
        expect(style.borderColor).toBe(Colors[theme].separator);
        expect(style.boxShadow).toBeUndefined();
      },
    );

    test.each(UNSHADOWED)('%s stays borderless', (treatment) => {
      const style = surfaceStyle(treatment, { theme, profile: 'flat' });
      expect(style.borderWidth).toBeUndefined();
      expect(style.borderColor).toBeUndefined();
    });

    test('an interactive surface keeps its stronger 3:1 border, not the hairline', () => {
      const style = surfaceStyle('raised', { theme, profile: 'flat', interactive: true });
      expect(style.borderWidth).toBe(BorderHairline);
      expect(style.borderColor).toBe(Colors[theme].borderStrong);
      expect(style.borderColor).not.toBe(Colors[theme].separator);
    });

    test('a pending surface keeps its dashed accent border (FR-007 composes)', () => {
      const style = surfaceStyle('raised', { theme, profile: 'flat', pending: true });
      expect(style.borderColor).toBe(Colors[theme].accent);
      expect(style.borderStyle).toBe('dashed');
    });

    test('a pending flat-treatment surface is still marked', () => {
      const style = surfaceStyle('flat', { theme, profile: 'flat', pending: true });
      expect(style.borderStyle).toBe('dashed');
    });

    test.each(['full', 'reduced'] as const)(
      'the %s profile is untouched: a static card stays borderless',
      (profile) => {
        const style = surfaceStyle('raised', { theme, profile });
        expect(style.borderWidth).toBeUndefined();
      },
    );
  });

  test('the hairline is a separator, never mistaken for a boundary: it adds no fill', () => {
    const flat = surfaceStyle('raised', { theme: 'light', profile: 'flat' });
    expect(flat.backgroundColor).toBe(Colors.light.surface);
  });

  test('a recessed surface keeps its sunken fill as well as the hairline', () => {
    const style = surfaceStyle('recessed', { theme: 'light', profile: 'flat' });
    expect(style.backgroundColor).toBe(Colors.light.surfaceSunk);
    expect(style.borderColor).toBe(Colors.light.separator);
  });
});
