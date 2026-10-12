/**
 * T535 - the three figures of the half sheet (feature 005; FR-014, FR-060, FR-074, FR-076,
 * FR-077; contracts C5-18 and C5-23; research D5-11): countries "N /195", trips and
 * kilometres, each a `StatTile` with a figure that counts up once.
 *
 * What a flow reads stays what it was: `globe-stat-countries` is the PLAIN number ("5",
 * "/195" is a sibling), `globe-stat-distance` the plain distance, and `globe-stats` the
 * container. A screen reader hears the FINAL value in words ("14 of 195 countries") and the
 * countries and trips tiles are buttons; the kilometres are announced and are not a control.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { getLocales } from 'expo-localization';

import { appearance } from '../../../../test/helpers/appearance';
import { captureIntervals } from '../../../../test/helpers/captured-interval';
import { StatsRow } from '../stats-row';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const defaultLocales = (getLocales as jest.Mock).getMockImplementation();

/** Reduced motion draws the final figure at once, which is what a text assertion reads. */
let intervals: ReturnType<typeof captureIntervals>;

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  // A count-up runs its own interval; capturing it keeps a real timer from outliving the test.
  intervals = captureIntervals();
});
afterEach(() => {
  (getLocales as jest.Mock).mockImplementation(defaultLocales);
  jest.restoreAllMocks();
});

const hidden = { includeHiddenElements: true };
const FIGURES = { countries: 14, trips: 22, distanceKm: 61480.4 };

function row(props: Partial<React.ComponentProps<typeof StatsRow>> = {}) {
  return (
    <StatsRow
      {...FIGURES}
      onOpenCountries={jest.fn()}
      onOpenTrips={jest.fn()}
      {...props}
    />
  );
}

describe('<StatsRow> figures', () => {
  test('keeps the ids a flow reads, each figure the plain number', async () => {
    await render(row());
    expect(screen.getByTestId('globe-stats')).toBeOnTheScreen();
    expect(screen.getByTestId('globe-stat-countries')).toHaveTextContent(/^14$/);
    expect(screen.getByTestId('globe-stat-trips')).toHaveTextContent(/^22$/);
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent(/^61,480$/);
  });

  test('the denominator is a sibling, so the countries figure is still the plain number', async () => {
    await render(row());
    expect(screen.getByText('/195')).toBeOnTheScreen();
    expect(screen.getByTestId('globe-stat-countries')).not.toHaveTextContent('195');
  });

  test('the labels say what they are, and the word countries stays', async () => {
    await render(row());
    expect(screen.getByText('Countries')).toBeOnTheScreen();
    expect(screen.getByText('Trips')).toBeOnTheScreen();
    expect(screen.getByText('Kilometres')).toBeOnTheScreen();
  });

  test('one country and one trip are singular', async () => {
    await render(row({ countries: 1, trips: 1 }));
    expect(screen.getByText('Trip')).toBeOnTheScreen();
    expect(screen.getByTestId('globe-stat-countries')).toHaveTextContent(/^1$/);
  });

  test('the unit is the label, so the distance is only the number', async () => {
    await render(row());
    expect(screen.getByTestId('globe-stat-distance')).not.toHaveTextContent('km');
    expect(screen.queryByText('km')).toBeNull();
  });

  test('a numeral that does not fit shrinks instead of clipping', async () => {
    await render(row());
    const figure = screen.getByTestId('globe-stat-distance');
    expect(figure.props.numberOfLines).toBe(1);
    expect(figure.props.adjustsFontSizeToFit).toBe(true);
  });

  test('big figures go compact from seven digits so they never overflow', async () => {
    await render(row({ distanceKm: 1_260_000 }));
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent(/^1\.26[Mm]$/);
    expect(screen.getByLabelText(/1,260,000 kilometres/)).toBeOnTheScreen();
  });

  test('a traveller with nothing yet sees zeros, not blanks', async () => {
    await render(row({ countries: 0, trips: 0, distanceKm: 0 }));
    expect(screen.getByTestId('globe-stat-countries')).toHaveTextContent(/^0$/);
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent(/^0$/);
  });

  test('follows the measurement system: miles for a device that measures in them', async () => {
    (getLocales as jest.Mock).mockReturnValue([
      {
        languageTag: 'en-US',
        decimalSeparator: '.',
        currencyCode: 'USD',
        measurementSystem: 'us',
      },
    ]);
    await render(row());
    expect(screen.queryByText('mi')).toBeNull();
    expect(screen.getByText('Miles')).toBeOnTheScreen();
    const miles = new Intl.NumberFormat('en-US').format(Math.round(61480.4 / 1.609344));
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent(miles);
  });

  test('follows the language for the grouping of digits', async () => {
    (getLocales as jest.Mock).mockReturnValue([
      {
        languageTag: 'de-DE',
        decimalSeparator: ',',
        currencyCode: 'EUR',
        measurementSystem: 'metric',
      },
    ]);
    await render(row());
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent(/^61\.480$/);
  });
});

