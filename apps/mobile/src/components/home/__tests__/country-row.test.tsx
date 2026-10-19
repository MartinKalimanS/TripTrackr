/**
 * T536 - one row of the Countries list (feature 005; FR-016, FR-017, FR-070, FR-074, FR-076;
 * contract C5-23): a flag chip, the name, "First visited 2021", a "Now" marker where the live
 * trip is, "3 trips" and a chevron. ONE control named "Portugal, 3 trips, first visited
 * 2021": the row is also the screen-reader's way into the globe (FR-017), and pressing it is
 * how the Home lowers the sheet and flies the globe to the country.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { CountrySummary } from '@/features/passport/country-summary';

import { appearance } from '../../../../test/helpers/appearance';
import { CountryRow } from '../country-row';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => useAppearance.mockReturnValue(appearance()));

const hidden = { includeHiddenElements: true };

const PORTUGAL: CountrySummary = {
  countryId: 351,
  iso2: 'PT',
  name: 'Portugal',
  continent: 'Europe',
  tripCount: 3,
  firstVisit: '2021-02-03',
  lastVisit: '2026-10-19',
  isNow: false,
  planned: false,
  focus: { center: [-9.1393, 38.7223], bounds: null },
};

describe('<CountryRow>', () => {
  test('is ONE button named with the trips and the year, with the id of its country', async () => {
    await render(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    const row = screen.getByTestId('country-row-PT');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Portugal, 3 trips, first visited 2021');
    expect(row.props.accessibilityHint).toBe('Shows it on the globe');
  });

  test('shows the name, the year first visited and the number of trips', async () => {
    await render(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    expect(screen.getByText('Portugal')).toBeOnTheScreen();
    expect(screen.getByText('First visited 2021')).toBeOnTheScreen();
    expect(screen.getByTestId('country-row-PT-trips')).toHaveTextContent('3 trips');
  });

  test('one trip is singular, in the name and on screen', async () => {
    await render(
      <CountryRow country={{ ...PORTUGAL, tripCount: 1 }} onSelect={jest.fn()} />,
    );
    expect(screen.getByTestId('country-row-PT-trips')).toHaveTextContent('1 trip');
    expect(screen.getByTestId('country-row-PT').props.accessibilityLabel).toBe(
      'Portugal, 1 trip, first visited 2021',
    );
  });

  test('says "Now" where the live trip is, in words and in the name', async () => {
    await render(
      <CountryRow country={{ ...PORTUGAL, isNow: true }} onSelect={jest.fn()} />,
    );
    expect(screen.getByTestId('country-row-PT-now')).toHaveTextContent('Now');
    expect(screen.getByTestId('country-row-PT').props.accessibilityLabel).toBe(
      'Portugal, 3 trips, first visited 2021, now',
    );
  });

  test('has no marker where the live trip is not', async () => {
    await render(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    expect(screen.queryByTestId('country-row-PT-now', hidden)).toBeNull();
  });

  test('a country only planned says so instead of claiming a visit', async () => {
    await render(
      <CountryRow
        country={{ ...PORTUGAL, tripCount: 1, firstVisit: '2027-03-01', planned: true }}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText('Planned 2027')).toBeOnTheScreen();
    expect(screen.queryByText(/First visited/)).toBeNull();
    expect(screen.getByTestId('country-row-PT').props.accessibilityLabel).toBe(
      'Portugal, 1 trip, planned 2027',
    );
  });

  test('draws the flag, which is decoration, and a chevron as the cue', async () => {
    await render(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    expect(screen.getByTestId('country-row-PT-flag', hidden)).toBeTruthy();
    expect(screen.getByTestId('country-row-PT-cue', hidden)).toBeTruthy();
  });

  test('calls onSelect with its country when pressed', async () => {
    const onSelect = jest.fn();
    await render(<CountryRow country={PORTUGAL} onSelect={onSelect} />);
    await fireEvent.press(screen.getByTestId('country-row-PT'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(PORTUGAL);
  });

  test('is at least 60 dp tall and grows with the text instead of clipping', async () => {
    await render(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    expect(
      StyleSheet.flatten(screen.getByTestId('country-row-PT').props.style).minHeight,
    ).toBeGreaterThanOrEqual(60);
    expect(screen.getByText('Portugal').props.numberOfLines).toBe(1);
    useAppearance.mockReturnValue(appearance({ fontScale: 2 }));
    await screen.rerender(<CountryRow country={PORTUGAL} onSelect={jest.fn()} />);
    expect(screen.getByText('Portugal').props.numberOfLines).toBeUndefined();
  });
});
