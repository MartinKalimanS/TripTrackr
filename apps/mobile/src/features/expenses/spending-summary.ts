/**
 * The spending screen's derived view - feature 005, T550 (FR-047, FR-054; research D5-15, D5-17;
 * SC-016 of feature 001; pictures `more/expenses*.png`).
 *
 * A pure function from the summary the app already has (`summariseExpenses`: the converted rows
 * totalled in the home currency, the pending ones counted by their own currency) and the trip's
 * dates to what the three drawings need: the hero's total and the average per day, one bar per
 * day, and one slice per category. It reads no store and draws nothing.
 *
 * Money is exact: every sum is the summary's (`decimal.js`), the average is `total / days` in
 * `decimal.js` rounded half up to two places (the rule of `convertAmount`), and the whole-unit
 * labels under the bars are rounded the same way on the decimal string. No amount ever becomes a
 * binary number: the only `number`s here are RATIOS (a bar's height as a share of the tallest day,
 * a slice's percentage of the positive spending), which are drawing geometry and not money.
 *
 * Nothing is invented (owner answer Q-11): a row still awaiting a rate is counted in `pending`
 * and is in no total, bar, slice or average; an average exists only when there is converted
 * spending and at least one day of trip gone by; there is no budget anywhere.
 *
 * The days: one per calendar day of the trip (`range`, from the stops), widened to take in any
 * expense dated outside it so none disappears; with no trip dates, from the first expense to the
 * last. A span longer than `MAX_BAR_DAYS` draws only the days that have spending, so a mistyped
 * year cannot ask for ten thousand bars. A day is `today`, `past`, or `future` (still to come and
 * with nothing spent); a day's date is read as text and never through a time zone.
 */
import { SYSTEM_EXPENSE_CATEGORIES, type ExpenseSummary } from '@triptrackr/contracts';
import { Decimal } from 'decimal.js';

import { addDays, nightsBetween } from '@/features/trips/stop-dates';

/** More days than this and the bars show only the days with spending. */
export const MAX_BAR_DAYS = 120;

const AMOUNT_PLACES = 2;

export type DayKind = 'past' | 'today' | 'future';

export interface DayBar {
  /** `YYYY-MM-DD`. */
  date: string;
  /** The day of the month as the bar's label ("12"). */
  dayLabel: string;
  /** Exact home-currency total of the day's converted expenses; null for a day still to come. */
  total: string | null;
  /** `total` rounded half up to whole units, as a decimal string ("281"); null with it. */
  whole: string | null;
  /** How many converted expenses the day has. */
  count: number;
  /** 0 to 1: the day's share of the tallest day. 0 for a day with nothing, or a refund. */
  height: number;
  kind: DayKind;
}

export type CategoryTone =
  'food' | 'lodging' | 'transport' | 'activities' | 'shopping' | 'other' | 'custom';

export interface CategorySlice {
  id: string;
  name: string;
  /** Exact home-currency total of the category's converted expenses. */
  total: string;
  count: number;
  tone: CategoryTone;
  /** 0 to 100: the category's share of the positive spending; 0 for a refund-only category. */
  share: number;
}

export interface AverageSpend {
  /** Total over `days`, two places, half up. */
  amount: string;
  /** The days it is spread over. */
  days: number;
  /** "Day 3 of 8" while the trip is on; null once it is over or when it has no dates. */
  dayOf: { day: number; of: number } | null;
}

export interface PendingConversions {
  count: number;
  byCurrency: { currency: string; total: string; count: number }[];
}

export interface SpendingContext {
  /** The trip's first and last day (from its stops), or null when it has no dates. */
  range: { start: string; end: string } | null;
  /** The local calendar day, `YYYY-MM-DD`. */
  today: string;
}

export interface SpendingView {
  homeCurrency: string;
  /** Exact sum of the converted expenses. */
  total: string;
  /** At least one expense is converted and in `total`. */
  hasSpending: boolean;
  /** The trip is over (it has dates and today is after the last one). */
  ended: boolean;
  average: AverageSpend | null;
  days: DayBar[];
  /** The index of today in `days`; -1 when today is not one of them. */
  todayIndex: number;
  /** Biggest first, as the summary orders them. */
  slices: CategorySlice[];
  pending: PendingConversions;
}

const TONE_OF_ICON: Readonly<Record<string, CategoryTone>> = {
  food: 'food',
  lodging: 'lodging',
  transport: 'transport',
  activities: 'activities',
  shopping: 'shopping',
  other: 'other',
};

const SYSTEM_TONE: ReadonlyMap<string, CategoryTone> = new Map(
  SYSTEM_EXPENSE_CATEGORIES.map((category) => [
    category.id as string,
    TONE_OF_ICON[category.icon] ?? 'other',
  ]),
);

/** The tone of a category: a system one has its own, the traveller's own share `custom`. */
export function categoryTone(categoryId: string): CategoryTone {
  return SYSTEM_TONE.get(categoryId) ?? 'custom';
}

