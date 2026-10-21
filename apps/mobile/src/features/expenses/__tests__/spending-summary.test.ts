/**
 * 005 T550 (FR-047; D5-15): the spending view derived from the summary the app already has.
 * Exact `decimal.js` sums (SC-016), per-day and per-category totals, pending conversions counted
 * and excluded, the average per day (only from real expenses) and no `Number` on an amount.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { Decimal } from 'decimal.js';
import { readFileSync } from 'fs';
import path from 'path';

import { categoryOptions, summariseExpenses } from '@/db/repositories/expenses';
import type { ExpenseRow } from '@/db/schema';

import {
  MAX_BAR_DAYS,
  categoryTone,
  deriveSpendingView,
  wholeUnits,
} from '../spending-summary';

const [FOOD, LODGING, TRANSPORT, ACTIVITIES, SHOPPING, OTHER] =
  SYSTEM_EXPENSE_CATEGORIES.map((c) => c.id);

const CUSTOM = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';

const options = categoryOptions([
  {
    id: CUSTOM,
    name: 'Coffee',
    icon: null,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
  },
]);

function row(over: Partial<ExpenseRow> & { id: string }): ExpenseRow {
  return {
    trip_id: 't',
    city_id: null,
    category_id: FOOD!,
    amount: '1.00',
    currency: 'CHF',
    spent_at: '2026-10-12',
    note: null,
    fx_rate_to_home: '1.000000',
    amount_home: '1.00',
    fx_pending: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    ...over,
  };
}

const view = (
  rows: ExpenseRow[],
  context: { range: { start: string; end: string } | null; today: string },
  home = 'CHF',
) => deriveSpendingView(summariseExpenses(rows, home, options, null), context);

const TRIP = { start: '2026-10-12', end: '2026-10-19' };

describe('deriveSpendingView: the pictured trip (Day 3 of 8)', () => {
  const rows = [
    row({ id: 'a', spent_at: '2026-10-12', amount_home: '310.00' }),
    row({ id: 'b', spent_at: '2026-10-13', amount_home: '252.00' }),
    row({
      id: 'c',
      spent_at: '2026-10-14',
      amount_home: '280.00',
      category_id: TRANSPORT!,
    }),
  ];
  const result = view(rows, { range: TRIP, today: '2026-10-14' });

  test('the total is the exact sum of the converted rows', () => {
    expect(result.total).toBe('842.00');
    expect(result.homeCurrency).toBe('CHF');
    expect(result.hasSpending).toBe(true);
  });

  test('the average per day is the total over the days gone, half up to two places', () => {
    expect(result.average).toEqual({
      amount: '280.67',
      days: 3,
      dayOf: { day: 3, of: 8 },
    });
  });

  test('one bar per day of the trip, today marked, the rest of the trip still to come', () => {
    expect(result.days.map((d) => d.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    expect(result.days.map((d) => d.kind)).toEqual([
      'past',
      'past',
      'today',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(result.days.map((d) => d.dayLabel)).toEqual([
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
    ]);
    expect(result.days.map((d) => d.total)).toEqual([
      '310.00',
      '252.00',
      '280.00',
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result.days.map((d) => d.whole)).toEqual([
      '310',
      '252',
      '280',
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result.todayIndex).toBe(2);
  });

  test('bar heights are shares of the tallest day, never an amount', () => {
    expect(result.days[0]!.height).toBe(1);
    expect(result.days[1]!.height).toBeCloseTo(252 / 310, 4);
    expect(result.days[2]!.height).toBeCloseTo(280 / 310, 4);
    expect(result.days[3]!.height).toBe(0);
  });

  test('the category bar: shares of the positive totals, biggest first, with a tone each', () => {
    expect(result.slices.map((s) => [s.name, s.total, s.tone])).toEqual([
      ['Food', '562.00', 'food'],
      ['Transport', '280.00', 'transport'],
    ]);
    expect(result.slices[0]!.share).toBeCloseTo(66.75, 2);
    expect(result.slices[1]!.share).toBeCloseTo(33.25, 2);
    expect(result.slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(100, 2);
  });
});

describe('deriveSpendingView: conversions that are still pending', () => {
  const rows = [
    row({ id: 'a', amount_home: '10.00' }),
    row({
      id: 'p',
      currency: 'XTS',
      amount: '99.00',
      amount_home: null,
      fx_rate_to_home: null,
      fx_pending: true,
    }),
  ];

  test('a pending row is counted, and never in a total, a bar, a slice or the average', () => {
    const result = view(rows, { range: TRIP, today: '2026-10-12' });
    expect(result.total).toBe('10.00');
    expect(result.pending).toEqual({
      count: 1,
      byCurrency: [{ currency: 'XTS', total: '99.00', count: 1 }],
    });
    expect(result.days[0]!.total).toBe('10.00');
    expect(result.slices).toHaveLength(1);
    expect(result.average).toEqual({
      amount: '10.00',
      days: 1,
      dayOf: { day: 1, of: 8 },
    });
  });

  test('only pending rows: no total to speak of, no average, no bars of spending', () => {
    const result = view([rows[1]!], { range: TRIP, today: '2026-10-14' });
    expect(result.hasSpending).toBe(false);
    expect(result.total).toBe('0.00');
    expect(result.average).toBeNull();
    expect(result.slices).toEqual([]);
    expect(result.pending.count).toBe(1);
  });
});

describe('deriveSpendingView: the days of the bars', () => {
  test('no expenses and no trip dates: nothing to draw, nothing invented', () => {
    const result = view([], { range: null, today: '2026-10-14' });
    expect(result.days).toEqual([]);
    expect(result.average).toBeNull();
    expect(result.hasSpending).toBe(false);
    expect(result.total).toBe('0.00');
  });

  test('no expenses on a dated trip still draws its days, all empty, no average', () => {
    const result = view([], { range: TRIP, today: '2026-10-14' });
    expect(result.days).toHaveLength(8);
    expect(result.days.every((d) => d.height === 0)).toBe(true);
    expect(result.days[1]!.whole).toBe('0');
    expect(result.average).toBeNull();
  });

  test('a trip that has not begun: every day is to come and there is no average', () => {
    const result = view([row({ id: 'a' })], { range: TRIP, today: '2026-10-01' });
    expect(result.days.every((d) => d.kind === 'future' || d.total !== null)).toBe(true);
    expect(result.average).toBeNull();
    expect(result.todayIndex).toBe(-1);
  });

  test('a trip that has ended: the average is over every day of it and says so', () => {
    const result = view([row({ id: 'a', amount_home: '800.00' })], {
      range: TRIP,
      today: '2026-11-01',
    });
    expect(result.average).toEqual({ amount: '100.00', days: 8, dayOf: null });
    expect(result.ended).toBe(true);
    expect(result.days.every((d) => d.kind === 'past')).toBe(true);
  });

  test('without trip dates the days run from the first expense to the last', () => {
    const result = view(
      [
        row({ id: 'a', spent_at: '2026-10-12', amount_home: '10.00' }),
        row({ id: 'b', spent_at: '2026-10-15', amount_home: '20.00' }),
      ],
      { range: null, today: '2026-10-20' },
    );
    expect(result.days.map((d) => d.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ]);
    expect(result.days.map((d) => d.whole)).toEqual(['10', '0', '0', '20']);
    expect(result.average).toEqual({ amount: '7.50', days: 4, dayOf: null });
  });

  test('an expense outside the trip dates widens the bars rather than vanishing', () => {
    const result = view([row({ id: 'a', spent_at: '2026-10-10', amount_home: '5.00' })], {
      range: TRIP,
      today: '2026-10-14',
    });
    expect(result.days[0]!.date).toBe('2026-10-10');
    expect(result.days[0]!.total).toBe('5.00');
    expect(result.days).toHaveLength(10);
  });

  test('a very long span draws only the days with spending', () => {
    const result = view(
      [
        row({ id: 'a', spent_at: '2026-01-01', amount_home: '5.00' }),
        row({ id: 'b', spent_at: '2026-10-01', amount_home: '7.00' }),
      ],
      { range: null, today: '2026-10-14' },
    );
    expect(MAX_BAR_DAYS).toBeLessThan(273);
    expect(result.days.map((d) => d.date)).toEqual(['2026-01-01', '2026-10-01']);
  });

  test('a refund (negative day) has no bar height and a negative amount label', () => {
    const result = view(
      [
        row({ id: 'a', spent_at: '2026-10-12', amount_home: '30.00' }),
        row({ id: 'b', spent_at: '2026-10-13', amount_home: '-4.00' }),
      ],
      { range: TRIP, today: '2026-10-14' },
    );
    expect(result.days[1]!.total).toBe('-4.00');
    expect(result.days[1]!.whole).toBe('-4');
    expect(result.days[1]!.height).toBe(0);
  });
});

describe('money exactness across currency combinations (SC-016)', () => {
  test('0.10 + 0.20 is 0.30, in the total, the day and the category', () => {
    const result = view(
      [row({ id: 'a', amount_home: '0.10' }), row({ id: 'b', amount_home: '0.20' })],
      { range: null, today: '2026-10-12' },
    );
    expect(result.total).toBe('0.30');
    expect(result.days[0]!.total).toBe('0.30');
    expect(result.slices[0]!.total).toBe('0.30');
  });

  test('the largest amount a column holds plus one cent is exact', () => {
    const result = view(
      [
        row({ id: 'a', amount_home: '9999999999.98' }),
        row({ id: 'b', amount_home: '0.01' }),
      ],
      { range: null, today: '2026-10-12' },
    );
    expect(result.total).toBe('9999999999.99');
  });

  test.each([
    ['EUR', 'CHF', '0.934567', '10.00', '9.35'],
    ['USD', 'JPY', '149.500000', '12.34', '1844.83'],
    ['JPY', 'EUR', '0.006100', '1500.00', '9.15'],
    ['GBP', 'GBP', '1.000000', '3.33', '3.33'],
  ])(
    '%s into %s: three rows sum to exactly what each row froze',
    (cur, home, rate, amount, converted) => {
      const rows = ['a', 'b', 'c'].map((id) =>
        row({
          id,
          currency: cur,
          amount,
          fx_rate_to_home: rate,
          amount_home: converted,
        }),
      );
      const result = view(rows, { range: null, today: '2026-10-12' }, home);
      expect(result.total).toBe(new Decimal(converted).times(3).toFixed(2));
      expect(result.homeCurrency).toBe(home);
    },
  );

  test('the average rounds half up, exactly: 0.05 over 2 days is 0.03, 0.01 over 3 is 0.00', () => {
    const half = view([row({ id: 'a', amount_home: '0.05' })], {
      range: { start: '2026-10-12', end: '2026-10-13' },
      today: '2026-10-13',
    });
    expect(half.average!.amount).toBe('0.03');
    const third = view([row({ id: 'a', amount_home: '0.01' })], {
      range: { start: '2026-10-12', end: '2026-10-14' },
      today: '2026-10-14',
    });
    expect(third.average!.amount).toBe('0.00');
  });

  test('mixed signs: a refund lowers the total exactly', () => {
    const result = view(
      [row({ id: 'a', amount_home: '10.10' }), row({ id: 'b', amount_home: '-0.10' })],
      { range: null, today: '2026-10-12' },
    );
    expect(result.total).toBe('10.00');
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0]!.share).toBe(100);
  });

  test('wholeUnits rounds half up on the decimal string, in both signs', () => {
    expect(wholeUnits('280.50')).toBe('281');
    expect(wholeUnits('280.49')).toBe('280');
    expect(wholeUnits('0.00')).toBe('0');
    expect(wholeUnits('-4.00')).toBe('-4');
    expect(wholeUnits('9999999999.99')).toBe('10000000000');
  });

  test('the module never turns an amount into a binary number', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../spending-summary.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/\bNumber\(|parseFloat|parseInt|Math\.round|\+amount/);
    expect(source).toMatch(/from 'decimal\.js'/);
  });
});

describe('categoryTone', () => {
  test('each system category has its own tone, anything else is a custom one', () => {
    expect(
      [FOOD, LODGING, TRANSPORT, ACTIVITIES, SHOPPING, OTHER].map((id) =>
        categoryTone(id!),
      ),
    ).toEqual(['food', 'lodging', 'transport', 'activities', 'shopping', 'other']);
    expect(categoryTone(CUSTOM)).toBe('custom');
  });

  test('a custom category is named and kept in the legend and the bar', () => {
    const result = view(
      [
        row({ id: 'a', category_id: CUSTOM, amount_home: '3.00' }),
        row({ id: 'b', category_id: FOOD!, amount_home: '1.00' }),
      ],
      { range: null, today: '2026-10-12' },
    );
    expect(result.slices.map((s) => [s.name, s.tone])).toEqual([
      ['Coffee', 'custom'],
      ['Food', 'food'],
    ]);
  });
});
