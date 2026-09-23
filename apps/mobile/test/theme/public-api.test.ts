/**
 * Contract C7 — the token layer's public surface.
 *
 * Token NAMES are stable and `SurfaceTreatment` is a closed union: feature 001's
 * screens will be built against exactly these exports, so an accidental rename
 * or removal is a breaking change and should fail here rather than in a screen.
 */
import {
  ContrastFloor,
  contrastRatio,
  meetsFloor,
  platformQueries,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
  relativeLuminance,
  resolveElevationProfile,
  resolveInk,
  surfaceStyle,
} from '@/theme';

describe('token layer public API — contract C7', () => {
  test('exports every function downstream features depend on', () => {
    // Named imports rather than a namespace lookup: a removed export becomes a
    // compile error here, which is the earliest place it can possibly surface.
    for (const fn of [
      contrastRatio,
      relativeLuminance,
      meetsFloor,
      resolveElevationProfile,
      surfaceStyle,
      resolveInk,
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

  test('exports the platform query facade', () => {
    expect(platformQueries).toBeDefined();
  });

  test('the barrel re-exports work, not just types', () => {
    // A barrel that only re-exported types would compile and cover nothing.
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 4);
    expect(
      resolveElevationProfile({ os: 'ios', apiLevel: null, prefersMoreContrast: false }),
    ).toBe('full');
  });
});
