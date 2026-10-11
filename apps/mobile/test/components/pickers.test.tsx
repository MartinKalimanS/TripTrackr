/**
 * `CurrencyPicker` and `CategoryPicker` on the Atlas adapters (feature 004, T435; FR-009,
 * FR-024, FR-025, FR-029, FR-030, FR-037; 003 FR-017; contract C4-8 `ChipGroup`, `Field`).
 *
 * What is pinned: the two pickers are `ChipGroup`s (a `radiogroup` of `radio` chips, each
 * announced `{ selected, checked }`), every id and accessible name they had is unchanged,
 * the common currencies and "Other" sit in ONE sideways row, a free-text field is a `Field`
 * (label on top, an error in words), and neither file reaches for a retired primitive.
 * The behaviour of the currency choice itself (opening "Other" clears a common code, a
 * message gives the field a home) stays in `src/features/trips/__tests__/trip-form.test.tsx`.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';

import { CategoryPicker } from '@/components/trip/category-picker';
import { COMMON_CURRENCIES, CurrencyPicker } from '@/components/trip/currency-picker';
import type { CategoryOption } from '@/db/repositories/expenses';

const hidden = { includeHiddenElements: true };

/** The sideways scrollers inside a group (host nodes). */
function scrollersIn(group: ReturnType<typeof screen.getByTestId>) {
  return group.queryAll((node) => node.props.horizontal === true);
}
const scrollerIn = (group: ReturnType<typeof screen.getByTestId>) =>
  scrollersIn(group)[0];

function sourceOf(file: string): string {
  return readFileSync(require.resolve(file), 'utf8');
}

