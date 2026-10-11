/**
 * T052 — trip creation form validation and stop ordering.
 *
 * Three concerns, each pinned at the level where it lives:
 *   - the add-trip form's rules are the wire schema's, translated to words
 *     (`validateTripForm`) and rendered as such by `<CurrencyPicker>`;
 *   - stop ordering: move up / move down produces a contiguous `sort_order`
 *     (`reorderStops`, the pure core the repository applies);
 *   - stop dates: a departure before the arrival is refused, same-day allowed
 *     (`validateStopDates`, and the `<StopEditor>` that shows it in words).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CurrencyPicker } from '@/components/trip/currency-picker';
import { StopEditor } from '@/components/trip/stop-editor';
import { reorderStops } from '@/db/repositories/stops';
import { validateStopDates } from '@/features/trips/stop-dates';
import {
  TRIP_FORM_COPY,
  hasTripFormErrors,
  validateTripForm,
} from '@/features/trips/trip-form';

jest.mock('@/components/trip/city-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CityPicker: ({
      onSelect,
    }: {
      onSelect: (city: unknown, country: unknown) => void;
    }) => (
      <Pressable
        testID="pick-rome"
        onPress={() =>
          onSelect(
            {
              id: 100,
              country_id: 1,
              name: 'Roma',
              ascii_name: 'Roma',
              lat: 41.9,
              lng: 12.5,
              timezone: 'Europe/Rome',
              population: 2_800_000,
            },
            { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
          )
        }>
        <Text>Pick Rome</Text>
      </Pressable>
    ),
  };
});

describe('add-trip form validation (FR-009; research D-21)', () => {
  test('an empty title is refused in words', async () => {
    const errors = await validateTripForm({ title: '', home_currency: 'EUR' });
    expect(errors).toEqual({ title: TRIP_FORM_COPY.titleMissing });
    expect(hasTripFormErrors(errors)).toBe(true);
  });

  test('a whitespace-only title is an empty title', async () => {
    expect((await validateTripForm({ title: '   ', home_currency: 'EUR' })).title).toBe(
      TRIP_FORM_COPY.titleMissing,
    );
  });

  test('an over-long title is refused with its own message', async () => {
    expect(
      (await validateTripForm({ title: 'x'.repeat(201), home_currency: 'EUR' })).title,
    ).toBe(TRIP_FORM_COPY.titleTooLong);
  });

  test.each(['eur', 'EU', 'EURO', '', 'E1R'])(
    'the currency code %p is refused',
    async (code) => {
      expect(
        (await validateTripForm({ title: 'Italy', home_currency: code })).home_currency,
      ).toBe(TRIP_FORM_COPY.currencyInvalid);
    },
  );

  test('a valid title and code pass with no messages', async () => {
    const errors = await validateTripForm({
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
    });
    expect(errors).toEqual({});
    expect(hasTripFormErrors(errors)).toBe(false);
  });

  test('both fields can fail at once, each with its own message', async () => {
    expect(await validateTripForm({ title: '', home_currency: 'x' })).toEqual({
      title: TRIP_FORM_COPY.titleMissing,
      home_currency: TRIP_FORM_COPY.currencyInvalid,
    });
  });
});

describe('<CurrencyPicker>', () => {
  test('marks the chosen common code as selected and reports a pill press', async () => {
    const onChange = jest.fn();
    await render(<CurrencyPicker value="EUR" onChange={onChange} />);

    expect(screen.getByTestId('currency-EUR').props.accessibilityState).toMatchObject({
      selected: true,
    });
    await fireEvent.press(screen.getByTestId('currency-GBP'));
    expect(onChange).toHaveBeenCalledWith('GBP');
  });

  test('keeps the common codes on one scrolling line, not a wall of buttons (feature 003 FR-017)', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);

    // `currency-pills` is the radiogroup (the ChipGroup); its one scroller is inside it.
    const group = screen.getByTestId('currency-pills');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    const lines = group.queryAll((node) => node.props.horizontal === true);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.props.showsHorizontalScrollIndicator).toBe(false);
    // Every common code is still there, in the one line.
    for (const code of [
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CHF',
      'CAD',
      'AUD',
      'CZK',
      'PLN',
      'SEK',
    ]) {
      expect(screen.getByTestId(`currency-${code}`)).toBeTruthy();
    }
  });

  test('keeps any other code behind an "Other" control until it is asked for (feature 003 FR-017)', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);
    expect(screen.queryByLabelText('Other currency code')).toBeNull();

    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    expect(screen.getByLabelText('Other currency code')).toBeTruthy();
    expect(
      screen.getByTestId('currency-other-toggle').props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  test('opening "Other" clears a common choice, so exactly one option is ever selected', async () => {
    const onChange = jest.fn();
    await render(<CurrencyPicker value="EUR" onChange={onChange} />);

    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    expect(onChange).toHaveBeenCalledWith('');
  });

  test('opening "Other" keeps a code the traveller already typed', async () => {
    const onChange = jest.fn();
    await render(<CurrencyPicker value="THB" onChange={onChange} />);

    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Other currency code').props.value).toBe('THB');
  });

  test('hides the free-text field again once a common code is chosen', async () => {
    await render(<CurrencyPicker value="EUR" onChange={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    await fireEvent.press(screen.getByTestId('currency-GBP'));
    expect(screen.queryByLabelText('Other currency code')).toBeNull();
  });

  test('upper-cases and caps free text at three letters', async () => {
    const onChange = jest.fn();
    await render(<CurrencyPicker value="" onChange={onChange} />);

    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    await fireEvent.changeText(screen.getByLabelText('Other currency code'), 'thbx');
    expect(onChange).toHaveBeenCalledWith('THB');
  });

  test('gives a validation message its field even when "Other" was never opened (FR-010)', async () => {
    await render(
      <CurrencyPicker value="" onChange={jest.fn()} error="Use a 3-letter code." />,
    );
    expect(screen.getByLabelText('Other currency code')).toBeTruthy();
    expect(screen.getByText('Use a 3-letter code.')).toBeTruthy();
  });

  test('shows an uncommon code in the free-text field, not as a pill', async () => {
    await render(<CurrencyPicker value="THB" onChange={jest.fn()} />);
    expect(screen.getByLabelText('Other currency code').props.value).toBe('THB');
    expect(screen.queryByTestId('currency-THB')).toBeNull();
  });

  test('shows a validation message in words (FR-010)', async () => {
    await render(
      <CurrencyPicker value="EU" onChange={jest.fn()} error="Use a 3-letter code." />,
    );
    expect(screen.getByText('Use a 3-letter code.')).toBeTruthy();
  });
});

describe('stop ordering (FR-012)', () => {
  const stops = ['a', 'b', 'c', 'd'].map((id, sort_order) => ({ id, sort_order }));

  const apply = (
    list: { id: string; sort_order: number }[],
    changes: { id: string; sort_order: number }[],
  ) =>
    list
      .map((stop) => ({ ...stop, ...changes.find((change) => change.id === stop.id) }))
      .sort((x, y) => x.sort_order - y.sort_order);

  test('move down then up returns to the original, contiguous order', () => {
    const afterDown = apply(stops, reorderStops(stops, 'b', 'down'));
    expect(afterDown.map((s) => s.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(afterDown.map((s) => s.sort_order)).toEqual([0, 1, 2, 3]);

    const afterUp = apply(afterDown, reorderStops(afterDown, 'b', 'up'));
    expect(afterUp.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(afterUp.map((s) => s.sort_order)).toEqual([0, 1, 2, 3]);
  });

  test('Acceptance Scenario 1.6: moving the third stop to first position, one step at a time', () => {
    let current = stops.slice(0, 3);
    current = apply(current, reorderStops(current, 'c', 'up'));
    current = apply(current, reorderStops(current, 'c', 'up'));
    expect(current.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(current.map((s) => s.sort_order)).toEqual([0, 1, 2]);
  });

  test('only the stops that changed position are written', () => {
    expect(reorderStops(stops, 'c', 'down')).toEqual([
      { id: 'd', sort_order: 2 },
      { id: 'c', sort_order: 3 },
    ]);
  });
});

describe('stop date validation (FR-011)', () => {
  test('depart before arrive is refused', () => {
    expect(validateStopDates('2026-05-12', '2026-05-10')).toBe(
      'Departure can’t be before arrival.',
    );
  });

  test('same day is allowed', () => {
    expect(validateStopDates('2026-05-12', '2026-05-12')).toBeNull();
  });
});

describe('<StopEditor>', () => {
  const pickDate = async (fieldTestId: string, date: Date) => {
    await fireEvent.press(screen.getByTestId(fieldTestId));
    const picker = screen.getByTestId(`${fieldTestId}-picker`);
    await act(async () => picker.props.onValueChange({}, date));
  };

  test('add mode: pre-suggests arrival from the previous departure and a one-night stay (FR-015)', async () => {
    const onSubmit = jest.fn();
    await render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: { depart_date: '2026-05-12' } }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    // No city yet: the dates and save are held back.
    expect(screen.queryByTestId('stop-editor-arrive')).toBeNull();
    expect(screen.getByTestId('stop-editor-save').props.accessibilityState).toMatchObject(
      {
        disabled: true,
      },
    );

    await fireEvent.press(screen.getByTestId('pick-rome'));
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Roma');
    expect(
      screen.getByTestId('stop-editor-arrive').props.accessibilityValue.text,
    ).toMatch(/12/);
    expect(
      screen.getByTestId('stop-editor-depart').props.accessibilityValue.text,
    ).toMatch(/13/);

    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith({
      city_id: 100,
      arrive_date: '2026-05-12',
      depart_date: '2026-05-13',
    });
  });

  test('add mode with no previous stop suggests today', async () => {
    await render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: null }}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('pick-rome'));
    const today = new Date();
    expect(
      screen.getByTestId('stop-editor-arrive').props.accessibilityValue.text,
    ).toMatch(String(today.getDate()));
  });

  test('Acceptance Scenario 1.8: a departure before the arrival is refused with a clear message and save is held', async () => {
    const onSubmit = jest.fn();
    await render(
      <StopEditor
        visible
        mode={{
          kind: 'edit',
          stop: { city_id: 100, arrive_date: '2026-05-10', depart_date: '2026-05-12' },
          placeName: 'Roma',
        }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    await pickDate('stop-editor-depart', new Date(2026, 4, 8));

    expect(screen.getByText('Departure can’t be before arrival.')).toBeTruthy();
    expect(screen.getByTestId('stop-editor-save').props.accessibilityState).toMatchObject(
      {
        disabled: true,
      },
    );
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a same-day stop is allowed', async () => {
    const onSubmit = jest.fn();
    await render(
      <StopEditor
        visible
        mode={{
          kind: 'edit',
          stop: { city_id: 100, arrive_date: '2026-05-10', depart_date: '2026-05-12' },
          placeName: 'Roma',
        }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    await pickDate('stop-editor-depart', new Date(2026, 4, 10));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(onSubmit).toHaveBeenCalledWith({
      city_id: 100,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-10',
    });
  });

  test('moving the arrival past the departure drags the departure along so the pair stays valid', async () => {
    const onSubmit = jest.fn();
    await render(
      <StopEditor
        visible
        mode={{
          kind: 'edit',
          stop: { city_id: 100, arrive_date: '2026-05-10', depart_date: '2026-05-12' },
          placeName: 'Roma',
        }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    await pickDate('stop-editor-arrive', new Date(2026, 4, 20));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(onSubmit).toHaveBeenCalledWith({
      city_id: 100,
      arrive_date: '2026-05-20',
      depart_date: '2026-05-20',
    });
  });

  test('"Change" returns to the city picker and holds the dates again', async () => {
    await render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: null }}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('pick-rome'));
    await fireEvent.press(screen.getByTestId('stop-editor-change-city'));

    expect(screen.getByTestId('pick-rome')).toBeTruthy();
    expect(screen.queryByTestId('stop-editor-arrive')).toBeNull();
  });

  test('cancel reports back and nothing is submitted', async () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    await render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: null }}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    await fireEvent.press(screen.getByTestId('stop-editor-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('renders nothing of the form while hidden, so a cancelled draft does not linger', async () => {
    await render(
      <StopEditor
        visible={false}
        mode={{ kind: 'add', previousStop: null }}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('stop-editor-save')).toBeNull();
  });
});
