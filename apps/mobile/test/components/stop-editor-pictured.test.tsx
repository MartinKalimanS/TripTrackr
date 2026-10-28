/**
 * F6 "Forms", objective 2: the stop editor AS PICTURED (feature 005; UI-SPEC 9.1 and 10;
 * `screens/more/add-stop*.png`; owner answer Q-11). One rule per test:
 *
 * - the place is a cream field with the flag, the city in bold and ", Country", and a clear
 *   button that keeps its id and its name ("Change city");
 * - the route preview is computed from the stops' real coordinates and says nothing it cannot
 *   know (no drive time, no distance without a position);
 * - Arrival and Departure are the two halves of one block and behave as `DateField` did
 *   (ids, names, hint, the Android dialog the Maestro flows tap, the iOS calendar);
 * - the Nights stepper is derived from the dates: it moves the departure, stores nothing;
 * - "Getting there" and "Note" are coming-soon controls: a toast and nothing else;
 * - Save stays in the footer above the keyboard in every state (rule 8).
 */
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { Platform, StyleSheet } from 'react-native';

import { NightsStepper, MAX_NIGHTS } from '@/components/trip/nights-stepper';
import { StopEditor, type StopEditorMode } from '@/components/trip/stop-editor';
import { MinTouchTarget } from '@/constants/theme';
import { haversineKm } from '@/features/globe/great-circle';
import {
  formatIsoDate,
  formatStopDay,
  formatStopMonthDay,
} from '@/features/trips/stop-dates';
import { formatDistance } from '@/lib/locale';

import { hostsWhere } from '../helpers/host-nodes';
import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

const mockPorto = {
  id: 7,
  country_id: 2,
  name: 'Porto',
  ascii_name: 'Porto',
  lat: 41.1579,
  lng: -8.6291,
  timezone: 'Europe/Lisbon',
  population: 230_000,
};
const mockPortugal = { id: 2, iso_code: 'PT', name: 'Portugal', continent: 'Europe' };

jest.mock('@/components/trip/city-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CityPicker: ({
      onSelect,
    }: {
      onSelect: (city: typeof mockPorto, country: typeof mockPortugal) => void;
    }) => (
      <Pressable testID="pick-porto" onPress={() => onSelect(mockPorto, mockPortugal)}>
        <Text>Pick Porto</Text>
      </Pressable>
    ),
  };
});

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};

const LISBON = { name: 'Lisboa', lat: 38.7223, lng: -9.1393 };
const SINTRA = { name: 'Sintra', lat: 38.8029, lng: -9.3817 };

const addMode: StopEditorMode = {
  kind: 'add',
  previousStop: { depart_date: '2026-10-15' },
  previousStops: [LISBON, SINTRA],
};
const editMode: StopEditorMode = {
  kind: 'edit',
  stop: { city_id: 7, arrive_date: '2026-10-15', depart_date: '2026-10-19' },
  placeName: 'Porto',
};

/** The flag chip and the icons are decorative, so a query for one looks at hidden nodes. */
const HIDDEN = { includeHiddenElements: true } as const;

const onSubmit = jest.fn();
const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  onSubmit.mockReset();
  mockToast.show.mockClear();
});
afterEach(() => {
  resetKeyboard();
  jest.restoreAllMocks();
});

const renderEditor = (mode: StopEditorMode = addMode) =>
  render(<StopEditor visible mode={mode} onCancel={jest.fn()} onSubmit={onSubmit} />);

const chosen = async (mode: StopEditorMode = addMode) => {
  await renderEditor(mode);
  await fireEvent.press(screen.getByTestId('pick-porto'));
};

const pickDay = async (id: string, date: Date) => {
  await fireEvent.press(screen.getByTestId(id));
  await act(async () => screen.getByTestId(`${id}-picker`).props.onValueChange({}, date));
};

