/**
 * The spending screen's parts as pictured (feature 005, T550; FR-047; research D5-15; owner answer
 * Q-11; pictures `more/expenses*.png`): the hero, the pill, the rate line, the per-day bars, the
 * category bar and legend, the rows and their days, the header and the skeleton. The rules that
 * derive the figures are in `src/features/expenses/__tests__/spending-summary.test.ts`; this suite
 * pins that the components draw them, with no figure of their own.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { CategoryBar, describeShares } from '@/components/trip/category-bar';
import { DayBars, columnWidth, describeChart } from '@/components/trip/day-bars';
import { ExpenseDayGroup } from '@/components/trip/expense-day-group';
import { ExpenseRow as ExpenseRowView } from '@/components/trip/expense-row';
import { ExpensesHeader, expensesSubtitle } from '@/components/trip/expenses-header';
import { SpendingHero, averageWords, heroLabel } from '@/components/trip/spending-hero';
import { SpendingSkeleton } from '@/components/trip/spending-skeleton';
import { SpendingSummary } from '@/components/trip/spending-summary';
import { categoryOptions, summariseExpenses } from '@/db/repositories/expenses';
import type { ExpenseRow } from '@/db/schema';
import { deriveSpendingView } from '@/features/expenses/spending-summary';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { formatMoney, formatMoneyTight } from '@/lib/locale';

import { classesOf, containing, hostsWhere } from '../helpers/host-nodes';
import { glyphNamesIn } from '../helpers/icons';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};

const [FOOD, LODGING, TRANSPORT] = SYSTEM_EXPENSE_CATEGORIES.map((c) => c.id) as [
  string,
  string,
  string,
];

const row = (over: Partial<ExpenseRow> & { id: string }): ExpenseRow => ({
  trip_id: 't',
  city_id: null,
  category_id: FOOD,
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
});

const TRIP = { start: '2026-10-12', end: '2026-10-19' };

/** The pictured trip: three days of eight, three categories, one foreign currency, one pending. */
function pictured(today = '2026-10-14') {
  const rows = [
    row({ id: 'a', spent_at: '2026-10-12', amount_home: '310.00' }),
    row({
      id: 'b',
      spent_at: '2026-10-13',
      amount_home: '252.00',
      category_id: LODGING,
      currency: 'EUR',
      amount: '270.00',
      fx_rate_to_home: '0.933333',
    }),
    row({
      id: 'c',
      spent_at: '2026-10-14',
      amount_home: '280.00',
      category_id: TRANSPORT,
    }),
    row({
      id: 'p',
      spent_at: '2026-10-14',
      currency: 'XTS',
      amount: '99.00',
      amount_home: null,
      fx_rate_to_home: null,
      fx_pending: true,
    }),
  ];
  const summary = summariseExpenses(
    rows,
    'CHF',
    categoryOptions([]),
    'https://rates.example',
  );
  return { rows, summary, view: deriveSpendingView(summary, { range: TRIP, today }) };
}

/** The chart's columns are inside its one image, hidden from assistive technology by design. */
const HIDDEN = { includeHiddenElements: true } as const;

const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  mockToast.show.mockClear();
});