/** An amount rounded half up (away from zero on a tie) to whole units, as a decimal string. */
export function wholeUnits(amount: string): string {
  return new Decimal(amount).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
}

/** `part / whole` as a drawing ratio. Geometry, not money. */
function ratio(part: Decimal, whole: Decimal): number {
  if (!whole.gt(0) || !part.gt(0)) return 0;
  return part.div(whole).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

/** The day of the month from `YYYY-MM-DD`, without a leading zero. */
function dayOfMonth(date: string): string {
  return date.slice(8).replace(/^0/, '');
}

function spendDates(summary: ExpenseSummary): string[] {
  return summary.by_day.map((day) => day.date).sort();
}

/** Every calendar day from `first` to `last`, both counted. */
function everyDay(first: string, last: string): string[] {
  const length = nightsBetween(first, last) + 1;
  return Array.from({ length }, (_, index) => addDays(first, index));
}

/** The days the bars draw: see the module comment. */
function barDates(summary: ExpenseSummary, range: SpendingContext['range']): string[] {
  const spent = spendDates(summary);
  const firsts = [range?.start, spent[0]].filter((date): date is string => !!date);
  const lasts = [range?.end, spent[spent.length - 1]].filter(
    (date): date is string => !!date,
  );
  if (firsts.length === 0 || lasts.length === 0) return [];
  const first = firsts.reduce((a, b) => (a < b ? a : b));
  const last = lasts.reduce((a, b) => (a > b ? a : b));
  if (last < first) return spent;
  return nightsBetween(first, last) + 1 > MAX_BAR_DAYS ? spent : everyDay(first, last);
}

function kindOf(date: string, today: string, spent: boolean): DayKind {
  if (date === today) return 'today';
  return date > today && !spent ? 'future' : 'past';
}

function buildDays(
  summary: ExpenseSummary,
  context: SpendingContext,
): { days: DayBar[]; todayIndex: number } {
  const totals = new Map(summary.by_day.map((day) => [day.date, day]));
  const tallest = summary.by_day.reduce(
    (max, day) => Decimal.max(max, new Decimal(day.total_home)),
    new Decimal(0),
  );

  const days = barDates(summary, context.range).map((date): DayBar => {
    const day = totals.get(date);
    const kind = kindOf(date, context.today, day !== undefined);
    const total = kind === 'future' ? null : (day?.total_home ?? '0.00');
    return {
      date,
      dayLabel: dayOfMonth(date),
      total,
      whole: total === null ? null : wholeUnits(total),
      count: day?.count ?? 0,
      height: total === null ? 0 : ratio(new Decimal(total), tallest),
      kind,
    };
  });
  return { days, todayIndex: days.findIndex((day) => day.kind === 'today') };
}

function buildSlices(summary: ExpenseSummary): CategorySlice[] {
  const positive = summary.by_category.reduce(
    (sum, row) => (new Decimal(row.total_home).gt(0) ? sum.plus(row.total_home) : sum),
    new Decimal(0),
  );
  return summary.by_category.map((row) => ({
    id: row.category_id,
    name: row.name,
    total: row.total_home,
    count: row.count,
    tone: categoryTone(row.category_id),
    share: ratio(new Decimal(row.total_home), positive) * 100,
  }));
}

/** How many days the total is spread over, and where the trip stands; null for none yet. */
function daysGone(
  summary: ExpenseSummary,
  { range, today }: SpendingContext,
): { days: number; dayOf: AverageSpend['dayOf'] } | null {
  if (range) {
    if (today < range.start) return null;
    const length = nightsBetween(range.start, range.end) + 1;
    if (today > range.end) return { days: length, dayOf: null };
    const day = nightsBetween(range.start, today) + 1;
    return { days: day, dayOf: { day, of: length } };
  }
  const spent = spendDates(summary);
  const first = spent[0];
  const last = spent[spent.length - 1];
  if (!first || !last) return null;
  return { days: nightsBetween(first, last) + 1, dayOf: null };
}

function buildAverage(
  summary: ExpenseSummary,
  context: SpendingContext,
  hasSpending: boolean,
): AverageSpend | null {
  const gone = hasSpending ? daysGone(summary, context) : null;
  if (!gone || gone.days < 1) return null;
  const amount = new Decimal(summary.total_home)
    .div(gone.days)
    .toDecimalPlaces(AMOUNT_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(AMOUNT_PLACES);
  return { amount, days: gone.days, dayOf: gone.dayOf };
}

export function deriveSpendingView(
  summary: ExpenseSummary,
  context: SpendingContext,
): SpendingView {
  const hasSpending = summary.by_day.some((day) => day.count > 0);
  const { days, todayIndex } = buildDays(summary, context);
  return {
    homeCurrency: summary.home_currency,
    total: summary.total_home,
    hasSpending,
    ended: context.range !== null && context.today > context.range.end,
    average: buildAverage(summary, context, hasSpending),
    days,
    todayIndex,
    slices: buildSlices(summary),
    pending: {
      count: summary.pending_conversion.count,
      byCurrency: summary.pending_conversion.by_currency,
    },
  };
}