describe('the place, as pictured', () => {
  test('is labelled "Place" over a field with the flag, the city and the country after it', async () => {
    await chosen();

    expect(screen.getByText('Place')).toBeTruthy();
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Porto, Portugal');
    expect(screen.getByTestId('stop-editor-place').props.accessibilityLabel).toBe(
      'Porto, Portugal',
    );
    expect(
      within(screen.getByTestId('stop-editor-place-field')).getByText('🇵🇹', HIDDEN),
    ).toBeTruthy();
  });

  test('the field has the 3:1 boundary and the field fill, in tokens, and is at least 56 dp tall', async () => {
    await chosen();

    const field = screen.getByTestId('stop-editor-place-field');
    expect(String(field.props.className)).toContain('bg-field');
    expect(flat(field).borderWidth).toBe(1);
    expect(flat(field).minHeight).toBeGreaterThanOrEqual(56);
  });

  test('"Change city" is a round clear button with the platform target, and it returns to the picker', async () => {
    await chosen();

    const clear = screen.getByTestId('stop-editor-change-city');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(clear.props.accessibilityLabel).toBe('Change city');
    expect(flat(clear).minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    expect(flat(clear).minHeight).toBeGreaterThanOrEqual(MinTouchTarget);

    await fireEvent.press(clear);
    expect(screen.getByTestId('pick-porto')).toBeTruthy();
    expect(screen.queryByTestId('stop-editor-arrive')).toBeNull();
    expect(screen.queryByTestId('stop-route')).toBeNull();
  });

  test('editing shows the place without a flag and without a way to change it', async () => {
    await renderEditor(editMode);

    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Porto');
    expect(screen.queryByTestId('stop-editor-place-flag')).toBeNull();
    expect(screen.queryByTestId('stop-editor-change-city')).toBeNull();
  });
});

describe('the route preview', () => {
  test('draws the last two stops and the new one: solid to the previous, dashed to the new', async () => {
    await chosen();

    const drawing = screen.getByTestId('stop-route-drawing');
    expect(drawing.props.accessibilityRole).toBe('image');
    expect(screen.getByText('LIS')).toBeTruthy();
    expect(screen.getByText('SIN')).toBeTruthy();
    expect(screen.getByText('POR')).toBeTruthy();
    expect(flat(screen.getByTestId('stop-route-leg')).borderStyle).toBe('solid');
    expect(flat(screen.getByTestId('stop-route-leg-new')).borderStyle).toBe('dashed');
    expect(flat(screen.getByTestId('stop-route-new')).borderWidth).toBe(2.5);
  });

  test('says "Stop 3" and the distance from the previous stop, computed from real coordinates', async () => {
    await chosen();

    const km = haversineKm([SINTRA.lng, SINTRA.lat], [mockPorto.lng, mockPorto.lat]);
    const expected = formatDistance(km);
    expect(screen.getByTestId('stop-route-meta')).toHaveTextContent(
      `Stop 3 · ${expected.text} from Sintra`,
    );
    expect(screen.getByTestId('stop-route-drawing').props.accessibilityLabel).toBe(
      `Route: Lisboa, Sintra, then Porto as Stop 3, ${expected.spoken} from Sintra`,
    );
  });

  test('has no distance when the previous stop was never cached: it says only what it knows', async () => {
    await chosen({
      kind: 'add',
      previousStop: { depart_date: '2026-10-15' },
      previousStops: [LISBON, { name: 'Sintra', lat: null, lng: null }],
    });

    expect(screen.getByTestId('stop-route-meta')).toHaveTextContent(
      'Stop 3 · after Sintra',
    );
    expect(screen.queryByText(/\d+\s?(km|mi)\b/)).toBeNull();
  });

  test('invents nothing: no drive time anywhere on the sheet', async () => {
    await chosen();
    expect(screen.queryByText(/\b\d+\s?(h|min|hr)\b/i)).toBeNull();
    expect(screen.queryByText(/drive|driving/i)).toBeNull();
  });

  test('the first stop of a trip has no route to draw', async () => {
    await chosen({ kind: 'add', previousStop: null, previousStops: [] });
    expect(screen.queryByTestId('stop-route')).toBeNull();
  });

  test('an editor given no stops (older callers) draws no route', async () => {
    await chosen({ kind: 'add', previousStop: { depart_date: '2026-10-15' } });
    expect(screen.queryByTestId('stop-route')).toBeNull();
  });
});

describe('the dates, as one block', () => {
  test('are two halves of one block, captioned, with the day in words', async () => {
    await chosen();

    const block = screen.getByTestId('stop-editor-dates');
    expect(screen.getByText('Dates')).toBeTruthy();
    expect(within(block).getByTestId('stop-editor-arrive')).toBeTruthy();
    expect(within(block).getByTestId('stop-editor-depart')).toBeTruthy();
    expect(within(block).getByText('Arrival')).toBeTruthy();
    expect(within(block).getByText('Departure')).toBeTruthy();
    expect(within(block).getByText(formatStopDay('2026-10-15'))).toBeTruthy();
    expect(within(block).getByText(formatStopDay('2026-10-16'))).toBeTruthy();
    expect(flat(block).borderWidth).toBe(1);
    expect(flat(block).minHeight).toBeGreaterThanOrEqual(56);
  });

  test('keep the ids and names the flows know: a button named by its label, valued with the full day, hinted', async () => {
    await chosen();

    const arrive = screen.getByTestId('stop-editor-arrive');
    expect(arrive.props.accessibilityRole).toBe('button');
    expect(arrive.props.accessibilityLabel).toBe('Arrival');
    expect(arrive.props.accessibilityValue).toEqual({
      text: formatIsoDate('2026-10-15'),
    });
    expect(arrive.props.accessibilityHint).toBe('Opens a calendar');
    expect(screen.getByLabelText('Departure')).toBe(
      screen.getByTestId('stop-editor-depart'),
    );
  });

  test('on Android a press opens the system dialog (Previous month, Next month, day cells) at the value, with the arrival as the minimum', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await chosen();
      await fireEvent.press(screen.getByTestId('stop-editor-depart'));

      expect(DateTimePickerAndroid.open).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'date',
          value: new Date(2026, 9, 16),
          minimumDate: new Date(2026, 9, 15),
        }),
      );
      const { onValueChange } = jest
        .mocked(DateTimePickerAndroid.open)
        .mock.calls.at(-1)![0];
      await act(async () => onValueChange?.({} as never, new Date(2026, 9, 22, 23, 50)));
      expect(screen.getByTestId('stop-editor-depart').props.accessibilityValue).toEqual({
        text: formatIsoDate('2026-10-22'),
      });
      expect(screen.queryByTestId('stop-editor-depart-picker')).toBeNull();
    } finally {
      os.restore();
    }
  });

  test('on iOS one inline calendar opens under the block, for one half at a time', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await chosen();
      await fireEvent.press(screen.getByTestId('stop-editor-arrive'));
      expect(screen.getByTestId('stop-editor-arrive-picker')).toBeTruthy();

      await fireEvent.press(screen.getByTestId('stop-editor-depart'));
      expect(screen.queryByTestId('stop-editor-arrive-picker')).toBeNull();
      expect(screen.getByTestId('stop-editor-depart-picker').props.minimumDate).toEqual(
        new Date(2026, 9, 15),
      );

      await fireEvent.press(screen.getByTestId('stop-editor-depart'));
      expect(screen.queryByTestId('stop-editor-depart-picker')).toBeNull();
    } finally {
      os.restore();
    }
  });

  test('moving the arrival past the departure drags the departure along; a pick is the local calendar day', async () => {
    await chosen();
    await pickDay('stop-editor-arrive', new Date(2026, 9, 30, 23, 45));

    expect(screen.getByTestId('stop-editor-arrive').props.accessibilityValue).toEqual({
      text: formatIsoDate('2026-10-30'),
    });
    expect(screen.getByTestId('stop-editor-depart').props.accessibilityValue).toEqual({
      text: formatIsoDate('2026-10-30'),
    });
  });

  test('a departure before the arrival is refused in words, as an alert, with the caption turned danger', async () => {
    await chosen();
    await pickDay('stop-editor-depart', new Date(2026, 9, 1));

    const words = screen.getByText('Departure can’t be before arrival.');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('stop-editor-depart-error')).toBe(words);
    expect(String(screen.getByText('Departure').props.className)).toContain(
      'text-danger',
    );
    expect(screen.getByTestId('stop-editor-save').props.accessibilityState).toMatchObject(
      { disabled: true },
    );
  });

  test('at the 1.5 text scale the halves stack and nothing is a fixed height', async () => {
    setWindow({ width: 390, height: 844, fontScale: 1.5 });
    await chosen();

    const block = screen.getByTestId('stop-editor-dates');
    expect(flat(block).flexDirection).toBe('column');
    expect(flat(block).minHeight).toBeGreaterThanOrEqual(56 * 1.5);
    expect(flat(block).height).toBeUndefined();
  });

  test('at the default text size the halves sit side by side', async () => {
    setWindow(PHONE_360X640);
    await chosen();
    expect(flat(screen.getByTestId('stop-editor-dates')).flexDirection).toBe('row');
  });
});