describe('<CurrencyPicker> as a ChipGroup (T435)', () => {
  test('is one radiogroup, named and labelled "Home currency", that keeps its id', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);

    const group = screen.getByTestId('currency-pills');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Home currency');
    expect(screen.getByText('Home currency')).toBeTruthy();
  });

  test('holds every common code and then "Other", in that order, one radio each', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);

    const radios = within(screen.getByTestId('currency-pills')).getAllByRole('radio');
    expect(radios.map((radio) => radio.props.testID)).toEqual([
      ...COMMON_CURRENCIES.map((code) => `currency-${code}`),
      'currency-other-toggle',
    ]);
    for (const code of COMMON_CURRENCIES) {
      const radio = screen.getByTestId(`currency-${code}`);
      expect(radio.props.accessibilityLabel).toBe(code);
      expect(radio).toHaveTextContent(code);
    }
    const other = screen.getByTestId('currency-other-toggle');
    expect(other.props.accessibilityLabel).toBe('Other currency');
    expect(other).toHaveTextContent('Other');
  });

  test('announces each chip selected and checked, and only the chosen code', async () => {
    await render(<CurrencyPicker value="GBP" onChange={jest.fn()} />);

    const states = Object.fromEntries(
      within(screen.getByTestId('currency-pills'))
        .getAllByRole('radio')
        .map((radio) => [radio.props.testID, radio.props.accessibilityState]),
    );
    expect(states['currency-GBP']).toMatchObject({ selected: true, checked: true });
    for (const code of COMMON_CURRENCIES.filter((c) => c !== 'GBP')) {
      expect(states[`currency-${code}`]).toMatchObject({ selected: false });
    }
    expect(states['currency-other-toggle']).toMatchObject({ selected: false });
  });

  test('is ONE sideways row: no wrapping, no scroll bar, taps kept with the keyboard up (003 FR-017)', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);

    const scroller = scrollerIn(screen.getByTestId('currency-pills'));
    expect(scroller).toBeDefined();
    expect(scroller?.props.showsHorizontalScrollIndicator).toBe(false);
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scrollersIn(screen.getByTestId('currency-pills'))).toHaveLength(1);
  });

  test('selecting "Other" selects it alone and shows its field; a common code is no longer selected', async () => {
    const onChange = jest.fn();
    const view = await render(<CurrencyPicker value="EUR" onChange={onChange} />);
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    expect(onChange).toHaveBeenCalledWith('');

    // The parent now holds the cleared value, as the add-trip form does.
    await view.rerender(<CurrencyPicker value="" onChange={onChange} />);
    expect(
      screen.getByTestId('currency-other-toggle').props.accessibilityState,
    ).toMatchObject({ selected: true, checked: true });
    expect(screen.getByTestId('currency-EUR').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  test('shows the check glyph of a selected chip, so selection is not colour alone (FR-025)', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);
    expect(screen.getByTestId('currency-EUR-check', hidden)).toBeTruthy();
    expect(screen.queryByTestId('currency-GBP-check', hidden)).toBeNull();
  });

  test('the free-text code is a Field: its label sits on top and an error is words under it (FR-025)', async () => {
    await render(
      <CurrencyPicker value="EU" onChange={jest.fn()} error="Use a 3-letter code." />,
    );

    const input = screen.getByTestId('currency-other');
    expect(input.props.accessibilityLabel).toBe('Other currency code');
    expect(input.props['aria-invalid']).toBe(true);
    expect(screen.getByText('Other currency code')).toBeTruthy();
    const error = screen.getByTestId('currency-other-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error).toHaveTextContent('Use a 3-letter code.');
  });

  test('draws no error under a valid free-text code', async () => {
    await render(<CurrencyPicker value="THB" onChange={jest.fn()} />);
    expect(screen.getByTestId('currency-other').props['aria-invalid']).toBe(false);
    expect(screen.queryByTestId('currency-other-error')).toBeNull();
  });

  test('is composed from the adapter layer only (no retired primitive, no kit)', () => {
    const source = sourceOf('@/components/trip/currency-picker');
    expect(source).not.toMatch(/PressableSurface|ThemedText|PillGroup|\bSurface\b/);
    expect(source).not.toMatch(/ui\/text-field|TextField/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/use-appearance|Colors\[/);
  });
});

const OPTIONS: readonly CategoryOption[] = [
  ...SYSTEM_EXPENSE_CATEGORIES.map((category) => ({ ...category, system: true })),
  { id: 'custom-1', name: 'Coffee', icon: null, system: false },
];
const FOOD = SYSTEM_EXPENSE_CATEGORIES[1].id;

describe('<CategoryPicker> as a ChipGroup (T435)', () => {
  test('is one radiogroup named "Category", one radio per category, with the ids it had', async () => {
    await render(<CategoryPicker options={OPTIONS} value={FOOD} onChange={jest.fn()} />);

    const group = screen.getByLabelText('Category');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByText('Category')).toBeTruthy();
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.props.testID)).toEqual(
      OPTIONS.map((option) => `category-${option.id}`),
    );
    for (const option of OPTIONS) {
      const radio = screen.getByTestId(`category-${option.id}`);
      expect(radio.props.accessibilityLabel).toBe(option.name);
      expect(radio).toHaveTextContent(option.name);
    }
  });

  test('announces the chosen category selected and checked, and reports a press', async () => {
    const onChange = jest.fn();
    await render(<CategoryPicker options={OPTIONS} value={FOOD} onChange={onChange} />);

    expect(screen.getByTestId(`category-${FOOD}`).props.accessibilityState).toMatchObject(
      {
        selected: true,
        checked: true,
      },
    );
    expect(
      screen.getByTestId('category-custom-1').props.accessibilityState,
    ).toMatchObject({
      selected: false,
    });
    await fireEvent.press(screen.getByTestId('category-custom-1'));
    expect(onChange).toHaveBeenCalledWith('custom-1');
  });

  test('is one sideways row by default (contract C4-11: category chips one row)', async () => {
    await render(<CategoryPicker options={OPTIONS} value={FOOD} onChange={jest.fn()} />);

    const scroller = scrollerIn(screen.getByLabelText('Category'));
    expect(scroller?.props.showsHorizontalScrollIndicator).toBe(false);
    expect(scroller?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('wraps onto further lines when asked not to scroll', async () => {
    await render(
      <CategoryPicker
        options={OPTIONS}
        value={FOOD}
        onChange={jest.fn()}
        scroll={false}
      />,
    );
    expect(scrollerIn(screen.getByLabelText('Category'))).toBeUndefined();
    expect(screen.getByTestId('category-custom-1')).toBeTruthy();
  });

  test('offers no new-category row unless it can create one', async () => {
    await render(<CategoryPicker options={OPTIONS} value={FOOD} onChange={jest.fn()} />);
    expect(screen.queryByTestId('category-new-name')).toBeNull();
    expect(screen.queryByTestId('category-new-add')).toBeNull();
  });

  describe('the new-category row', () => {
    const renderCreating = (onCreate = jest.fn(() => 'new-id')) =>
      render(
        <CategoryPicker
          options={OPTIONS}
          value={FOOD}
          onChange={jest.fn()}
          onCreate={onCreate}
        />,
      );

    test('is a Field with its label on top and a secondary "Add category" button, disabled while empty', async () => {
      await renderCreating();

      const field = screen.getByTestId('category-new-name');
      expect(field.props.accessibilityLabel).toBe('New category');
      expect(screen.getByText('New category')).toBeTruthy();
      expect(field.props.maxLength).toBe(60);

      const add = screen.getByTestId('category-new-add');
      expect(add.props.accessibilityLabel).toBe('Add category');
      expect(add.props.accessibilityRole).toBe('button');
      expect(add.props.variant).toBe('secondary');
      expect(add.props.accessibilityState).toMatchObject({ disabled: true });
    });

    test('creates with the trimmed name from the button, selects it and clears the field', async () => {
      const onCreate = jest.fn(() => 'new-id');
      const onChange = jest.fn();
      await render(
        <CategoryPicker
          options={OPTIONS}
          value={FOOD}
          onChange={onChange}
          onCreate={onCreate}
        />,
      );

      await fireEvent.changeText(screen.getByTestId('category-new-name'), '  Museums ');
      expect(
        screen.getByTestId('category-new-add').props.accessibilityState,
      ).toMatchObject({ disabled: false });
      await fireEvent.press(screen.getByTestId('category-new-add'));

      expect(onCreate).toHaveBeenCalledWith('Museums');
      expect(onChange).toHaveBeenLastCalledWith('new-id');
      expect(screen.getByTestId('category-new-name').props.value).toBe('');
    });

    test('creates from the keyboard too, and ignores a blank draft', async () => {
      const onCreate = jest.fn(() => 'new-id');
      await renderCreating(onCreate);

      await fireEvent.changeText(screen.getByTestId('category-new-name'), '   ');
      await fireEvent(screen.getByTestId('category-new-name'), 'submitEditing');
      expect(onCreate).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByTestId('category-new-name'), 'Tips');
      await fireEvent(screen.getByTestId('category-new-name'), 'submitEditing');
      expect(onCreate).toHaveBeenCalledWith('Tips');
    });
  });

  test('says an error in words, as an alert with an icon, not colour alone (FR-025)', async () => {
    await render(
      <CategoryPicker
        options={OPTIONS}
        value=""
        onChange={jest.fn()}
        error="Pick a category."
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Pick a category.');
    expect(within(alert).getByText('Pick a category.')).toBeTruthy();
  });

  test('draws no alert without an error', async () => {
    await render(<CategoryPicker options={OPTIONS} value={FOOD} onChange={jest.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('is composed from the adapter layer only (no retired primitive, no kit)', () => {
    const source = sourceOf('@/components/trip/category-picker');
    expect(source).not.toMatch(/PressableSurface|ThemedText|PillGroup|\bSurface\b/);
    expect(source).not.toMatch(/ui\/text-field|TextField/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/use-appearance|Colors\[/);
  });
});
