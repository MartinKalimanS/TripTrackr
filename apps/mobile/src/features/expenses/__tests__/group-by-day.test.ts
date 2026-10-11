/**
 * 004 T441 (FR-014): expenses as grouped rows. The spending list shows one group per
 * calendar day, in the order the store returned the rows (newest spend first), so a
 * `FlashList` item is a day and a day's rows keep their order.
 */
import type { ExpenseRow } from '@/db/schema';

import { groupExpensesByDay } from '../group-by-day';

const row = (id: string, spent_at: string): ExpenseRow => ({
  id,
  trip_id: 't',
  city_id: null,
  category_id: 'c',
  amount: '1.00',
  currency: 'EUR',
  spent_at,
  note: null,
  fx_rate_to_home: null,
  amount_home: null,
  fx_pending: false,
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
});

describe('groupExpensesByDay', () => {
  test('no expenses is no groups', () => {
    expect(groupExpensesByDay([])).toEqual([]);
  });

  test('groups rows that share a calendar day, keeping the order of both the days and the rows', () => {
    const rows = [
      row('a', '2026-05-12'),
      row('b', '2026-05-12'),
      row('c', '2026-05-11'),
      row('d', '2026-05-10'),
    ];

    expect(groupExpensesByDay(rows)).toEqual([
      { date: '2026-05-12', expenses: [rows[0], rows[1]] },
      { date: '2026-05-11', expenses: [rows[2]] },
      { date: '2026-05-10', expenses: [rows[3]] },
    ]);
  });

  test('puts a day that comes back later with its first rows, so a day is never listed twice', () => {
    const rows = [row('a', '2026-05-12'), row('b', '2026-05-11'), row('c', '2026-05-12')];

    const days = groupExpensesByDay(rows);

    expect(days.map((day) => day.date)).toEqual(['2026-05-12', '2026-05-11']);
    expect(days[0]?.expenses.map((expense) => expense.id)).toEqual(['a', 'c']);
  });

  test('reads the day from the stored calendar string, never through a Date (no zone can move it)', () => {
    const days = groupExpensesByDay([row('a', '2026-12-31'), row('b', '2026-01-01')]);

    expect(days.map((day) => day.date)).toEqual(['2026-12-31', '2026-01-01']);
  });

  test('does not change the rows it is given', () => {
    const rows = [row('a', '2026-05-12')];
    const copy = [...rows];

    groupExpensesByDay(rows);

    expect(rows).toEqual(copy);
  });
});