describe('<SpendingHero> (prototype .xhero; picture expenses.png)', () => {
  test('"Spent so far", the total as a 56 / 60 numeral with its sign raised, and the pill', async () => {
    const { view } = pictured();
    await render(<SpendingHero view={view} />);

    expect(screen.getByText('Spent so far')).toBeTruthy();
    const total = screen.getByTestId('summary-total');
    expect(total).toHaveTextContent(containing('842'));
    // A whole amount drops its zero fraction (the picture's "842"), the name keeps every digit.
    expect(total).not.toHaveTextContent(containing('842.00'));
    expect(total.props.accessibilityLabel).toBe(
      `Spent so far, ${formatMoney('842.00', 'CHF')}`,
    );
    const numeral = within(total).getByText(containing('842'));
    expect(flat(numeral)).toMatchObject({ fontSize: 56, lineHeight: 60 });
    expect(numeral.props.maxFontSizeMultiplier).toBe(1.3);
    expect(numeral.props.adjustsFontSizeToFit).toBe(true);
    const sign = within(total).getByText('CHF');
    expect(classesOf(sign)).toContain('text-muted');
  });

  test('the pill reads "<average> / day · Day 3 of 8" and is named in words', async () => {
    const { view } = pictured();
    await render(<SpendingHero view={view} />);

    const pill = screen.getByTestId('summary-average');
    expect(pill).toHaveTextContent(
      `${formatMoneyTight('280.67', 'CHF')} / day · Day 3 of 8`,
    );
    expect(pill.props.accessibilityLabel).toBe(
      `${formatMoney('280.67', 'CHF')} per day, day 3 of 8`,
    );
    expect(classesOf(pill)).toContain('border-separator');
    expect(glyphNamesIn()).toContain('calendar');
  });

  test('no average, no pill: nothing is invented', async () => {
    const view = deriveSpendingView(
      summariseExpenses([], 'CHF', categoryOptions([]), null),
      {
        range: TRIP,
        today: '2026-10-14',
      },
    );
    await render(<SpendingHero view={view} />);

    expect(screen.queryByTestId('summary-average')).toBeNull();
    expect(averageWords(view)).toBeNull();
    expect(screen.getByTestId('summary-total')).toHaveTextContent(containing('0'));
  });

  test('a trip that is over says "Spent in total" and "N days"; one day is "1 day"', () => {
    const over = pictured('2026-11-01').view;
    expect(heroLabel(over)).toBe('Spent in total');
    expect(averageWords(over)).toBe(
      `${formatMoneyTight('105.25', 'CHF')} / day · 8 days`,
    );
    const one = deriveSpendingView(
      summariseExpenses([row({ id: 'a' })], 'CHF', categoryOptions([]), null),
      { range: null, today: '2026-10-12' },
    );
    expect(averageWords(one)).toBe(`${formatMoneyTight('1.00', 'CHF')} / day · 1 day`);
  });

  test('collapsed, only the label row stays, with whatever trails it', async () => {
    const { view } = pictured();
    await render(<SpendingHero view={view} collapsed trailing={<Text>Trailing</Text>} />);

    expect(screen.getByText('Spent so far')).toBeTruthy();
    expect(screen.getByText('Trailing')).toBeTruthy();
    expect(screen.queryByTestId('summary-total')).toBeNull();
    expect(screen.queryByTestId('summary-average')).toBeNull();
  });
});

