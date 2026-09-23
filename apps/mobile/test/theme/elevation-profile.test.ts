/**
 * T007 — contract C5, data-model §3.
 *
 * The profile resolver is where Android's capability tiers and the
 * increased-contrast requirement are collapsed into one decision, so that no
 * call site ever branches on OS version. Pure and total, therefore testable
 * without a device.
 */
import { resolveElevationProfile } from '@/theme/elevation-profile';

describe('resolveElevationProfile', () => {
  describe('iOS', () => {
    test('resolves to full — inset and outset shadows are both supported', () => {
      expect(
        resolveElevationProfile({
          os: 'ios',
          apiLevel: null,
          prefersMoreContrast: false,
        }),
      ).toBe('full');
    });
  });

  describe('Android capability tiers (research R-001)', () => {
    test('API 29+ resolves to full — inset shadows available', () => {
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 29,
          prefersMoreContrast: false,
        }),
      ).toBe('full');
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 34,
          prefersMoreContrast: false,
        }),
      ).toBe('full');
    });

    test('API 28 resolves to reduced — outset only, no inset', () => {
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 28,
          prefersMoreContrast: false,
        }),
      ).toBe('reduced');
    });

    test('API 27 and below resolves to flat — boxShadow unsupported', () => {
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 27,
          prefersMoreContrast: false,
        }),
      ).toBe('flat');
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 24,
          prefersMoreContrast: false,
        }),
      ).toBe('flat');
    });
  });

  describe('increased contrast (FR-013)', () => {
    test('overrides every platform to reduced, so borders are rendered', () => {
      expect(
        resolveElevationProfile({ os: 'ios', apiLevel: null, prefersMoreContrast: true }),
      ).toBe('reduced');
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 34,
          prefersMoreContrast: true,
        }),
      ).toBe('reduced');
    });

    test('never upgrades a flat device to reduced', () => {
      // A device that cannot draw shadows at all must not be handed a profile
      // that assumes it can, even when asking for more contrast.
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: 26,
          prefersMoreContrast: true,
        }),
      ).toBe('flat');
    });
  });

  describe('totality (contract C5)', () => {
    test('web resolves to full — composed and inset shadows are supported', () => {
      // react-native-web 0.21 supports both (research R-008.2, confirmed from
      // preprocess.js rather than assumed).
      expect(
        resolveElevationProfile({
          os: 'web',
          apiLevel: null,
          prefersMoreContrast: false,
        }),
      ).toBe('full');
    });

    test('genuinely unknown platforms resolve to flat rather than throwing', () => {
      expect(
        resolveElevationProfile({
          os: 'windows',
          apiLevel: null,
          prefersMoreContrast: false,
        }),
      ).toBe('flat');
      expect(
        resolveElevationProfile({
          os: 'macos',
          apiLevel: null,
          prefersMoreContrast: false,
        }),
      ).toBe('flat');
    });

    test('android with an unknown api level resolves to flat', () => {
      expect(
        resolveElevationProfile({
          os: 'android',
          apiLevel: null,
          prefersMoreContrast: false,
        }),
      ).toBe('flat');
    });

    test('is monotonic in capability across the android range', () => {
      const rank = { flat: 0, reduced: 1, full: 2 } as const;
      let previous = -1;
      for (let apiLevel = 21; apiLevel <= 36; apiLevel++) {
        const current =
          rank[
            resolveElevationProfile({
              os: 'android',
              apiLevel,
              prefersMoreContrast: false,
            })
          ];
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
    });

    test('is deterministic', () => {
      const input = { os: 'android' as const, apiLevel: 29, prefersMoreContrast: false };
      expect(resolveElevationProfile(input)).toBe(resolveElevationProfile(input));
    });
  });
});
