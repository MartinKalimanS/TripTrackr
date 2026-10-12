/**
 * T067 — the country-filtered searchable city picker (FR-014).
 *
 * The geography hooks are mocked (their own suite runs them against the API
 * client and a real cache). Pinned here: the two steps, the country filter,
 * the debounce before the search fires, the offline note, and that a pick
 * returns the wire `City` with its country.
 *
 * T437 (feature 004; FR-009, FR-024, FR-025, FR-029, FR-030, FR-037) adds what the picker owes
 * the Atlas look: a search `Field`, rows that are one `ListRow` each with the names they had,
 * designed loading, empty and error states beside the field, a list that scrolls with the
 * sheet it sits in (never a scroller of its own), and a stop editor whose Save stays above the
 * keyboard while the city search is the field being typed in.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { StyleSheet } from 'react-native';

import { CITY_QUERY_DEBOUNCE_MS, CityPicker } from '@/components/trip/city-picker';
import { StopEditor } from '@/components/trip/stop-editor';

import { scrollers } from '../helpers/host-nodes';
import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

type QueryStub<T> = {
  data: { items: T[]; offline: boolean } | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: jest.Mock;
};

const italy = { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' };
const spain = { id: 2, iso_code: 'ES', name: 'Spain', continent: 'Europe' };
const cotedivoire = { id: 3, iso_code: 'CI', name: 'Côte d’Ivoire', continent: 'Africa' };
const rome = {
  id: 100,
  country_id: 1,
  name: 'Roma',
  ascii_name: 'Roma',
  lat: 41.9,
  lng: 12.5,
  timezone: 'Europe/Rome',
  population: 2_800_000,
};
const forli = {
  ...rome,
  id: 103,
  name: 'Forlì',
  ascii_name: 'Forli',
  population: 118_000,
};

const mockCountries: QueryStub<typeof italy> = {
  data: { items: [italy, spain, cotedivoire], offline: false },
  isPending: false,
  isError: false,
  refetch: jest.fn(),
};
const mockCities: QueryStub<typeof rome> = {
  data: { items: [rome, forli], offline: false },
  isPending: false,
  isError: false,
  refetch: jest.fn(),
};
const mockUseCitySearch = jest.fn(
  (_countryId: number | null, _query: string) => mockCities,
);

jest.mock('@/features/geography/use-geography', () => ({
  useCountries: () => mockCountries,
  useCitySearch: (countryId: number | null, query: string) =>
    mockUseCitySearch(countryId, query),
}));

beforeEach(() => {
  mockCountries.data = { items: [italy, spain, cotedivoire], offline: false };
  mockCountries.isPending = false;
  mockCountries.isError = false;
  mockCities.data = { items: [rome, forli], offline: false };
  mockCities.isPending = false;
  mockCities.isError = false;
  mockUseCitySearch.mockClear();
});

describe('<CityPicker> — step 1, country', () => {
  test('lists every country with a designed loading state first (FR-027)', async () => {
    mockCountries.isPending = true;
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(screen.getByLabelText('Loading countries')).toBeTruthy();
  });

  test('filters the list as the traveller types, tolerant of accents and ISO codes', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(screen.getByTestId('city-picker-country-IT')).toBeTruthy();
    expect(screen.getByTestId('city-picker-country-ES')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Country'), 'cote');
    expect(screen.getByTestId('city-picker-country-CI')).toBeTruthy();
    expect(screen.queryByTestId('city-picker-country-IT')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Country'), 'es');
    expect(screen.getByTestId('city-picker-country-ES')).toBeTruthy();
  });

  test('shows a designed empty state when nothing matches', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Country'), 'zzz');
    expect(screen.getByText('No country matches')).toBeTruthy();
  });

  test('says so when the list came from the offline cache', async () => {
    mockCountries.data = { items: [italy], offline: true };
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(screen.getByText('Offline — showing saved places')).toBeTruthy();
  });

  test('offers a retry when countries could not be loaded', async () => {
    mockCountries.isError = true;
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockCountries.refetch).toHaveBeenCalled();
  });
});

describe('<CityPicker> — step 2, city', () => {
  test('after a country is chosen, searches its cities with a 250 ms debounce and returns the pick with its country', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();
    await render(<CityPicker onSelect={onSelect} />);

    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(mockUseCitySearch).toHaveBeenLastCalledWith(1, '');

    await fireEvent.changeText(screen.getByLabelText('City'), 'Ro');
    // Not yet: the keystroke has to settle first.
    expect(mockUseCitySearch).toHaveBeenLastCalledWith(1, '');

    await act(async () => {
      jest.advanceTimersByTime(CITY_QUERY_DEBOUNCE_MS);
    });
    expect(mockUseCitySearch).toHaveBeenLastCalledWith(1, 'Ro');

    await fireEvent.press(screen.getByTestId('city-picker-city-100'));
    expect(onSelect).toHaveBeenCalledWith(rome, italy);
    jest.useRealTimers();
  });

  test('shows the accent-stripped name beneath a city whose display name differs', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(screen.getByText('Forlì')).toBeTruthy();
    expect(screen.getByText('Forli')).toBeTruthy();
  });

  test('"Change" returns to the country step', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    await fireEvent.press(screen.getByTestId('city-picker-change-country'));
    expect(screen.getByLabelText('Country')).toBeTruthy();
  });

  test('says so when the cities came from the offline cache', async () => {
    mockCities.data = { items: [rome], offline: true };
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(screen.getByText('Offline — showing saved places')).toBeTruthy();
  });

  test('shows loading, empty, and error states for the search (FR-027)', async () => {
    mockCities.isPending = true;
    mockCities.data = undefined;
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(screen.getByLabelText('Searching cities')).toBeTruthy();

    mockCities.isPending = false;
    mockCities.data = { items: [], offline: false };
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getAllByTestId('city-picker-country-IT').at(-1)!);
    expect(screen.getByText('No city matches')).toBeTruthy();

    mockCities.isError = true;
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getAllByTestId('city-picker-country-IT').at(-1)!);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockCities.refetch).toHaveBeenCalled();
  });
});

const hidden = { includeHiddenElements: true };

/** Forty-five countries: more than the picker shows at once (`MAX_COUNTRY_ROWS`, 40). */
const manyCountries = Array.from({ length: 45 }, (_, index) => ({
  id: 1000 + index,
  iso_code:
    String.fromCharCode(65 + Math.floor(index / 26)) +
    String.fromCharCode(65 + (index % 26)),
  name: `Atlantis ${index}`,
  continent: 'Europe',
}));