describe('<SpendingSummary> (T087, T550; FR-025, FR-026)', () => {
  test('is the pictured stack: hero, rates, awaiting a rate, per day, categories', async () => {
    const { summary, view } = pictured();
    await render(
      <SpendingSummary
        summary={summary}
        view={view}
        ratesAsOf="2026-05-01"
        onToggle={jest.fn()}
      />,
    );

    const wanted = [
      'spending-summary',
      'spending-hero',
      'summary-total',
      'summary-average',
      'expenses-toggle-summary',
      'summary-rates',
      'summary-pending',
      'day-bars',
      'category-spending',
    ];
    const order = hostsWhere((node) => wanted.includes(String(node.props.testID))).map(
      (node) => node.props.testID,
    );
    // The toggle is at the end of the first row, before the figure.
    expect(order).toEqual([
      'spending-summary',
      'spending-hero',
      'expenses-toggle-summary',
      'summary-total',
      'summary-average',
      'summary-rates',
      'summary-pending',
      'day-bars',
      'category-spending',
    ]);
  });

  test('the rate line discloses the rates, the rule, the source and the date in words (FR-026)', async () => {
    const { summary, view } = pictured();
    await render(
      <SpendingSummary summary={summary} view={view} ratesAsOf="2026-05-01" />,
    );

    const rates = screen.getByTestId('summary-rates');
    expect(rates).toHaveTextContent(containing('1 EUR = 0.933333 CHF'));
    expect(rates).toHaveTextContent(containing('1 expense'));
    expect(rates).toHaveTextContent(
      containing('Each expense keeps the rate it was recorded at.'),
    );
    expect(rates).toHaveTextContent(
      containing(`Rates by https://rates.example, as of ${formatIsoDate('2026-05-01')}.`),
    );
    expect(rates).not.toHaveTextContent(containing('2026-05-01'));
    expect(glyphNamesIn()).toContain('info');
  });

  test('says a source alone, a date alone, or neither', async () => {
    const { summary, view } = pictured();
    const view2 = render(
      <SpendingSummary
        summary={{ ...summary, rates_source: null }}
        view={view}
        ratesAsOf="2026-05-01"
      />,
    );
    await view2;
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(
      containing(`Rates as of ${formatIsoDate('2026-05-01')}.`),
    );
    await screen.rerender(
      <SpendingSummary summary={{ ...summary, rates_source: null }} view={view} />,
    );
    expect(screen.getByTestId('summary-rates')).not.toHaveTextContent(
      containing('Rates by'),
    );
    expect(screen.getByTestId('summary-rates')).not.toHaveTextContent(
      containing('as of'),
    );
  });

  test('no foreign currency, no rate line; nothing pending, no alert', async () => {
    const rows = [row({ id: 'a' })];
    const summary = summariseExpenses(rows, 'CHF', categoryOptions([]), null);
    const view = deriveSpendingView(summary, { range: null, today: '2026-10-12' });
    await render(<SpendingSummary summary={summary} view={view} />);

    expect(screen.queryByTestId('summary-rates')).toBeNull();
    expect(screen.queryByTestId('summary-pending')).toBeNull();
  });

  test('"Awaiting a rate" is an alert in words and an icon, naming each currency and what it leaves out', async () => {
    const { summary, view } = pictured();
    await render(<SpendingSummary summary={summary} view={view} />);

    const pending = screen.getByTestId('summary-pending');
    expect(pending.props.accessibilityRole).toBe('alert');
    expect(pending).toHaveTextContent(containing('Awaiting a rate'));
    expect(pending).toHaveTextContent(containing(formatMoney('99.00', 'XTS')));
    expect(pending).toHaveTextContent(containing('1 expense'));
    expect(pending).toHaveTextContent(containing('Not yet in the CHF total'));
    expect(glyphNamesIn()).toContain('alert');
    // Left out of every figure of the page.
    expect(screen.getByTestId('summary-total')).toHaveTextContent(containing('842'));
  });

  test('the toggle is named for what it will do, says whether it is open, and folds all but its row', async () => {
    const { summary, view } = pictured();
    const onToggle = jest.fn();
    await render(<SpendingSummary summary={summary} view={view} onToggle={onToggle} />);

    const toggle = screen.getByTestId('expenses-toggle-summary');
    expect(toggle.props.accessibilityLabel).toBe('Hide summary');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <SpendingSummary
        summary={summary}
        view={view}
        expanded={false}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByTestId('expenses-toggle-summary').props.accessibilityLabel).toBe(
      'Show summary',
    );
    expect(screen.queryByTestId('spending-summary')).toBeNull();
    for (const gone of [
      'summary-total',
      'day-bars',
      'category-spending',
      'summary-rates',
    ]) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
  });

  test('has no card: the summary lies on the canvas', async () => {
    const { summary, view } = pictured();
    await render(<SpendingSummary summary={summary} view={view} />);

    expect(classesOf(screen.getByTestId('spending-summary'))).not.toContain('bg-surface');
  });
});

