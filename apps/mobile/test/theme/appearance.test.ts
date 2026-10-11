/**
 * T008 — contract C4, research R-003.
 *
 * The per-platform mapping is the part of this feature most likely to be got
 * wrong from memory: "increased contrast" has no single cross-platform
 * accessor, and Android has no reduce-transparency setting at all. These are
 * pure functions taking an injected query facade precisely so the mapping can
 * be asserted without mocking React Native internals.
 */
import {
  accessibleFallbackFlags,
  appearanceChangeEvents,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
  readPrefersLessMotion,
  type AccessibilityQueries,
} from '@/theme/accessibility';

/** A facade where every query is present and records whether it was consulted. */
function makeQueries(
  overrides: Partial<Record<keyof AccessibilityQueries, boolean>> = {},
) {
  const called: string[] = [];
  const query = (name: keyof AccessibilityQueries, value: boolean) => async () => {
    called.push(name);
    return value;
  };
  const queries: AccessibilityQueries = {
    isReduceMotionEnabled: query(
      'isReduceMotionEnabled',
      overrides.isReduceMotionEnabled ?? false,
    ),
    isReduceTransparencyEnabled: query(
      'isReduceTransparencyEnabled',
      overrides.isReduceTransparencyEnabled ?? false,
    ),
    isDarkerSystemColorsEnabled: query(
      'isDarkerSystemColorsEnabled',
      overrides.isDarkerSystemColorsEnabled ?? false,
    ),
    isHighTextContrastEnabled: query(
      'isHighTextContrastEnabled',
      overrides.isHighTextContrastEnabled ?? false,
    ),
  };
  return { queries, called };
}

describe('readPrefersMoreContrast — FR-013', () => {
  test('reads isDarkerSystemColorsEnabled on iOS, not the Android accessor', async () => {
    const { queries, called } = makeQueries({ isDarkerSystemColorsEnabled: true });
    await expect(readPrefersMoreContrast('ios', queries)).resolves.toBe(true);
    expect(called).toContain('isDarkerSystemColorsEnabled');
    expect(called).not.toContain('isHighTextContrastEnabled');
  });

  test('reads isHighTextContrastEnabled on Android, not the iOS accessor', async () => {
    const { queries, called } = makeQueries({ isHighTextContrastEnabled: true });
    await expect(readPrefersMoreContrast('android', queries)).resolves.toBe(true);
    expect(called).toContain('isHighTextContrastEnabled');
    expect(called).not.toContain('isDarkerSystemColorsEnabled');
  });

  test('does not leak the other platform’s value', async () => {
    // iOS setting on, Android accessor off: Android must report false.
    const { queries } = makeQueries({
      isDarkerSystemColorsEnabled: true,
      isHighTextContrastEnabled: false,
    });
    await expect(readPrefersMoreContrast('android', queries)).resolves.toBe(false);
  });

  test('falls back to the more accessible value when the query is missing', async () => {
    // Contract C4: never fall back to the less accessible rendering.
    await expect(
      readPrefersMoreContrast('ios', {} as AccessibilityQueries),
    ).resolves.toBe(true);
  });

  test('falls back to the more accessible value when the query throws', async () => {
    const queries = {
      isDarkerSystemColorsEnabled: async () => {
        throw new Error('unavailable');
      },
    } as unknown as AccessibilityQueries;
    await expect(readPrefersMoreContrast('ios', queries)).resolves.toBe(true);
  });
});

describe('readPrefersLessTransparency — FR-014', () => {
  test('reads the iOS setting on iOS', async () => {
    const { queries } = makeQueries({ isReduceTransparencyEnabled: true });
    await expect(readPrefersLessTransparency('ios', queries)).resolves.toBe(true);
  });

  test('is structurally false on Android — the platform has no such setting', async () => {
    // research R-003: this is a recorded platform fact, not a missing feature.
    // The design is opaque by default, so there is nothing to disable.
    const { queries, called } = makeQueries({ isReduceTransparencyEnabled: true });
    await expect(readPrefersLessTransparency('android', queries)).resolves.toBe(false);
    expect(called).not.toContain('isReduceTransparencyEnabled');
  });

  test('is false on unknown platforms', async () => {
    const { queries } = makeQueries();
    await expect(readPrefersLessTransparency('web', queries)).resolves.toBe(false);
  });
});

