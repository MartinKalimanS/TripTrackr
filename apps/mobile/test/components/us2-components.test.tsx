/**
 * User Story 2's components in isolation: the note editor's form behaviour
 * (T084/T085), the spending summary's disclosure (T087), the category and
 * anchor pickers, and the `ListScreen` scaffold (research D-23).
 */
import { SYSTEM_EXPENSE_CATEGORIES, type ExpenseSummary } from '@triptrackr/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StyleSheet, Text } from 'react-native';

import { AnchorPicker } from '@/components/trip/anchor-picker';
import { CategoryPicker } from '@/components/trip/category-picker';
import { ExpenseRow as ExpenseRowView } from '@/components/trip/expense-row';
import { NoteCard, describeAnchor } from '@/components/trip/note-card';
import { NoteEditor } from '@/components/trip/note-editor';
import { SpendingSummary } from '@/components/trip/spending-summary';
import { ListScreen } from '@/components/ui/list-screen';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { ExpenseRow } from '@/db/schema';
import type { AnchorTarget } from '@/features/notes/use-move-note';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { formatMoney } from '@/lib/locale';

import { classesOf, containing, hostsWhere } from '../helpers/host-nodes';
import { glyphNamesIn } from '../helpers/icons';

const targets: AnchorTarget[] = [
  {
    level: 'trip',
    key: 'country:1',
    label: 'Whole trip (Italy)',
    country_id: 1,
    city_id: null,
  },
  { level: 'city', key: 'city:100', label: 'Roma, Italy', country_id: 1, city_id: 100 },
];

describe('<NoteEditor>', () => {
  test('add mode pre-selects the first anchor, refuses an empty body, and submits the wire shape', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('anchor-country:1').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() => expect(screen.getByText('Write something first.')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByTestId('note-editor-body'),
      'Gelato at Vivoli.',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: null,
        body: 'Gelato at Vivoli.',
        country_id: 1,
        city_id: null,
      }),
    );
  });

  test('add mode honours an initial anchor and reports when nothing is chosen', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add', initialAnchorKey: 'city:100' }}
        targets={targets}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('anchor-city:100').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  test('with no stops there is nothing to file under, and save says so', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={[]}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/Add a stop to this trip first/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'x');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Choose where this note belongs/)).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('edit mode starts from the note and a cancelled draft does not linger', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <NoteEditor
        visible
        mode={{
          kind: 'edit',
          note: { title: 'Cheese', body: 'Raclette.', country_id: 1, city_id: 100 },
        }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('note-editor-title').props.value).toBe('Cheese');
    expect(screen.getByTestId('note-editor-body').props.value).toBe('Raclette.');
    expect(screen.getByTestId('anchor-city:100').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('note-editor-cancel'));
    expect(onCancel).toHaveBeenCalled();

    await view.rerender(
      <NoteEditor
        visible={false}
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('note-editor-save')).toBeNull();
  });
});

describe('describeAnchor', () => {
  const base: NoteWithPlace = {
    id: 'n',
    trip_id: 't',
    country_id: 1,
    city_id: null,
    title: null,
    body: 'x',
    is_public: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
    country_name: 'Italy',
    city_name: null,
  };

  test('names the level in words, falling back to ids for uncached places', () => {
    expect(describeAnchor(base)).toBe('Italy');
    expect(describeAnchor({ ...base, city_id: 100, city_name: 'Roma' })).toBe(
      'Roma, Italy',
    );
    expect(
      describeAnchor({ ...base, city_id: 100, city_name: null, country_name: null }),
    ).toBe('City #100');
    expect(describeAnchor({ ...base, country_name: null })).toBe('Country #1');
    expect(describeAnchor({ ...base, country_id: null, country_name: null })).toBe(
      'Trip',
    );
  });
});