describe('<DayBars> (prototype .bars, .bcol; picture expenses.png)', () => {
  const days = () => pictured().view.days;

  test('one column per day, with the day of the month and the whole-unit amount under it', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    for (const [date, label, amount] of [
      ['2026-10-12', '12', '310'],
      ['2026-10-13', '13', '252'],
      ['2026-10-14', '14', '280'],
      ['2026-10-15', '15', '–'],
      ['2026-10-19', '19', '–'],
    ]) {
      const column = screen.getByTestId(`summary-day-${date}`, HIDDEN);
      expect(column).toHaveTextContent(`${label}${amount}`);
    }
    expect(
      hostsWhere((node) => /^summary-day-/.test(String(node.props.testID))),
    ).toHaveLength(8);
  });

  test('past days are cream bars with an outline, today is solid ink, days to come are dots with no bar', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    const past = flat(screen.getByTestId('day-bar-2026-10-12', HIDDEN));
    const today = flat(screen.getByTestId('day-bar-2026-10-14', HIDDEN));
    expect(past.borderWidth).toBe(1.5);
    expect(today.borderWidth).toBe(0);
    expect(screen.queryByTestId('day-bar-2026-10-15', HIDDEN)).toBeNull();
    expect(past).toMatchObject({ borderTopLeftRadius: 8, borderBottomLeftRadius: 4 });
  });

  test('heights are shares of the tallest day over a 96 dp plot, never less than a 4 dp stub', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    expect(flat(screen.getByTestId('day-bar-2026-10-12', HIDDEN)).height).toBe(96);
    expect(flat(screen.getByTestId('day-bar-2026-10-13', HIDDEN)).height).toBe(78);
    expect(flat(screen.getByTestId('day-bar-2026-10-14', HIDDEN)).height).toBe(87);
  });

  test('"Budget" is drawn as pictured with no amount and no line: a coming-soon control (Q-11)', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    const budget = screen.getByTestId('coming-soon-budget');
    expect(budget.props.accessibilityLabel).toBe('Budget');
    expect(budget.props.accessibilityHint).toBe('Not available yet');
    expect(budget).toHaveTextContent('Budget');
    expect(budget).not.toHaveTextContent(/\d/);
    expect(screen.queryByTestId('day-bars-budget-line')).toBeNull();

    await fireEvent.press(budget);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0]![0]).toMatchObject({ id: 'coming-soon' });
  });

  test('the chart is ONE image to a screen reader, with every day in a sentence; "Per day" is a heading', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    const chart = screen.getByRole('image');
    expect(chart.props.accessibilityLabel).toBe(describeChart(days(), 'CHF'));
    expect(chart.props.accessibilityLabel).toContain(`${formatMoney('310.00', 'CHF')}`);
    expect(chart.props.accessibilityLabel).toContain('today');
    expect(chart.props.accessibilityLabel).toContain('nothing yet');
    expect(screen.getByRole('header', { name: 'Per day' })).toBeTruthy();
  });

  test('draws nothing for no days', async () => {
    await render(<DayBars days={[]} todayIndex={-1} homeCurrency="CHF" />);
    expect(screen.queryByTestId('day-bars')).toBeNull();
  });

  test('the columns are 32 dp, wider for a long amount at a large text size (capped at 1.3)', () => {
    const base = days();
    expect(columnWidth(base, 1)).toBe(32);
    const big = base.map((day) => ({
      ...day,
      whole: day.total === null ? null : '12345',
    }));
    expect(columnWidth(big, 1)).toBe(40);
    expect(columnWidth(big, 1.3)).toBe(52);
    expect(columnWidth(big, 2)).toBe(52);
  });

  test('the chart is a sideways scroller, so a long trip scrolls and a short one spreads out', async () => {
    await render(<DayBars days={days()} todayIndex={2} homeCurrency="CHF" />);

    const scroller = hostsWhere((node) => node.type === 'RCTScrollView')[0]!;
    expect(scroller.props.horizontal).toBe(true);
    expect(
      StyleSheet.flatten(scroller.props.contentContainerStyle as never),
    ).toMatchObject({ flexGrow: 1, justifyContent: 'space-between' });
  });
});