describe('<CityPicker> - on the Atlas adapters (T437; FR-024, FR-025, FR-029, FR-030)', () => {
  afterEach(() => resetKeyboard());

  test('is composed from the adapter layer: no retired primitive, no kit, no colour literal', () => {
    const source = readFileSync(require.resolve('@/components/trip/city-picker'), 'utf8');
    expect(source).not.toMatch(
      /PressableSurface|ThemedText|ThemedView|TextField|\bSurface\b/,
    );
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(source).not.toMatch(/use-appearance|Colors\[/);
  });

  test('the country filter is a labelled Field: the label on top, the input named by it', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);

    const filter = screen.getByTestId('city-picker-country-filter');
    expect(screen.getByText('Country')).toBeTruthy();
    expect(filter.props.accessibilityLabel).toBe('Country');
    expect(filter.props.placeholder).toBe('Start typing a country');
    expect(filter.props.autoCorrect).toBe(false);
    expect(filter.props.autoCapitalize).toBe('words');
    expect(filter.props['aria-invalid']).toBe(false);
    expect(screen.queryByText('Keep typing to narrow the list')).toBeNull();
  });

  test('a country is ONE row: a button named by the country, the continent beneath it, a cue', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);

    const row = screen.getByTestId('city-picker-country-IT');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Italy');
    expect(row.props.accessible).toBe(true);
    expect(within(row).getByText('Europe')).toBeTruthy();
    expect(screen.getByTestId('city-picker-country-IT-cue', hidden)).toBeTruthy();
  });

  test('the rows are ONE group with a separator between each pair, not a wall of cards', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);

    const group = screen.getByTestId('city-picker-country-list');
    expect(within(group).getByTestId('city-picker-country-IT')).toBeTruthy();
    expect(within(group).getByTestId('city-picker-country-ES')).toBeTruthy();
    expect(screen.getByTestId('city-picker-country-list-separator-1')).toBeTruthy();
    expect(screen.getByTestId('city-picker-country-list-separator-2')).toBeTruthy();
    expect(screen.queryByTestId('city-picker-country-list-separator-3')).toBeNull();
  });

  test('names the change-country row and a city row exactly as they were named before', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));

    const change = screen.getByTestId('city-picker-change-country');
    expect(change.props.accessibilityRole).toBe('button');
    expect(change.props.accessibilityLabel).toBe('Country: Italy. Change country');
    expect(within(change).getByText('Change')).toBeTruthy();

    const city = screen.getByTestId('city-picker-city-100');
    expect(city.props.accessibilityRole).toBe('button');
    expect(city.props.accessibilityLabel).toBe('Roma, Italy');
    expect(within(city).getByText('Roma')).toBeTruthy();
    expect(screen.getByTestId('city-picker-city-list')).toBeTruthy();
  });

  test('the city field is a labelled Field and keeps its behaviour: focus, placeholder, no autocorrect', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));

    const query = screen.getByTestId('city-picker-city-query');
    expect(query.props.accessibilityLabel).toBe('City');
    expect(query.props.placeholder).toBe('A city in Italy');
    expect(query.props.autoFocus).toBe(true);
    expect(query.props.autoCorrect).toBe(false);
    expect(query.props.autoCapitalize).toBe('words');
  });

  test('never scrolls by itself: the sheet it sits in does, so one gesture moves the whole form', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(scrollers()).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(scrollers()).toHaveLength(0);
  });

  test('shows at most 40 countries and says to keep typing; narrowing the list takes the note away', async () => {
    mockCountries.data = { items: manyCountries, offline: false };
    await render(<CityPicker onSelect={jest.fn()} />);

    expect(screen.getAllByTestId(/^city-picker-country-[A-Z]{2}$/)).toHaveLength(40);
    expect(screen.getByText('Keep typing to narrow the list')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Country'), 'Atlantis 4');
    expect(screen.getAllByTestId(/^city-picker-country-[A-Z]{2}$/)).toHaveLength(6);
    expect(screen.queryByText('Keep typing to narrow the list')).toBeNull();
  });

  test.each([
    ['loading', { isPending: true, data: undefined }],
    ['empty', { data: { items: [], offline: false } }],
    ['failed', { isError: true }],
  ])(
    'keeps the city field on screen while the search is %s, so a traveller can retype',
    async (_state, patch) => {
      Object.assign(mockCities, patch);
      await render(<CityPicker onSelect={jest.fn()} />);
      await fireEvent.press(screen.getByTestId('city-picker-country-IT'));

      expect(screen.getByTestId('city-picker-city-query')).toBeTruthy();
      expect(screen.queryByTestId('city-picker-city-list')).toBeNull();
    },
  );

  test('the empty state names the next step: start typing, then try another spelling', async () => {
    jest.useFakeTimers();
    mockCities.data = { items: [], offline: false };
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(screen.getByText('Start typing a city name.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('City'), 'zz');
    await act(async () => {
      jest.advanceTimersByTime(CITY_QUERY_DEBOUNCE_MS);
    });
    expect(screen.getByText('Try another spelling.')).toBeTruthy();
    jest.useRealTimers();
  });

  test('an unreadable country list says so in words, with what to do about it', async () => {
    mockCountries.isError = true;
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(screen.getByText('Couldn’t load countries')).toBeTruthy();
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();
  });

  test('a country filter with no match says so and what to try', async () => {
    await render(<CityPicker onSelect={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Country'), 'zzz');
    expect(screen.getByText('No country matches')).toBeTruthy();
    expect(screen.getByText('Try another spelling.')).toBeTruthy();
    expect(screen.getByLabelText('Country')).toBeTruthy();
  });

  test('says it is offline in words, as an alert, for both steps', async () => {
    mockCountries.data = { items: [italy], offline: true };
    mockCities.data = { items: [rome], offline: true };
    await render(<CityPicker onSelect={jest.fn()} />);
    expect(
      screen.getByText('Offline — showing saved places').props.accessibilityRole,
    ).toBe('alert');

    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    expect(
      screen.getByText('Offline — showing saved places').props.accessibilityRole,
    ).toBe('alert');
  });

  test('a row grows with the text instead of clipping it: a scaled minimum, no fixed height, no line limit', async () => {
    setWindow({ ...PHONE_360X640, fontScale: 3 });
    await render(<CityPicker onSelect={jest.fn()} />);

    const row = screen.getByTestId('city-picker-country-IT');
    const style = StyleSheet.flatten(row.props.style) as Record<string, unknown>;
    expect(style.minHeight).toBe(60 * 3);
    expect(style.height).toBeUndefined();
    expect(within(row).getByText('Italy').props.numberOfLines).toBeUndefined();
    expect(within(row).getByText('Europe').props.numberOfLines).toBeUndefined();
  });
});

describe('<CityPicker> - inside the stop editor sheet (T437; C4-10 rule 8; FR-009)', () => {
  afterEach(() => resetKeyboard());

  const renderEditor = (onSubmit = jest.fn()) =>
    render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: { depart_date: '2026-05-12' } }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

  test('the picker lives in the sheet’s scrolling body, which keeps taps while the keyboard is up', async () => {
    await renderEditor();

    const body = screen.getByTestId('stop-editor-body');
    expect(body.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(body).getByTestId('city-picker-country-list')).toBeTruthy();
    await fireEvent.press(within(body).getByTestId('city-picker-country-IT'));
    expect(within(body).getByTestId('city-picker-city-query')).toBeTruthy();
    expect(within(body).getByTestId('city-picker-city-list')).toBeTruthy();
  });

  test('searching with the keyboard up on the smallest phone keeps Cancel and Save in the footer above it, then saves the pick', async () => {
    setWindow(PHONE_360X640);
    const onSubmit = jest.fn();
    await renderEditor(onSubmit);
    await showKeyboard();

    // The country filter is the last field of the first step...
    await fireEvent.changeText(screen.getByLabelText('Country'), 'ital');
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');

    // ...and the city search the last field of the second. Save waits for a city.
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    await fireEvent.changeText(screen.getByLabelText('City'), 'Ro');
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
    const footer = screen.getByTestId('stop-editor-footer');
    expect(within(footer).getByTestId('stop-editor-cancel')).toBeTruthy();
    expect(screen.getByTestId('stop-editor-save').props.accessibilityState).toMatchObject(
      {
        disabled: true,
      },
    );

    await fireEvent.press(screen.getByTestId('city-picker-city-100'));
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith({
      city_id: 100,
      arrive_date: '2026-05-12',
      depart_date: '2026-05-13',
    });
  });
});
