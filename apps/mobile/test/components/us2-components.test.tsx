/**
 * User Story 2's components in isolation: the note editor's form behaviour
 * (T084/T085), the spending summary's disclosure (T087), the category and
 * anchor pickers, and the `ListScreen` scaffold (research D-23).
 */
import { SYSTEM_EXPENSE_CATEGORIES, type ExpenseSummary } from '@triptrackr/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AnchorPicker } from '@/components/trip/anchor-picker';
import { CategoryPicker } from '@/components/trip/category-picker';
import { describeAnchor } from '@/components/trip/note-card';
import { NoteEditor } from '@/components/trip/note-editor';
import { SpendingSummary } from '@/components/trip/spending-summary';
import { ListScreen } from '@/components/ui/list-screen';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { AnchorTarget } from '@/features/notes/use-move-note';

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

describe('<SpendingSummary> (FR-025, FR-026)', () => {
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

    expect(screen.getByTestId('summary-total')).toHaveTextContent(/23\.50/);
    expect(
      screen.getByTestId(`summary-category-${SYSTEM_EXPENSE_CATEGORIES[2].id}`),
    ).toHaveTextContent(/Transport/);
    expect(screen.getByTestId('summary-day-2026-06-03')).toHaveTextContent(/8\.00/);
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(
      /1 EUR = 0\.888889 CHF/,
    );
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(/Rates by/);
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(/as of/);
    expect(screen.getByTestId('summary-pending')).toHaveTextContent(/XTS/);
    expect(screen.getByTestId('summary-pending')).toHaveTextContent(
      /Not yet in the CHF total/,
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
