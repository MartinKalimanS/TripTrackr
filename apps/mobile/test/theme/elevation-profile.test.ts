/**
 * T007, amended by 004 T411 (research D4-12).
 *
 * The profile resolver used to collapse Android's shadow capability tiers and the
 * increased-contrast preference into one decision. The Atlas look has no soft shadows,
 * so until the neumorphic primitives are deleted (phase 7) every device resolves to
 * `flat`: an unconverted screen renders with its shadows collapsed and its boundaries
 * carried by the stronger border instead. The resolver stays pure, total and
 * deterministic so the call sites need no change.
 */
import { resolveElevationProfile, type ElevationInput } from '@/theme/elevation-profile';

const PLATFORMS: ElevationInput[] = [
  { os: 'ios', apiLevel: null, prefersMoreContrast: false },
  { os: 'ios', apiLevel: null, prefersMoreContrast: true },
  { os: 'android', apiLevel: 36, prefersMoreContrast: false },
  { os: 'android', apiLevel: 34, prefersMoreContrast: true },
  { os: 'android', apiLevel: 29, prefersMoreContrast: false },
  { os: 'android', apiLevel: 28, prefersMoreContrast: false },
  { os: 'android', apiLevel: 27, prefersMoreContrast: false },
  { os: 'android', apiLevel: 24, prefersMoreContrast: true },
  { os: 'android', apiLevel: null, prefersMoreContrast: false },
  { os: 'web', apiLevel: null, prefersMoreContrast: false },
  { os: 'windows', apiLevel: null, prefersMoreContrast: false },
  { os: 'macos', apiLevel: null, prefersMoreContrast: true },
];

describe('resolveElevationProfile — forced flat (004 D4-12)', () => {
  test.each(PLATFORMS)('resolves to flat for %j', (input) => {
    expect(resolveElevationProfile(input)).toBe('flat');
  });

  test('never promotes a capable device to a shadowed profile', () => {
    // The old behaviour: iOS and Android 29+ resolved to `full`, API 28 to `reduced`,
    // and increased contrast to `reduced`. None of that survives the Atlas look.
    for (const apiLevel of [28, 29, 30, 34, 36]) {
      for (const prefersMoreContrast of [false, true]) {
        expect(
          resolveElevationProfile({ os: 'android', apiLevel, prefersMoreContrast }),
        ).toBe('flat');
      }
    }
  });

  test('is total: an unknown platform or api level resolves rather than throwing', () => {
    expect(() =>
      resolveElevationProfile({ os: 'plan9', apiLevel: -1, prefersMoreContrast: false }),
    ).not.toThrow();
  });

  test('is deterministic', () => {
    const input = { os: 'android', apiLevel: 29, prefersMoreContrast: false };
    expect(resolveElevationProfile(input)).toBe(resolveElevationProfile(input));
  });
});