describe('the Nights stepper', () => {
  const nightsText = () => screen.getByTestId('stop-editor-nights-value');

  test('shows the nights between the dates, where the stay ends, and is named for a screen reader', async () => {
    await chosen();

    expect(nightsText()).toHaveTextContent('1');
    expect(nightsText().props.accessibilityLabel).toBe('1 night');
    expect(nightsText().props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Nights')).toBeTruthy();
    expect(screen.getByText(`Ends ${formatStopMonthDay('2026-10-16')}`)).toBeTruthy();
  });

  test('the buttons are named, 44 dp round and sit either side of the number', async () => {
    await chosen();

    const less = screen.getByTestId('stop-editor-nights-less');
    const more = screen.getByTestId('stop-editor-nights-more');
    expect(less.props.accessibilityLabel).toBe('Fewer nights');
    expect(more.props.accessibilityLabel).toBe('More nights');
    for (const button of [less, more]) {
      expect(flat(button).width).toBeGreaterThanOrEqual(44);
      expect(flat(button).height).toBe(flat(button).width);
      expect(flat(button).borderRadius).toBeGreaterThan(0);
    }
  });

  test('more nights move the departure out and never the arrival; fewer bring it back', async () => {
    await chosen();

    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    expect(nightsText()).toHaveTextContent('4');
    expect(nightsText().props.accessibilityLabel).toBe('4 nights');
    expect(screen.getByTestId('stop-editor-depart').props.accessibilityValue).toEqual({
      text: formatIsoDate('2026-10-19'),
    });
    expect(screen.getByText(`Ends ${formatStopMonthDay('2026-10-19')}`)).toBeTruthy();
    expect(screen.getByTestId('stop-editor-arrive').props.accessibilityValue).toEqual({
      text: formatIsoDate('2026-10-15'),
    });

    await fireEvent.press(screen.getByTestId('stop-editor-nights-less'));
    expect(nightsText()).toHaveTextContent('3');
    expect(screen.getByText(formatStopDay('2026-10-18'))).toBeTruthy();
  });

  test('is derived: picking a departure changes the count, and the count never goes below 0', async () => {
    await chosen();
    await pickDay('stop-editor-depart', new Date(2026, 9, 15));

    expect(nightsText()).toHaveTextContent('0');
    expect(
      screen.getByTestId('stop-editor-nights-less').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByTestId('stop-editor-nights-less'));
    expect(nightsText()).toHaveTextContent('0');

    await pickDay('stop-editor-depart', new Date(2026, 10, 14));
    expect(nightsText()).toHaveTextContent('30');
  });

  test('a refused pair shows 0 and "More nights" repairs it', async () => {
    await chosen();
    await pickDay('stop-editor-depart', new Date(2026, 9, 1));
    expect(nightsText()).toHaveTextContent('0');

    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    expect(screen.queryByText('Departure can’t be before arrival.')).toBeNull();
    expect(nightsText()).toHaveTextContent('1');
  });

  test('stores nothing new: saving writes the same three fields as before', async () => {
    await chosen();
    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      city_id: 7,
      arrive_date: '2026-10-15',
      depart_date: '2026-10-17',
    });
  });

  test('editing a stop has the stepper too, and "Save dates" keeps its words', async () => {
    await renderEditor(editMode);

    expect(nightsText()).toHaveTextContent('4');
    await fireEvent.press(screen.getByTestId('stop-editor-nights-less'));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      city_id: 7,
      arrive_date: '2026-10-15',
      depart_date: '2026-10-18',
    });
  });
});

