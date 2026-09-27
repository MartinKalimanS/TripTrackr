/**
 * Money arithmetic shared by both apps (research D-26; SC-016).
 *
 * Every number is a decimal string in and a decimal string out; nothing
 * passes through a JavaScript `number`. The cases pin the two rounding rules
 * the schema fixes — six places for a rate, two for an amount, half-up — the
 * arithmetic of a cross rate from a USD-based snapshot (research D-28), and
 * how a typed amount is read regardless of the traveller's keypad (D-27).
 */
import {
  DecimalString,
  RateString,
  compareAmounts,
  convertAmount,
  crossRate,
  fitsAmountColumn,
  fitsRateColumn,
  formatRate,
  parseAmount,
  sumAmounts,
} from '../src';

describe('crossRate', () => {
  const usd = { USD: '1', EUR: '0.900000', CHF: '0.800000', JPY: '150.000000' };

  it('is 1 for a currency against itself, without consulting the snapshot', () => {
    expect(crossRate({}, 'EUR', 'EUR')).toBe('1.000000');
  });

  it('divides the two USD legs and rounds half-up to six places', () => {
    expect(crossRate(usd, 'EUR', 'CHF')).toBe('0.888889');
    expect(crossRate(usd, 'CHF', 'EUR')).toBe('1.125000');
    expect(crossRate(usd, 'JPY', 'CHF')).toBe('0.005333');
  });

  it('reads USD itself as a leg of 1', () => {
    expect(crossRate(usd, 'USD', 'CHF')).toBe('0.800000');
    expect(crossRate(usd, 'CHF', 'USD')).toBe('1.250000');
  });

  it('is null when either leg is missing — the caller marks the row fx_pending', () => {
    expect(crossRate(usd, 'XTS', 'CHF')).toBeNull();
    expect(crossRate(usd, 'CHF', 'XTS')).toBeNull();
    expect(crossRate({}, 'EUR', 'CHF')).toBeNull();
  });

  it('never produces a rate the wire would refuse', () => {
    const rate = crossRate({ USD: '1', ABC: '100000000', CHF: '0.000001' }, 'ABC', 'CHF');
    expect(rate).toBeNull();
    expect(RateString.safeParse(crossRate(usd, 'JPY', 'CHF')).success).toBe(true);
  });
});

describe('convertAmount', () => {
  it('multiplies and rounds half-up to two places', () => {
    expect(convertAmount('9.00', '0.888889')).toBe('8.00');
    expect(convertAmount('20.00', '0.888889')).toBe('17.78');
    expect(convertAmount('1.005', '1.000000')).toBe('1.01');
    expect(convertAmount('0.10', '0.049999')).toBe('0.00');
  });

  it('keeps the sign of a refund and pads to two decimals', () => {
    expect(convertAmount('-3', '1.125000')).toBe('-3.38');
    expect(convertAmount('5', '1.000000')).toBe('5.00');
    expect(DecimalString.safeParse(convertAmount('5', '1.000000')).success).toBe(true);
  });

  it('never rounds through binary floating point', () => {
    expect(convertAmount('1.15', '1.000000')).toBe('1.15');
    expect(convertAmount('2.675', '1.000000')).toBe('2.68');
  });
});

describe('sumAmounts', () => {
  it('sums exactly — 0.1 + 0.2 is 0.30, not 0.30000000000000004', () => {
    expect(sumAmounts(['0.10', '0.20'])).toBe('0.30');
    expect(sumAmounts(['10.00', '5.50', '8.00'])).toBe('23.50');
    expect(sumAmounts([])).toBe('0.00');
    expect(sumAmounts(['-3.00', '3.00'])).toBe('0.00');
  });
});

describe('compareAmounts', () => {
  it('orders decimal strings by value, not by text', () => {
    expect(['9.50', '10.00', '-3.00', '10.00'].sort(compareAmounts)).toEqual([
      '-3.00',
      '9.50',
      '10.00',
      '10.00',
    ]);
    expect(compareAmounts('1.10', '1.1')).toBe(0);
  });
});

describe('formatRate', () => {
  it('normalises a feed number or string to six decimals', () => {
    expect(formatRate(0.877372)).toBe('0.877372');
    expect(formatRate('158.127269')).toBe('158.127269');
    expect(formatRate(1)).toBe('1.000000');
    expect(formatRate(25961.694126)).toBe('25961.694126');
  });

  it('refuses zero, negatives, rates too small to carry, and non-numbers', () => {
    expect(formatRate(0)).toBeNull();
    expect(formatRate(-1)).toBeNull();
    expect(formatRate(0.0000001)).toBeNull();
    expect(formatRate(Number.NaN)).toBeNull();
    expect(formatRate('abc')).toBeNull();
  });
});

describe('parseAmount (research D-27)', () => {
  it.each([
    ['12.50', '12.50'],
    ['12,50', '12.50'],
    ['12', '12.00'],
    ['0.5', '0.50'],
    ['1,234.50', '1234.50'],
    ['1.234,50', '1234.50'],
    ['1 234,50', '1234.50'],
    ["1'234.50", '1234.50'],
    ['1,234', '1234.00'],
    ['1.234', '1234.00'],
    ['1,234,567', '1234567.00'],
    ['-3.20', '-3.20'],
    [' 7 ', '7.00'],
  ])('reads %p as %p', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
    expect(DecimalString.safeParse(parseAmount(input)).success).toBe(true);
  });

  it.each(['', 'abc', '12.3456', '1,2,3.4', '12..5', '--3', '1e3', '12,5.0', '1,23,456'])(
    'refuses %p rather than guessing',
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );
});

describe('column bounds', () => {
  it.each([
    ['9999999999.99', true],
    ['-9999999999.99', true],
    ['10000000000.00', false],
    ['1e30', false],
    ['nope', false],
  ])('fitsAmountColumn(%p) is %p', (input, expected) => {
    expect(fitsAmountColumn(input)).toBe(expected);
  });

  it.each([
    ['0.000001', true],
    ['99999999.999999', true],
    ['100000000.000000', false],
    ['0', false],
    ['-1', false],
    ['x', false],
  ])('fitsRateColumn(%p) is %p', (input, expected) => {
    expect(fitsRateColumn(input)).toBe(expected);
  });
});
