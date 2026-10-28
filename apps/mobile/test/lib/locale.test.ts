/**
 * Distance formatting for the globe's statistics (FR-050; research D-27, D-30).
 *
 * Whole units, grouped in the device locale, in the unit the device's
 * kilometres whatever the device's measurement system (owner decision 2026-10-24: the
 * app is metric everywhere) — with a spelled-out form for screen readers, which read
 * "km" letter by letter on some platforms.
 */
import { getLocales } from 'expo-localization';

import {
  deviceLocale,
  distanceFigure,
  formatDistance,
  type DeviceLocale,
} from '@/lib/locale';

function mockMeasuring(measurementSystem: 'us' | 'uk' | 'metric') {
  (getLocales as jest.Mock).mockReturnValueOnce([
    {
      languageTag: 'en-GB',
      decimalSeparator: '.',
      currencyCode: 'GBP',
      measurementSystem,
    },
  ]);
}

const locale = (overrides: Partial<DeviceLocale> = {}): DeviceLocale => ({
  languageTag: 'en-GB',
  decimalSeparator: '.',
  currencyCode: 'GBP',
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

  test('kilometres even when the device measures in miles', () => {
    mockMeasuring('us');
    expect(formatDistance(12345.6, deviceLocale())).toEqual({
      text: '12,346 km',
      spoken: '12,346 kilometres',
    });
  });

  test('one unit is singular when spoken', () => {
    expect(formatDistance(1.2, locale()).spoken).toBe('1 kilometre');
    expect(formatDistance(1.7, locale()).spoken).toBe('2 kilometres');
  });

  test('nothing travelled yet reads as zero, not as an empty string', () => {
    expect(formatDistance(0, locale())).toEqual({ text: '0 km', spoken: '0 kilometres' });
  });
});

describe('distanceFigure: the number and the unit apart, for a figure that counts up', () => {
  test('kilometres, rounded to whole units', () => {
    expect(distanceFigure(12345.6)).toEqual({
      value: 12346,
      unit: 'km',
      unitWord: 'kilometre',
    });
  });

  test('agrees with formatDistance, which is built on it', () => {
    for (const km of [0, 1.2, 999.5, 61480.4]) {
      const { value, unit } = distanceFigure(km);
      expect(formatDistance(km, locale()).text).toBe(
        `${new Intl.NumberFormat('en-GB').format(value)} ${unit}`,
      );
    }
  });
});

describe('deviceLocale — no measurement system', () => {
  test('does not carry one: distances never depend on it', () => {
    expect(Object.keys(deviceLocale())).not.toContain('measurementSystem');
  });
});