describe('<NightsStepper> on its own', () => {
  const stepper = (nights: number, onChange = jest.fn()) =>
    render(<NightsStepper nights={nights} endsOn="19 Oct" onChange={onChange} />);

  test('asks for one more or one fewer than it shows, and says "1 night" in the singular', async () => {
    const onChange = jest.fn();
    await stepper(1, onChange);

    expect(screen.getByTestId('stop-editor-nights-value').props.accessibilityLabel).toBe(
      '1 night',
    );
    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    await fireEvent.press(screen.getByTestId('stop-editor-nights-less'));
    expect(onChange.mock.calls).toEqual([[2], [0]]);
  });

  test('stops at the cap: the button is dimmed and announced unavailable, the press is dropped', async () => {
    const onChange = jest.fn();
    await stepper(MAX_NIGHTS, onChange);

    expect(
      screen.getByTestId('stop-editor-nights-more').props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByTestId('stop-editor-nights-more'));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('shows a negative count as 0 and wraps its words instead of squeezing them', async () => {
    await stepper(-3);

    expect(screen.getByTestId('stop-editor-nights-value')).toHaveTextContent('0');
    expect(flat(screen.getByTestId('stop-editor-nights')).flexWrap).toBe('wrap');
    expect(flat(screen.getByTestId('stop-editor-nights')).height).toBeUndefined();
  });
});

describe('on Android', () => {
  test('the chosen sheet renders with the platform touch floor on the clear button and the stepper', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await chosen();
      expect(flat(screen.getByTestId('stop-editor-change-city')).minWidth).toBe(
        MinTouchTarget,
      );
      expect(flat(screen.getByTestId('stop-editor-nights-more')).width).toBe(
        MinTouchTarget,
      );
      expect(screen.getByTestId('stop-editor-save')).toBeTruthy();
    } finally {
      os.restore();
    }
  });
});