describe('<CategoryBar> (prototype .catbar, .legend; picture expenses.png)', () => {
  const slices = () => pictured().view.slices;

  test('one segment per category with spending, sized by its share, ends rounded, 6 dp at least', async () => {
    await render(<CategoryBar slices={slices()} homeCurrency="CHF" />);

    const food = flat(screen.getByTestId(`category-segment-${FOOD}`));
    const transport = flat(screen.getByTestId(`category-segment-${TRANSPORT}`));
    expect(food.flexGrow).toBeCloseTo(36.82, 1);
    expect(food.minWidth).toBe(6);
    expect(food).toMatchObject({ borderTopLeftRadius: 999, borderTopRightRadius: 0 });
    expect(transport).toMatchObject({ borderTopLeftRadius: 0, borderTopRightRadius: 0 });
    expect(flat(screen.getByTestId(`category-segment-${LODGING}`))).toMatchObject({
      borderTopLeftRadius: 0,
      borderTopRightRadius: 999,
    });
    const bar = flat(screen.getByTestId('category-bar'));
    expect(bar).toMatchObject({ height: 12, gap: 2 });
  });

  test('the legend names every category with its total, as an element with its id', async () => {
    await render(<CategoryBar slices={slices()} homeCurrency="CHF" />);

    const food = screen.getByTestId(`summary-category-${FOOD}`);
    expect(food).toHaveTextContent(containing('Food'));
    expect(food).toHaveTextContent(containing(formatMoneyTight('310.00', 'CHF')));
    expect(food.props.accessibilityLabel).toBe(`Food, ${formatMoney('310.00', 'CHF')}`);
    expect(screen.getByTestId(`summary-category-${LODGING}`)).toHaveTextContent(
      containing('Lodging'),
    );
    expect(screen.getByTestId(`summary-category-${TRANSPORT}`)).toHaveTextContent(
      containing('Transport'),
    );
  });

  test('the bar is one image named by the shares in words', async () => {
    await render(<CategoryBar slices={slices()} homeCurrency="CHF" />);

    expect(describeShares(slices())).toBe(
      'Food 37 percent, Transport 33 percent, Lodging 30 percent',
    );
    expect(screen.getByTestId('category-bar').props.accessibilityLabel).toBe(
      describeShares(slices()),
    );
  });

  test('a category with only refunds keeps its legend entry and has no segment', async () => {
    const summary = summariseExpenses(
      [
        row({ id: 'a', amount_home: '30.00' }),
        row({ id: 'b', category_id: LODGING, amount_home: '-4.00' }),
      ],
      'CHF',
      categoryOptions([]),
      null,
    );
    const view = deriveSpendingView(summary, { range: null, today: '2026-10-12' });
    await render(<CategoryBar slices={view.slices} homeCurrency="CHF" />);

    expect(screen.getByTestId(`summary-category-${LODGING}`)).toHaveTextContent(
      containing('-'),
    );
    expect(screen.queryByTestId(`category-segment-${LODGING}`)).toBeNull();
    expect(screen.getByTestId(`category-segment-${FOOD}`)).toBeTruthy();
  });

  test('draws nothing for no categories', async () => {
    await render(<CategoryBar slices={[]} homeCurrency="CHF" />);
    expect(screen.queryByTestId('category-spending')).toBeNull();
  });
});

