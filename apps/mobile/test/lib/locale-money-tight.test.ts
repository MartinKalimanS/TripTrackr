/**
 * The spending figures of the pictures (feature 005, T550): "€842" for a whole amount, "€14.80"
 * for the rest, the currency sign cut out for the hero's raised sign, whole-unit labels under a
 * bar. Nothing is rounded: only zeros are left out.
 */
import { formatMoneyParts, formatMoneyTight, formatWholeUnits } from '@/lib/locale';

describe('formatMoneyTight', () => {
  test('a whole amount loses its zero fraction, nothing else does', () => {
    expect(formatMoneyTight('842.00', 'EUR', 'en-GB')).toBe('€842');
    expect(formatMoneyTight('842', 'EUR', 'en-GB')).toBe('€842');
    expect(formatMoneyTight('14.80', 'EUR', 'en-GB')).toBe('€14.80');
    expect(formatMoneyTight('0.05', 'USD', 'en-US')).toBe('$0.05');
    expect(formatMoneyTight('-4.00', 'USD', 'en-US')).toBe('-$4');
  });

  test('a currency with no fraction, a locale with the sign after, an unknown code', () => {
    expect(formatMoneyTight('1500.00', 'JPY', 'en-GB')).toBe('JP¥1,500');
    expect(formatMoneyTight('842.00', 'EUR', 'de-DE')).toMatch(/^842\s€$/);
    expect(formatMoneyTight('5.00', 'NOTACODE', 'en-GB')).toBe('5 NOTACODE');
    expect(formatMoneyTight('5.50', 'NOTACODE', 'en-GB')).toBe('5.50 NOTACODE');
  });
});

describe('formatMoneyParts', () => {
  test('cuts the text at the sign: before, sign, after', () => {
    expect(formatMoneyParts('842.00', 'EUR', 'en-GB')).toEqual({
      before: '',
      symbol: '€',
      after: '842',
    });
    const german = formatMoneyParts('842.00', 'EUR', 'de-DE');
    expect(german.before).toBe('842\u00a0');
    expect(german.symbol).toBe('€');
    expect(german.after).toBe('');
  });

  test('the three pieces always spell what formatMoneyTight says', () => {
    for (const [amount, currency, tag] of [
      ['842.00', 'EUR', 'en-GB'],
      ['14.80', 'CHF', 'de-CH'],
      ['-3.00', 'USD', 'en-US'],
      ['5.00', 'XTS', 'en-GB'],
    ] as const) {
      const parts = formatMoneyParts(amount, currency, tag);
      expect(parts.before + parts.symbol + parts.after).toBe(
        formatMoneyTight(amount, currency, tag),
      );
    }
  });

  test('without formatToParts the whole text is the first piece', () => {
    const original = Intl.NumberFormat.prototype.formatToParts;
    // @ts-expect-error simulating an engine without the method
    Intl.NumberFormat.prototype.formatToParts = undefined;
    try {
      expect(formatMoneyParts('842.00', 'GBP', 'en-AU')).toEqual({
        before: 'GBP\u00a0842',
        symbol: '',
        after: '',
      });
    } finally {
      Intl.NumberFormat.prototype.formatToParts = original;
    }
  });
});

describe('formatWholeUnits', () => {
  test('groups for the locale and keeps the sign', () => {
    expect(formatWholeUnits('281', 'en-GB')).toBe('281');
    expect(formatWholeUnits('12345', 'en-GB')).toBe('12,345');
    expect(formatWholeUnits('-4', 'en-GB')).toBe('-4');
  });
});
