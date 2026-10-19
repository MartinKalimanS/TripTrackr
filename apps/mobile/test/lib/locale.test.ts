/**
 * Distance formatting for the globe's statistics (FR-050; research D-27, D-30).
 *
 * Whole units, grouped in the device locale, in the unit the device's
 * measurement system uses for travel distances — kilometres, or miles in the
 * US and the UK — with a spelled-out form for screen readers, which read
 * "km" letter by letter on some platforms.
 */
import { getLocales } from 'expo-localization';

import {
  deviceLocale,
  distanceFigure,
  formatDistance,
  type DeviceLocale,
} from '@/lib/locale';

const locale = (overrides: Partial<DeviceLocale> = {}): DeviceLocale => ({
  languageTag: 'en-GB',
  decimalSeparator: '.',
  currencyCode: 'GBP',
  measurementSystem: 'metric',
  ...overrides,
});

describe('formatDistance', () => {
  test('whole kilometres, grouped in the device locale', () => {
    expect(formatDistance(12345.6, locale())).toEqual({
      text: '12,346 km',
      spoken: '12,346 kilometres',
    });
    expect(formatDistance(12345.6, locale({ languageTag: 'de-DE' })).text).toBe(
      '12.346 km',
    );
  });

  test.each(['us', 'uk'] as const)(
    'miles where the measurement system is %s',
    (system) => {
      expect(formatDistance(12345.6, locale({ measurementSystem: system }))).toEqual({
        text: '7,671 mi',
        spoken: '7,671 miles',
      });
    },
  );

  test('one unit is singular when spoken', () => {
    expect(formatDistance(1.2, locale()).spoken).toBe('1 kilometre');
    expect(formatDistance(1.7, locale({ measurementSystem: 'us' })).spoken).toBe(
      '1 mile',
    );
  });

  test('nothing travelled yet reads as zero, not as an empty string', () => {
    expect(formatDistance(0, locale())).toEqual({ text: '0 km', spoken: '0 kilometres' });
  });
});

describe('distanceFigure: the number and the unit apart, for a figure that counts up', () => {
  test('kilometres, rounded to whole units', () => {
    expect(distanceFigure(12345.6, locale())).toEqual({
      value: 12346,
      unit: 'km',
      unitWord: 'kilometre',
    });
  });

  test.each(['us', 'uk'] as const)(
    'miles where the measurement system is %s',
    (system) => {
      expect(distanceFigure(12345.6, locale({ measurementSystem: system }))).toEqual({
        value: 7671,
        unit: 'mi',
        unitWord: 'mile',
      });
    },
  );

  test('agrees with formatDistance, which is built on it', () => {
    for (const km of [0, 1.2, 999.5, 61480.4]) {
      const { value, unit } = distanceFigure(km, locale());
      expect(formatDistance(km, locale()).text).toBe(
        `${new Intl.NumberFormat('en-GB').format(value)} ${unit}`,
      );
    }
  });
});

describe('deviceLocale — measurement system', () => {
  test('is read from expo-localization', () => {
    expect(deviceLocale().measurementSystem).toBe('metric');
  });

  test('falls back to metric when the platform cannot say', () => {
    (getLocales as jest.Mock).mockReturnValueOnce([
      { languageTag: 'en-US', decimalSeparator: '.', measurementSystem: null },
    ]);
    expect(deviceLocale().measurementSystem).toBe('metric');
  });
});