describe('<ExpenseRow> - one expense (T441, T550; FR-014, FR-025, FR-030, FR-034)', () => {
  const base = row({
    id: 'e1',
    amount: '9.00',
    currency: 'EUR',
    note: 'Lunch',
    amount_home: '8.00',
    fx_rate_to_home: '0.888889',
    spent_at: '2026-05-11',
  });

  async function renderRow(
    expense: Partial<ExpenseRow> = {},
    props: { place?: string | null; onRemove?: () => void; icon?: string | null } = {},
  ) {
    return render(
      <ExpenseRowView
        expense={{ ...base, ...expense }}
        categoryName="Food"
        categoryIcon={props.icon === undefined ? 'food' : props.icon}
        place={props.place}
        homeCurrency="CHF"
        onRemove={props.onRemove ?? jest.fn()}
      />,
    );
  }

  test('is ONE element for assistive technology, named as before, with the same delete action', async () => {
    const onRemove = jest.fn();
    await renderRow({}, { onRemove });

    const element = screen.getByTestId('expense-row-e1');
    expect(element.props.accessible).toBe(true);
    expect(element.props.accessibilityLabel).toBe(
      `Food, ${formatMoney('9.00', 'EUR')}, ${formatMoney('8.00', 'CHF')}, ${formatIsoDate('2026-05-11')}. Lunch`,
    );
    expect(element.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete expense' },
    ]);
    await fireEvent(element, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    await fireEvent(element, 'accessibilityAction', {
      nativeEvent: { actionName: 'other' },
    });
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a row awaiting a rate is announced as such, and a row without a note says nothing of one', async () => {
    await renderRow({
      note: null,
      amount_home: null,
      fx_rate_to_home: null,
      fx_pending: true,
    });

    expect(screen.getByTestId('expense-row-e1').props.accessibilityLabel).toBe(
      `Food, ${formatMoney('9.00', 'EUR')}, awaiting a rate, ${formatIsoDate('2026-05-11')}`,
    );
  });

  test('the title is the note and the line under it is "Category · place"; without a note the category is the title', async () => {
    await renderRow({}, { place: 'Lisbon' });
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(screen.getByText('Food · Lisbon')).toBeTruthy();

    await screen.rerender(
      <ExpenseRowView
        expense={{ ...base, note: null }}
        categoryName="Food"
        categoryIcon="food"
        place="Lisbon"
        homeCurrency="CHF"
        onRemove={jest.fn()}
      />,
    );
    expect(screen.getByText('Food')).toBeTruthy();
    expect(screen.getByText('Lisbon')).toBeTruthy();
    expect(screen.queryByText('Food · Lisbon')).toBeNull();
  });

  test('the title takes two lines and the category line one', async () => {
    await renderRow({}, { place: 'Lisbon' });

    expect(screen.getByText('Lunch').props.numberOfLines).toBe(2);
    expect(screen.getByText('Food · Lisbon').props.numberOfLines).toBe(1);
  });

  test('leads with the category icon on its tint, decorative because the name beside it says it', async () => {
    await renderRow();

    const icon = screen.getByTestId('expense-icon-e1', { includeHiddenElements: true });
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(glyphNamesIn().filter((name) => name === 'fork-knife')).toHaveLength(1);
  });

  test('a category with no icon of its own leads with the generic glyph', async () => {
    await renderRow({}, { icon: null });
    expect(glyphNamesIn().filter((name) => name === 'fork-knife')).toHaveLength(0);
    expect(glyphNamesIn()).toContain('tag');
  });

  test('another currency, converted: the home figure on top and the amount paid under it, right-aligned in aligned numerals', async () => {
    await renderRow();

    const home = screen.getByTestId('expense-home-e1');
    expect(home).toHaveTextContent(formatMoney('8.00', 'CHF'));
    expect(screen.queryByTestId('expense-paid-e1')).toBeNull();
    expect(flat(home)).toMatchObject({
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    });
    const paid = within(screen.getByTestId('expense-row-e1')).getByText(
      formatMoney('9.00', 'EUR'),
    );
    expect(classesOf(paid)).toContain('text-muted');
    expect(flat(paid)).toMatchObject({
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    });
  });

  test('another currency, waiting: the amount paid on top, and "Awaiting a rate" under it', async () => {
    await renderRow({ amount_home: null, fx_rate_to_home: null, fx_pending: true });

    expect(screen.getByTestId('expense-paid-e1')).toHaveTextContent(
      formatMoney('9.00', 'EUR'),
    );
    expect(screen.getByTestId('expense-home-e1')).toHaveTextContent(
      containing('Awaiting a rate'),
    );
  });

  test('the trip’s own currency does not repeat itself', async () => {
    await renderRow({ currency: 'CHF', amount: '3.00', amount_home: '3.00' });

    expect(screen.getByTestId('expense-paid-e1')).toHaveTextContent(
      formatMoney('3.00', 'CHF'),
    );
    expect(screen.queryByTestId('expense-home-e1')).toBeNull();
  });

  test('a row only on this device carries the marker in words and an icon (FR-034); a saved one none', async () => {
    await renderRow({ is_dirty: true });
    expect(screen.getByText('Not yet synced')).toBeTruthy();
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();

    await screen.rerender(
      <ExpenseRowView
        expense={{ ...base, is_dirty: false }}
        categoryName="Food"
        homeCurrency="CHF"
        onRemove={jest.fn()}
      />,
    );
    expect(screen.queryByText('Not yet synced')).toBeNull();
  });

  test('Delete is not drawn, as pictured, until the row is tapped; then it keeps its id, name and word', async () => {
    const onRemove = jest.fn();
    await renderRow({}, { onRemove });

    expect(screen.queryByTestId('expense-remove-e1')).toBeNull();
    const element = screen.getByTestId('expense-row-e1');
    expect(element.props.accessibilityState).toMatchObject({ expanded: false });
    expect(element.props.accessibilityHint).toBe('Shows the delete button');

    await fireEvent.press(element);
    expect(screen.getByTestId('expense-row-e1').props.accessibilityState).toMatchObject({
      expanded: true,
    });
    const remove = screen.getByTestId('expense-remove-e1');
    expect(remove.props.accessibilityLabel).toBe(
      `Delete Food expense of ${formatMoney('9.00', 'EUR')}`,
    );
    expect(remove).toHaveTextContent(containing('Delete'));
    expect(remove.props.variant).toBe('danger-soft');
    await fireEvent.press(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('expense-row-e1'));
    expect(screen.queryByTestId('expense-remove-e1')).toBeNull();
  });
});

