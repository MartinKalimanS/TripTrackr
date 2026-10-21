/**
 * The amount-first form's two derived lines (feature 005, F6; add-expense.png): the
 * currency symbol before the figure and "≈ $26.62 at today's rate" under it. The
 * conversion is the repository's own (`crossRate`, `convertAmount`: decimal.js), the
 * text is the amount as typed read by `parseAmount`, and nothing is shown that the cached
 * snapshot cannot back.
 */
import { currencySymbol, extrasSummary, ratePreview } from '../amount-preview';

const SNAPSHOT = {
  asOf: '2026-10-14',
  source: 'test',
  rates: { EUR: '0.92', GBP: '0.79', JPY: '150' },
};

describe('currencySymbol', () => {
  test('is the symbol the locale writes for a known code', () => {
    expect(currencySymbol('EUR', 'en')).toBe('€');
    expect(currencySymbol('USD', 'en-US')).toBe('$');
  });

  test('falls back to the code for one Intl does not know, or a half-typed one', () => {
    expect(currencySymbol('XTS', 'en')).toBe('XTS');
    expect(currencySymbol('', 'en')).toBe('');
    expect(currencySymbol('E', 'en')).toBe('E');
  });
});

describe('ratePreview', () => {
  const base = {
    amount: '24.50',
    currency: 'EUR',
    home: 'USD',
    snapshot: SNAPSHOT,
    today: '2026-10-14',
    languageTag: 'en-US',
  };

  test('converts with the cached snapshot, in decimal arithmetic, "at today\'s rate"', () => {
    // 24.50 EUR -> USD: 24.50 / 0.92 = 26.630434... -> 26.63
    expect(ratePreview(base)).toBe("≈ $26.63 at today's rate");
  });

  test('reads the amount as typed with a comma too', () => {
    expect(ratePreview({ ...base, amount: '24,50' })).toBe("≈ $26.63 at today's rate");
  });

  test('says the date of the snapshot when it is not today', () => {
    expect(ratePreview({ ...base, today: '2026-10-16' })).toBe(
      '≈ $26.63 at the rate of 2026-10-14',
    );
  });

  test('is null with the same currency, no snapshot, a missing leg or no amount yet', () => {
    expect(ratePreview({ ...base, currency: 'USD' })).toBeNull();
    expect(ratePreview({ ...base, snapshot: null })).toBeNull();
    expect(ratePreview({ ...base, currency: 'CHF' })).toBeNull();
    expect(ratePreview({ ...base, amount: '' })).toBeNull();
    expect(ratePreview({ ...base, amount: 'abc' })).toBeNull();
    expect(ratePreview({ ...base, amount: '0' })).toBeNull();
  });

  test('keeps every cent of a large amount', () => {
    expect(
      ratePreview({
        ...base,
        amount: '1234567.89',
        snapshot: { ...SNAPSHOT, rates: { EUR: '1', USD: '1' } },
      }),
    ).toContain('1,234,567.89');
  });
});

describe('extrasSummary', () => {
  const base = {
    spentAt: '2026-10-14',
    today: '2026-10-14',
    place: 'Lisbon',
    hasNote: false,
    languageTag: 'en-GB',
  };

  test('says "Today" with the day and month, then the city', () => {
    expect(extrasSummary(base)).toBe('Today, 14 Oct · Lisbon');
  });

  test('another day is named by its weekday, with no "Today"', () => {
    expect(extrasSummary({ ...base, spentAt: '2026-10-12' })).toMatch(
      /^Mon,? 12 Oct · Lisbon$/,
    );
  });

  test('leaves the city out when there is none, and adds "Note" once one is written', () => {
    expect(extrasSummary({ ...base, place: null })).toBe('Today, 14 Oct');
    expect(extrasSummary({ ...base, hasNote: true })).toBe(
      'Today, 14 Oct · Lisbon · Note',
    );
  });
});