describe('readPrefersLessMotion — FR-015', () => {
  test('uses the same accessor on both platforms', async () => {
    const ios = makeQueries({ isReduceMotionEnabled: true });
    const android = makeQueries({ isReduceMotionEnabled: true });
    await expect(readPrefersLessMotion('ios', ios.queries)).resolves.toBe(true);
    await expect(readPrefersLessMotion('android', android.queries)).resolves.toBe(true);
    expect(ios.called).toContain('isReduceMotionEnabled');
    expect(android.called).toContain('isReduceMotionEnabled');
  });

  test('falls back to the more accessible value when unavailable', async () => {
    await expect(readPrefersLessMotion('ios', {} as AccessibilityQueries)).resolves.toBe(
      true,
    );
  });
});

describe('accessibleFallbackFlags — contract C4, "never the less accessible one"', () => {
  test('on iOS every signal falls back to the more accessible value', () => {
    expect(accessibleFallbackFlags('ios')).toEqual({
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: true,
    });
  });

  test('on Android reduced transparency stays structurally false: the setting does not exist', () => {
    expect(accessibleFallbackFlags('android')).toEqual({
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: false,
    });
  });

  test('on an unknown platform only motion has a reader that falls back', () => {
    expect(accessibleFallbackFlags('unknown-os')).toEqual({
      prefersMoreContrast: false,
      prefersLessMotion: true,
      prefersLessTransparency: false,
    });
  });

  test.each(['ios', 'android', 'unknown-os'])(
    'is exactly what the three readers return when no query is available (%s)',
    async (os) => {
      const none = {} as AccessibilityQueries;
      await expect(
        Promise.all([
          readPrefersMoreContrast(os, none),
          readPrefersLessMotion(os, none),
          readPrefersLessTransparency(os, none),
        ]),
      ).resolves.toEqual(Object.values(accessibleFallbackFlags(os)));
    },
  );
});

describe('appearanceChangeEvents — contract C4 "every field updates live"', () => {
  /**
   * Found on device (T058): increased contrast was read correctly at mount but
   * never updated afterwards, because the resolver subscribed only to the
   * motion and transparency events. The contrast signal has its OWN event, and
   * it is named differently on each platform.
   */
  test('subscribes to the Android contrast event, which is highTextContrastChanged', () => {
    const events = appearanceChangeEvents('android');
    expect(events).toContain('highTextContrastChanged');
    expect(events).toContain('reduceMotionChanged');
  });

  test('subscribes to the iOS contrast event, which is darkerSystemColorsChanged', () => {
    const events = appearanceChangeEvents('ios');
    expect(events).toContain('darkerSystemColorsChanged');
    expect(events).toContain('reduceMotionChanged');
    expect(events).toContain('reduceTransparencyChanged');
  });

  test('does not subscribe to events the platform does not emit', () => {
    // Android has no reduce-transparency setting and never fires that event;
    // iOS does not emit the Android high-contrast event.
    expect(appearanceChangeEvents('android')).not.toContain('reduceTransparencyChanged');
    expect(appearanceChangeEvents('android')).not.toContain('darkerSystemColorsChanged');
    expect(appearanceChangeEvents('ios')).not.toContain('highTextContrastChanged');
  });

  test('every signal the context exposes has a corresponding subscription', () => {
    // theme and fontScale are derived elsewhere; the three
    // accessibility flags must each be covered or one of them goes stale.
    for (const os of ['ios', 'android'] as const) {
      const events = appearanceChangeEvents(os);
      const covers = (signal: string) =>
        events.some((e) => e.toLowerCase().includes(signal));
      expect(covers('motion')).toBe(true);
      expect(covers('contrast') || covers('darkersystemcolors')).toBe(true);
    }
  });

  test('returns an empty list for platforms with no such events', () => {
    expect(appearanceChangeEvents('web')).toEqual([]);
  });
});