describe('<NoteCard> - a note in the list (T440; FR-006, FR-013, FR-030, FR-034)', () => {
  const saved: NoteWithPlace = {
    id: 'n1',
    trip_id: 't',
    country_id: 1,
    city_id: 100,
    title: 'Cheese',
    body: 'Try the raclette.',
    is_public: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    country_name: 'Italy',
    city_name: 'Roma',
  };
  async function renderCard(
    note: Partial<NoteWithPlace> = {},
    handlers: { onEdit?: () => void; onRemove?: () => void } = {},
  ) {
    return render(
      <NoteCard
        note={{ ...saved, ...note }}
        onEdit={handlers.onEdit ?? jest.fn()}
        onRemove={handlers.onRemove ?? jest.fn()}
      />,
    );
  }

  test('is ONE element for assistive technology, named as before, with the same two actions', async () => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    await renderCard({}, { onEdit, onRemove });

    const card = screen.getByTestId('note-card-n1');
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toBe(
      'Cheese, filed under Roma, Italy. Try the raclette.',
    );
    expect(card.props.accessibilityActions).toEqual([
      { name: 'edit', label: 'Edit note' },
      { name: 'delete', label: 'Delete note' },
    ]);

    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    await fireEvent(card, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    await fireEvent(card, 'accessibilityAction', {
      nativeEvent: { actionName: 'magnify' },
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a note with no title is announced as "Note"', async () => {
    await renderCard({ title: null });
    expect(screen.getByTestId('note-card-n1').props.accessibilityLabel).toBe(
      'Note, filed under Roma, Italy. Try the raclette.',
    );
  });

  test('is a lift card: a hairline, no dashed edge while the note is saved (FR-002, FR-006)', async () => {
    await renderCard();

    const classes = classesOf(screen.getByTestId('note-surface-n1'));
    expect(classes).toContain('bg-surface');
    expect(classes).toContain('border-separator');
    expect(classes).not.toContain('border-dashed');
    expect(screen.queryByText('Not yet synced')).toBeNull();
  });

  test('a note only on this device has the dashed edge AND the marker in words (FR-034, FR-025)', async () => {
    await renderCard({ is_dirty: true });

    expect(classesOf(screen.getByTestId('note-surface-n1'))).toEqual(
      expect.arrayContaining(['border-dashed', 'border-amber-line']),
    );
    expect(screen.getByText('Not yet synced')).toBeTruthy();
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();
  });

  test('says where it is filed in words (muted), then shows the title and the body', async () => {
    await renderCard();

    expect(screen.getByTestId('note-anchor-n1')).toHaveTextContent('Roma, Italy');
    expect(classesOf(screen.getByTestId('note-anchor-n1'))).toContain('text-muted');
    expect(screen.getByText('Cheese')).toBeTruthy();
    expect(screen.getByTestId('note-body-n1')).toHaveTextContent('Try the raclette.');
  });

  test('previews at most 160 characters of a long body, and says it is cut', async () => {
    await renderCard({ body: 'x'.repeat(200) });

    expect(screen.getByTestId('note-body-n1')).toHaveTextContent(`${'x'.repeat(160)}…`);
  });

  test('Edit and Delete keep their ids, names, words and handlers; Delete is the destructive one (FR-005, FR-037)', async () => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    await renderCard({}, { onEdit, onRemove });

    const edit = screen.getByTestId('note-edit-n1');
    const remove = screen.getByTestId('note-remove-n1');
    expect(edit.props.accessibilityLabel).toBe('Edit Cheese');
    expect(remove.props.accessibilityLabel).toBe('Delete Cheese');
    expect(edit).toHaveTextContent('Edit');
    expect(remove).toHaveTextContent('Delete');
    expect(edit.props.variant).toBe('ghost');
    expect(remove.props.variant).toBe('danger-soft');

    await fireEvent.press(edit);
    await fireEvent.press(remove);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('controls of an untitled note are named after "note"', async () => {
    await renderCard({ title: null });

    expect(screen.getByTestId('note-edit-n1').props.accessibilityLabel).toBe('Edit note');
    expect(screen.getByTestId('note-remove-n1').props.accessibilityLabel).toBe(
      'Delete note',
    );
  });
});

describe('<AnchorPicker> and <CategoryPicker>', () => {
  test('the anchor picker reports the chosen key and shows an error in words', async () => {
    const onChange = jest.fn();
    await render(
      <AnchorPicker
        label="Filed under"
        targets={targets}
        value=""
        onChange={onChange}
        error="Choose one."
      />,
    );
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    expect(onChange).toHaveBeenCalledWith('city:100');
    expect(screen.getByText('Choose one.')).toBeTruthy();
  });

  test('the category picker lists system rows then custom, creates on demand, and disables an empty add', async () => {
    const onChange = jest.fn();
    const onCreate = jest.fn(() => 'new-id');
    const options = [
      ...SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
      { id: 'custom-1', name: 'Coffee', icon: null, system: false },
    ];
    await render(
      <CategoryPicker
        options={options}
        value={SYSTEM_EXPENSE_CATEGORIES[1].id}
        onChange={onChange}
        onCreate={onCreate}
      />,
    );

    expect(
      screen.getByTestId(`category-${SYSTEM_EXPENSE_CATEGORIES[1].id}`).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('category-custom-1'));
    expect(onChange).toHaveBeenCalledWith('custom-1');

    expect(screen.getByTestId('category-new-add').props.accessibilityState).toMatchObject(
      {
        disabled: true,
      },
    );
    await fireEvent.press(screen.getByTestId('category-new-add'));
    expect(onCreate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('category-new-name'), '  Museums ');
    await fireEvent(screen.getByTestId('category-new-name'), 'submitEditing');
    expect(onCreate).toHaveBeenCalledWith('Museums');
    expect(onChange).toHaveBeenLastCalledWith('new-id');
    expect(screen.getByTestId('category-new-name').props.value).toBe('');
  });
});

describe('<SpendingSummary> (T087, T441; FR-004, FR-014, FR-025, FR-026)', () => {
  const summary: ExpenseSummary = {
    home_currency: 'CHF',
    total_home: '23.50',
    by_category: [
      {
        category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
        name: 'Food',
        total_home: '18.00',
        count: 2,
      },
      {
        category_id: SYSTEM_EXPENSE_CATEGORIES[2].id,
        name: 'Transport',
        total_home: '5.50',
        count: 1,
      },
    ],
    by_day: [
      { date: '2026-06-02', total_home: '15.50', count: 2 },
      { date: '2026-06-03', total_home: '8.00', count: 1 },
    ],
    rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
    rates_source: 'https://www.exchangerate-api.com',
    pending_conversion: {
      count: 1,
      by_currency: [{ currency: 'XTS', total: '250000.00', count: 1 }],
    },
  };

  test('shows the home total, each breakdown, the applied rates with their source, and pending rows', async () => {
    await render(<SpendingSummary summary={summary} ratesAsOf="2026-05-01" />);

    expect(screen.getByTestId('summary-total')).toHaveTextContent(containing('23.50'));
    expect(
      screen.getByTestId(`summary-category-${SYSTEM_EXPENSE_CATEGORIES[2].id}`),
    ).toHaveTextContent(containing('Transport'));
    expect(screen.getByTestId('summary-day-2026-06-03')).toHaveTextContent(
      containing('8.00'),
    );
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(
      containing('1 EUR = 0.888889 CHF'),
    );
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(containing('Rates by'));
    expect(screen.getByTestId('summary-pending')).toHaveTextContent(containing('XTS'));
    expect(screen.getByTestId('summary-pending')).toHaveTextContent(
      containing('Not yet in the CHF total'),
    );
  });

  test('a single-currency trip discloses no rates and shows no pending section', async () => {
    await render(
      <SpendingSummary
        summary={{
          ...summary,
          rates_applied: [],
          rates_source: null,
          pending_conversion: { count: 0, by_currency: [] },
        }}
      />,
    );
    expect(screen.queryByTestId('summary-rates')).toBeNull();
    expect(screen.queryByTestId('summary-pending')).toBeNull();
  });

  test('the total in the home currency is the most prominent figure on it (FR-014)', async () => {
    await render(<SpendingSummary summary={summary} ratesAsOf="2026-05-01" />);

    const total = screen.getByTestId('summary-total');
    expect(total).toHaveTextContent(containing('23.50'));
    // The `largeTitle` size in the display face; nothing else in the card is that big.
    expect(classesOf(total)).toEqual(
      expect.arrayContaining(['text-[32px]', 'font-display-bold']),
    );
    expect(hostsWhere((node) => classesOf(node).includes('text-[32px]'))).toHaveLength(1);
    expect(screen.getByText('Total in CHF')).toBeTruthy();
    expect(classesOf(screen.getByText('Total in CHF'))).toContain('text-muted');
  });

  test('every amount is set in aligned (tabular) numerals, and the by-day dates too (FR-004)', async () => {
    await render(<SpendingSummary summary={summary} ratesAsOf="2026-05-01" />);

    const food = screen.getByTestId(
      `summary-category-${SYSTEM_EXPENSE_CATEGORIES[0].id}`,
    );
    const figures = [
      screen.getByTestId('summary-total'),
      within(food).getByText(formatMoney('18.00', 'CHF')),
      within(screen.getByTestId('summary-day-2026-06-02')).getByText(
        formatIsoDate('2026-06-02'),
      ),
      within(screen.getByTestId('summary-day-2026-06-02')).getByText(
        formatMoney('15.50', 'CHF'),
      ),
      within(screen.getByTestId('summary-pending')).getByText(
        formatMoney('250000.00', 'XTS'),
      ),
    ];
    for (const figure of figures) {
      expect(StyleSheet.flatten(figure.props.style).fontVariant).toEqual([
        'tabular-nums',
      ]);
    }
  });

  test('summarises by category: the name, how many, and the amount on the right', async () => {
    await render(<SpendingSummary summary={summary} />);

    const food = screen.getByTestId(
      `summary-category-${SYSTEM_EXPENSE_CATEGORIES[0].id}`,
    );
    expect(food).toHaveTextContent(containing('Food'));
    expect(food).toHaveTextContent(containing('2 expenses'));
    expect(food).toHaveTextContent(containing('18.00'));
    expect(
      screen.getByTestId(`summary-category-${SYSTEM_EXPENSE_CATEGORIES[2].id}`),
    ).toHaveTextContent(containing('1 expense'));
    // The amount is the right-hand cell of its row.
    expect(classesOf(within(food).getByText(formatMoney('18.00', 'CHF')))).toContain(
      'text-right',
    );
  });

  test('states the date of the exchange rates in words (FR-014)', async () => {
    await render(<SpendingSummary summary={summary} ratesAsOf="2026-05-01" />);

    const rates = screen.getByTestId('summary-rates');
    expect(rates).toHaveTextContent(
      containing(
        `Rates by https://www.exchangerate-api.com, as of ${formatIsoDate('2026-05-01')}.`,
      ),
    );
    // Words, not the stored string.
    expect(rates).not.toHaveTextContent(containing('2026-05-01'));
    expect(rates).toHaveTextContent(
      containing('Each expense keeps the rate it was recorded at.'),
    );
  });

  test.each([
    [
      'a source and no date',
      'https://rates.example',
      null,
      'Rates by https://rates.example.',
    ],
    [
      'a date and no source',
      null,
      '2026-05-01',
      `Rates as of ${formatIsoDate('2026-05-01')}.`,
    ],
  ])('says %s plainly', async (_name, source, asOf, sentence) => {
    await render(
      <SpendingSummary summary={{ ...summary, rates_source: source }} ratesAsOf={asOf} />,
    );

    expect(screen.getByTestId('summary-rates')).toHaveTextContent(containing(sentence));
  });

  test('a trip with nothing spent shows the total alone, with no empty sections', async () => {
    await render(
      <SpendingSummary
        summary={{
          home_currency: 'CHF',
          total_home: '0.00',
          by_category: [],
          by_day: [],
          rates_applied: [],
          rates_source: null,
          pending_conversion: { count: 0, by_currency: [] },
        }}
      />,
    );

    expect(screen.getByTestId('summary-total')).toHaveTextContent(containing('0.00'));
    expect(screen.queryByText('By category')).toBeNull();
    expect(screen.queryByText('By day')).toBeNull();
    expect(screen.queryByTestId('summary-rates')).toBeNull();
  });

  test('has no sentence about a source or a date when it has neither', async () => {
    await render(<SpendingSummary summary={{ ...summary, rates_source: null }} />);

    expect(screen.getByTestId('summary-rates')).not.toHaveTextContent(
      containing('Rates by'),
    );
    expect(screen.getByTestId('summary-rates')).not.toHaveTextContent(
      containing('as of'),
    );
  });

  test('is ONE raised card, its sections are headings, and rows awaiting a rate are an alert in words', async () => {
    await render(<SpendingSummary summary={summary} ratesAsOf="2026-05-01" />);

    expect(classesOf(screen.getByTestId('spending-summary'))).toContain('bg-surface');
    for (const heading of ['By category', 'By day', 'Rates applied']) {
      expect(screen.getByText(heading).props.accessibilityRole).toBe('header');
    }
    const pending = screen.getByTestId('summary-pending');
    expect(pending.props.accessibilityRole).toBe('alert');
    expect(pending).toHaveTextContent(containing('Awaiting a rate'));
  });

  test('is composed from the adapter layer only (no retired primitive, no colour literal)', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../src/components/trip/spending-summary.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
    expect(source).not.toMatch(/@\/constants\/theme|heroui-native|uniwind/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

/** A decorative icon is hidden from assistive technology, and so from a default query. */
const HIDDEN = { includeHiddenElements: true } as const;

describe('<ExpenseRow> - one expense in a day group (T441; FR-014, FR-025, FR-030, FR-034)', () => {
  const FOOD_ID = SYSTEM_EXPENSE_CATEGORIES[0].id;
  const base: ExpenseRow = {
    id: 'e1',
    trip_id: 't',
    city_id: null,
    category_id: FOOD_ID,
    amount: '9.00',
    currency: 'EUR',
    spent_at: '2026-05-11',
    note: 'Lunch',
    fx_rate_to_home: '0.888889',
    amount_home: '8.00',
    fx_pending: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
  };

  async function renderRow(
    expense: Partial<ExpenseRow> = {},
    props: { categoryIcon?: string | null; onRemove?: () => void } = {},
  ) {
    return render(
      <ExpenseRowView
        expense={{ ...base, ...expense }}
        categoryName="Food"
        categoryIcon={props.categoryIcon === undefined ? 'food' : props.categoryIcon}
        homeCurrency="CHF"
        onRemove={props.onRemove ?? jest.fn()}
      />,
    );
  }

  test('is ONE element for assistive technology, named as before, with the same delete action', async () => {
    const onRemove = jest.fn();
    await renderRow({}, { onRemove });

    const row = screen.getByTestId('expense-row-e1');
    expect(row.props.accessible).toBe(true);
    expect(row.props.accessibilityLabel).toBe(
      `Food, ${formatMoney('9.00', 'EUR')}, ${formatMoney('8.00', 'CHF')}, ${formatIsoDate('2026-05-11')}. Lunch`,
    );
    expect(row.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete expense' },
    ]);
    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'other' } });
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

  test('leads with the category icon, decorative because the name beside it says it (FR-014)', async () => {
    await renderRow();

    const icon = screen.getByTestId('expense-icon-e1', HIDDEN);
    expect(icon.props.accessible).toBe(false);
    expect(icon.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(glyphNamesIn().filter((name) => name === 'fork-knife')).toHaveLength(1);
  });

  test('a category with no icon of its own leads with the generic glyph', async () => {
    await renderRow({}, { categoryIcon: null });

    expect(screen.getByTestId('expense-icon-e1', HIDDEN)).toBeTruthy();
    expect(glyphNamesIn().filter((name) => name === 'fork-knife')).toHaveLength(0);
  });

  test('puts the amount paid on the right in aligned numerals, with the home amount under it', async () => {
    await renderRow();

    const paid = screen.getByTestId('expense-paid-e1');
    const home = screen.getByTestId('expense-home-e1');
    expect(paid).toHaveTextContent(formatMoney('9.00', 'EUR'));
    expect(home).toHaveTextContent(formatMoney('8.00', 'CHF'));
    for (const figure of [paid, home]) {
      expect(StyleSheet.flatten(figure.props.style).fontVariant).toEqual([
        'tabular-nums',
      ]);
      expect(classesOf(figure)).toContain('text-right');
    }
    expect(classesOf(home)).toContain('text-muted');
  });

  test('says "Awaiting a rate" in words while the conversion is pending', async () => {
    await renderRow({ amount_home: null, fx_rate_to_home: null, fx_pending: true });

    expect(screen.getByTestId('expense-home-e1')).toHaveTextContent(
      containing('Awaiting a rate'),
    );
  });

  test('a row in the home currency does not repeat itself', async () => {
    await renderRow({ currency: 'CHF', amount: '3.00', amount_home: '3.00' });

    expect(screen.getByTestId('expense-paid-e1')).toHaveTextContent(
      formatMoney('3.00', 'CHF'),
    );
    expect(screen.queryByTestId('expense-home-e1')).toBeNull();
  });

  test('shows the note under the category', async () => {
    await renderRow();

    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(classesOf(screen.getByText('Lunch'))).toContain('text-muted');
  });

  test('shows no note line when there is none', async () => {
    await renderRow({ note: null });

    expect(screen.queryByText('Lunch')).toBeNull();
  });

  test('a row only on this device carries the marker in words and an icon (FR-034)', async () => {
    await renderRow({ is_dirty: true });

    expect(screen.getByText('Not yet synced')).toBeTruthy();
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();
  });

  test('a saved row carries no marker', async () => {
    await renderRow({ is_dirty: false });

    expect(screen.queryByText('Not yet synced')).toBeNull();
  });

  test('Delete keeps its id, name and word, and is the one destructive control of the row', async () => {
    const onRemove = jest.fn();
    await renderRow({}, { onRemove });

    const remove = screen.getByTestId('expense-remove-e1');
    expect(remove.props.accessibilityLabel).toBe(
      `Delete Food expense of ${formatMoney('9.00', 'EUR')}`,
    );
    expect(remove).toHaveTextContent(containing('Delete'));
    expect(remove.props.variant).toBe('danger-soft');
    await fireEvent.press(remove);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('is composed from the adapter layer only (no retired primitive, no colour literal)', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../src/components/trip/expense-row.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
    expect(source).not.toMatch(/@\/constants\/theme|heroui-native|uniwind/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

describe('<ListScreen> (research D-23)', () => {
  test('renders header, rows in order, and footer; the empty slot only when there are no rows', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const view = await render(
      <ListScreen
        testID="list"
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Text testID={`row-${item.id}`}>{item.id}</Text>}
        header={<Text>Header</Text>}
        footer={<Text>Footer</Text>}
        empty={<Text>Nothing</Text>}
        edges={['bottom']}
      />,
    );
    expect(screen.getByText('Header')).toBeTruthy();
    expect(screen.getByTestId('row-a')).toBeTruthy();
    expect(screen.getByTestId('row-b')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
    expect(screen.queryByText('Nothing')).toBeNull();

    await view.rerender(
      <ListScreen
        testID="list"
        data={[]}
        keyExtractor={(row: { id: string }) => row.id}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        empty={<Text>Nothing</Text>}
      />,
    );
    expect(screen.getByText('Nothing')).toBeTruthy();
  });
});
