/**
 * Contract C7 — the token layer's public surface.
 *
 * Token NAMES are stable: the screens are built against exactly these exports, so
 * an accidental rename or removal is a breaking change and should fail here rather
 * than in a screen.
 */
import {
  AtlasRadius,
  AtlasSpacing,
  ContrastFloor,
  FocusRing,
  Motion,
  PaletteKeys,
  PaletteNames,
  Palettes,
  TextRoles,
  blend,
  contrastRatio,
  meetsFloor,
  platformQueries,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
  relativeLuminance,
  resolvePaletteName,
} from '@/theme';

describe('token layer public API — contract C7', () => {
  test('exports every function downstream features depend on', () => {
    // Named imports rather than a namespace lookup: a removed export becomes a
    // compile error here, which is the earliest place it can possibly surface.
    for (const fn of [
      blend,
      contrastRatio,
      relativeLuminance,
      meetsFloor,
      resolvePaletteName,
      readPrefersMoreContrast,
      readPrefersLessTransparency,
      readPrefersLessMotion,
    ]) {
      expect(typeof fn).toBe('function');
    }
  });

  test('exports the contrast floors as data, not as magic numbers', () => {
    expect(ContrastFloor).toMatchObject({
      normalText: 4.5,
      largeText: 3,
      nonText: 3,
      increasedContrast: 7,
    });
  });

  test('exports the Atlas palette as data (004 C4-1)', () => {
    expect(PaletteNames).toHaveLength(4);
    expect(PaletteKeys.length).toBeGreaterThan(0);
    expect(Palettes.light.canvas).toMatch(/^#[0-9A-F]{6}$/);
  });

  test('exports the Atlas type, shape and motion tables as data (004 C4-6)', () => {
    expect(Object.keys(TextRoles)).toEqual(
      expect.arrayContaining(['largeTitle', 'body', 'numeric']),
    );
    expect(AtlasRadius.pill).toBe(999);
    expect(AtlasSpacing.twelve).toBe(12);
    expect(FocusRing).toEqual({ width: 2.5, offset: 2 });
    expect(Motion.transitionMs).toBe(200);
  });

  test('exports the platform query facade', () => {
    expect(platformQueries).toBeDefined();
  });

  test('the barrel re-exports work, not just types', () => {
    // A barrel that only re-exported types would compile and cover nothing.
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 4);
    expect(blend('#000000', '#FFFFFF', 1)).toBe('#000000');
    // The theme resolver (C4-4): the device scheme plus increased contrast selects the theme.
    expect(resolvePaletteName('dark', true)).toBe('dark-contrast');
  });
});