describe('<ExpenseDayGroup> (prototype .dgh; picture expenses.png)', () => {
  const rows = [
    row({ id: 'r1', spent_at: '2026-10-14', note: 'Pastéis de Belém' }),
    row({ id: 'r2', spent_at: '2026-10-14', note: 'Fuel' }),
  ];

  const group = (over: { today?: boolean; total?: string | null } = {}) => (
    <ExpenseDayGroup
      day={{ date: '2026-10-14', expenses: rows }}
      today={over.today ?? false}
      total={over.total === undefined ? '280.00' : over.total}
      homeCurrency="CHF"
      categoryName={() => 'Food'}
      categoryIcon={() => 'food'}
      placeOf={() => null}
      onRemove={jest.fn()}
    />
  );

  test('a heading with the day total at the end, then the rows with a hairline between them', async () => {
    await render(group());

    const heading = screen.getByRole('header');
    expect(within(heading).getByText(formatMoneyTight('280.00', 'CHF'))).toBeTruthy();
    expect(heading.props.accessibilityLabel).toBe(
      `${formatIsoDate('2026-10-14')}, ${formatMoney('280.00', 'CHF')}`,
    );
    expect(screen.getByTestId('expense-day-2026-10-14')).toHaveTextContent(
      containing('Pastéis de Belém'),
    );
    const separator = flat(screen.getByTestId('expense-day-2026-10-14-separator-1'));
    expect(separator).toMatchObject({ height: 1, marginStart: 52 });
    expect(screen.queryByTestId('expense-day-2026-10-14-separator-0')).toBeNull();
    expect(classesOf(screen.getByTestId('expense-day-2026-10-14'))).toContain(
      'border-separator',
    );
  });

  test('today says so beside the date, in words for a screen reader too', async () => {
    await render(group({ today: true }));

    expect(screen.getByText(containing('Today'))).toBeTruthy();
    expect(screen.getByRole('header').props.accessibilityLabel).toContain(', today');
  });

  test('a day with only unconverted expenses has no total', async () => {
    await render(group({ total: null }));

    expect(screen.getByRole('header').props.accessibilityLabel).toBe(
      formatIsoDate('2026-10-14'),
    );
  });
});

describe('<ExpensesHeader> (T550; FR-044, FR-055)', () => {
  test('is the shared area header: "Spending", the trip and the count, "Only you" and the coming-soon more', async () => {
    await render(<ExpensesHeader tripTitle="Portugal" count={3} writeError={null} />);

    expect(screen.getByTestId('expenses-title')).toHaveTextContent('Spending');
    expect(screen.getByTestId('expenses-subtitle')).toHaveTextContent(
      'Portugal · 3 expenses',
    );
    expect(screen.getByTestId('privacy-chip')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    const more = screen.getByTestId('coming-soon-expenses-more');
    await fireEvent.press(more);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('expenses-write-error')).toBeNull();
  });

  test('says a failed write in words', async () => {
    await render(
      <ExpensesHeader tripTitle={null} count={null} writeError="Could not save." />,
    );

    expect(screen.getByTestId('expenses-write-error')).toHaveTextContent(
      'Could not save.',
    );
    expect(screen.getByTestId('expenses-write-error').props.accessibilityRole).toBe(
      'alert',
    );
  });

  test('the subtitle: both halves, either alone, or none; one expense is singular', () => {
    expect(expensesSubtitle('Portugal', 1)).toBe('Portugal · 1 expense');
    expect(expensesSubtitle('Portugal', 0)).toBe('Portugal · 0 expenses');
    expect(expensesSubtitle('Portugal', null)).toBe('Portugal');
    expect(expensesSubtitle(null, 2)).toBe('2 expenses');
    expect(expensesSubtitle(null, null)).toBeNull();
  });
});

describe('<SpendingSkeleton>', () => {
  test('is ONE named progressbar, with no text inside and the page’s shapes: bars, a category bar and rows', async () => {
    await render(<SpendingSkeleton label="Loading expenses" />);

    const region = screen.getByLabelText('Loading expenses');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(hostsWhere((node) => node.type === 'Text')).toHaveLength(0);
  });
});
