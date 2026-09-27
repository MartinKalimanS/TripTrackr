/**
 * T067 — the country-filtered searchable city picker (FR-014).
 *
 * The geography hooks are mocked (their own suite runs them against the API
 * client and a real cache). Pinned here: the two steps, the country filter,
 * the debounce before the search fires, the offline note, and that a pick
 * returns the wire `City` with its country.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CITY_QUERY_DEBOUNCE_MS, CityPicker } from '@/components/trip/city-picker';

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