describe('"Getting there" and "Note": drawn as pictured, coming soon (Q-11)', () => {
  test('four transport chips in one sideways row, none chosen, each a hinted button', async () => {
    await chosen();

    expect(screen.getByText('Getting there')).toBeTruthy();
    expect(screen.getAllByText('(optional)')).toHaveLength(2);
    for (const name of ['car', 'train', 'plane', 'walk']) {
      const chip = screen.getByTestId(`coming-soon-stop-mode-${name}`);
      expect(chip.props.accessibilityRole).toBe('button');
      expect(chip.props.accessibilityHint).toBe('Not available yet');
      expect(chip.props.accessibilityState).toMatchObject({ selected: false });
    }
    expect(screen.getByLabelText('Car')).toBeTruthy();
    expect(screen.getByLabelText('Walk')).toBeTruthy();
  });

  test('a chip press is one toast and nothing else: nothing is chosen, nothing saved', async () => {
    await chosen();
    await fireEvent.press(screen.getByTestId('coming-soon-stop-mode-train'));

    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0]?.[0]).toMatchObject({ id: 'coming-soon' });
    expect(
      screen.getByTestId('coming-soon-stop-mode-train').props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('the note is a labelled box that is a button, not an input, with no invented text', async () => {
    await chosen();

    const note = screen.getByTestId('coming-soon-stop-note');
    expect(screen.getByText('Note')).toBeTruthy();
    expect(note.props.accessibilityRole).toBe('button');
    expect(note.props.accessibilityLabel).toBe('Note');
    expect(note.props.accessibilityHint).toBe('Not available yet');
    expect(flat(note).minHeight).toBeGreaterThanOrEqual(96);
    expect(screen.queryByText(/Livraria|Lello|Ribeira/)).toBeNull();

    await fireEvent.press(note);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('neither is a text input: the sheet has no field that would keep what is typed', async () => {
    await chosen();
    expect(hostsWhere((node) => node.type === 'TextInput')).toHaveLength(0);
  });

  test('they are shown when adding only, and after a place is chosen', async () => {
    await renderEditor();
    expect(screen.queryByTestId('stop-getting-there')).toBeNull();
    expect(screen.queryByTestId('stop-note')).toBeNull();
    await screen.unmount();

    await renderEditor(editMode);
    expect(screen.queryByTestId('stop-getting-there')).toBeNull();
    expect(screen.queryByTestId('stop-note')).toBeNull();
  });

  test('reads in the pictured order: place, route, dates, nights, getting there, note, then the footer', async () => {
    await chosen();

    const order = screen
      .getAllByText(/^(Place|Dates|Nights|Getting there|Note|Save stop)$/)
      .map((node) => String(node.props.children));
    expect(order).toEqual([
      'Place',
      'Dates',
      'Nights',
      'Getting there',
      'Note',
      'Save stop',
    ]);
  });
});

describe('Save is sticky above the keyboard (C4-10 rule 8)', () => {
  beforeEach(() => setWindow(PHONE_360X640));

  test('in every state: picking, chosen with every field, and editing', async () => {
    await renderEditor();
    await showKeyboard();
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');

    await fireEvent.press(screen.getByTestId('pick-porto'));
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
    expect(screen.getByTestId('stop-editor-body').props.keyboardShouldPersistTaps).toBe(
      'handled',
    );
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await screen.unmount();
    await renderEditor(editMode);
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
  });

  test('the coming-soon chips answer with the keyboard up (taps are kept)', async () => {
    await chosen();
    await showKeyboard();

    await fireEvent.press(screen.getByTestId('coming-soon-stop-mode-plane'));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
  });
});

describe('the pictured parts are tokens and adapters only', () => {
  const sources = [
    'place-field',
    'route-preview',
    'stop-dates-block',
    'nights-stepper',
    'stop-coming-soon',
    'stop-field-label',
  ].map((name) => [
    name,
    readFileSync(require.resolve(`@/components/trip/${name}`), 'utf8'),
  ]);

  test.each(sources)(
    '%s has no colour literal, no kit and no legacy token',
    (_name, source) => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
      expect(source).not.toMatch(/use-appearance|Colors\[/);
    },
  );

  test('the coming-soon fields import no router, store, repository, client or network', () => {
    const source = String(sources.find(([name]) => name === 'stop-coming-soon')?.[1]);
    expect(source).not.toMatch(
      /expo-router|@\/db|@\/features|@\/sync|api-client|fetch\(|useState/,
    );
  });

  test('the route preview and the stepper keep to the pure helpers for every figure', () => {
    const route = String(sources.find(([name]) => name === 'route-preview')?.[1]);
    expect(route).not.toMatch(/Math\.(random|floor|round)/);
    expect(route).toMatch(/formatDistance/);
    const stepper = String(sources.find(([name]) => name === 'nights-stepper')?.[1]);
    expect(stepper).not.toMatch(/Intl\.PluralRules|date-fns/);
  });
});