describe('<StatsRow> what a screen reader hears', () => {
  test('each tile is one element named in words, with the final value', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
    await render(row());
    expect(screen.getByLabelText('14 of 195 countries')).toBeOnTheScreen();
    expect(screen.getByLabelText('22 trips')).toBeOnTheScreen();
    expect(screen.getByLabelText('61,480 kilometres travelled')).toBeOnTheScreen();
  });

  test('while a figure counts up its label is already the final value', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
    await render(row());
    expect(screen.getByTestId('globe-stat-countries').props.accessibilityLabel).toBe(
      '14',
    );
    expect(screen.getByTestId('globe-stat-distance').props.accessibilityLabel).toBe(
      '61,480',
    );
  });

  test('countries and trips are buttons; the kilometres are announced and are not', async () => {
    await render(row());
    expect(screen.getByLabelText('14 of 195 countries').props.accessibilityRole).toBe(
      'button',
    );
    expect(screen.getByLabelText('22 trips').props.accessibilityRole).toBe('button');
    expect(
      screen.getByLabelText('61,480 kilometres travelled').props.accessibilityRole,
    ).not.toBe('button');
  });

  test('countries opens the list and trips opens the trips; the kilometres open nothing', async () => {
    const onOpenCountries = jest.fn();
    const onOpenTrips = jest.fn();
    await render(row({ onOpenCountries, onOpenTrips }));
    await fireEvent.press(screen.getByLabelText('14 of 195 countries'));
    expect(onOpenCountries).toHaveBeenCalledTimes(1);
    expect(onOpenTrips).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('22 trips'));
    expect(onOpenTrips).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('61,480 kilometres travelled'));
    expect(onOpenCountries).toHaveBeenCalledTimes(1);
    expect(onOpenTrips).toHaveBeenCalledTimes(1);
  });
});

describe('<StatsRow> counting up', () => {
  test('counts up once per appearance, the three figures one after the other', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
    await render(row());
    // Each figure lies over an invisible copy of its final text, which sizes the box.
    expect(screen.getByTestId('globe-stat-countries-width', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('globe-stat-trips-width', hidden)).toBeOnTheScreen();
    expect(screen.getByTestId('globe-stat-distance-width', hidden)).toBeOnTheScreen();
    expect(intervals.all).toHaveLength(3);
  });

  test('draws the final figures at once under reduced motion, with no timer at all', async () => {
    await render(row());
    expect(screen.queryByTestId('globe-stat-countries-width', hidden)).toBeNull();
    expect(intervals.all).toHaveLength(0);
  });
});

describe('<StatsRow> layout', () => {
  const direction = () =>
    StyleSheet.flatten(screen.getByTestId('globe-stats').props.style).flexDirection;

  test('is three tiles in a row at the default size, with a hairline between them', async () => {
    await render(row());
    expect(direction()).toBe('row');
    expect(screen.getAllByTestId('globe-stats-divider')).toHaveLength(2);
  });

  test('stacks at a font scale of 1.15 and above, with the dividers across', async () => {
    useAppearance.mockReturnValue(
      appearance({ prefersLessMotion: true, fontScale: 1.15 }),
    );
    await render(row());
    expect(direction()).toBe('column');
    expect(screen.getAllByTestId('globe-stats-divider')).toHaveLength(2);
  });

  test('is still a row just below the threshold', async () => {
    useAppearance.mockReturnValue(
      appearance({ prefersLessMotion: true, fontScale: 1.1 }),
    );
    await render(row());
    expect(direction()).toBe('row');
  });
});
