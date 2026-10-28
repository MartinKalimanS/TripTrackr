/**
 * T560 - animated figures announce their FINAL value, from the first render (feature 005; FR-060,
 * FR-076, FR-077; research D5-11): while a number counts up, the one stop a screen reader finds is
 * named with the value it is counting to, not the frame on screen; the invisible copy that holds
 * its width is hidden; the figure is not a live region, so nothing says "3, 17, 42"; a new value
 * is the new name at once; and the name follows the device's language ("12.346").
 *
 * This asserts only the accessible name and the tree. When the count-up starts and how often is
 * the trigger policy of T558 and is not pinned here, so these tests read the first render and do
 * not tick the clock.
 */
import { render } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';

import { StatsRow } from '@/components/home/stats-row';
import { PassportCard } from '@/components/profile/passport-card';
import { AnimatedNumber } from '@/components/ui/animated-number';
import type { PassportTotals } from '@/features/passport/passport-totals';

import { accessibleNodes } from '../helpers/a11y-nodes';
import { appearance } from '../helpers/appearance';
import { captureIntervals } from '../helpers/captured-interval';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const defaultLocales = (getLocales as jest.Mock).getMockImplementation();

beforeEach(() => {
  // Motion ON: the figures count. The interval is held so no real timer outlives a test.
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: false }));
  captureIntervals();
});
afterEach(() => {
  (getLocales as jest.Mock).mockImplementation(defaultLocales);
  jest.restoreAllMocks();
});

const german = () =>
  (getLocales as jest.Mock).mockReturnValue([
    {
      languageTag: 'de-DE',
      decimalSeparator: ',',
      currencyCode: 'EUR',
      measurementSystem: 'metric',
    },
  ]);

describe('<AnimatedNumber> while it counts', () => {
  test('is ONE stop named with the final value; the width keeper is not a second one', async () => {
    await render(<AnimatedNumber value={12346} testID="figure" />);
    expect(accessibleNodes()).toEqual([
      expect.objectContaining({ id: 'figure', name: '12,346' }),
    ]);
  });

  test('the frame on screen is not what is announced', async () => {
    await render(<AnimatedNumber value={12346} testID="figure" />);
    const stop = accessibleNodes()[0]!;
    expect(stop.name).toBe('12,346');
    expect(stop.name).not.toBe('0');
  });

  test('is not a live region: a reader never says the numbers on the way', async () => {
    const view = await render(<AnimatedNumber value={12346} testID="figure" />);
    const json = JSON.stringify(view.toJSON());
    expect(json).not.toMatch(/accessibilityLiveRegion|aria-live/);
  });

  test('a new value is the new name at once', async () => {
    const view = await render(<AnimatedNumber value={14} testID="figure" />);
    expect(accessibleNodes()[0]!.name).toBe('14');
    await view.rerender(<AnimatedNumber value={15} testID="figure" />);
    expect(accessibleNodes()[0]!.name).toBe('15');
  });

  test('a label of the caller replaces it, still whole and final', async () => {
    await render(
      <AnimatedNumber
        value={14}
        accessibilityLabel="14 of 195 countries"
        testID="figure"
      />,
    );
    expect(accessibleNodes()[0]!.name).toBe('14 of 195 countries');
  });

  test('follows the device language: 12.346 in German, 12,346 in English', async () => {
    german();
    const view = await render(<AnimatedNumber value={12346} testID="figure" />);
    expect(accessibleNodes()[0]!.name).toBe('12.346');
    (getLocales as jest.Mock).mockImplementation(defaultLocales);
    await view.rerender(<AnimatedNumber value={12346} testID="other" />);
    expect(accessibleNodes()[0]!.name).toBe('12,346');
  });
});

describe('the screens that count', () => {
  test('Home: each of the three figures is one stop whose name is the final words', async () => {
    await render(
      <StatsRow
        countries={14}
        trips={22}
        distanceKm={61480.4}
        onOpenCountries={jest.fn()}
        onOpenTrips={jest.fn()}
      />,
    );
    expect(accessibleNodes().map((node) => node.name)).toEqual([
      '14 of 195 countries',
      '22 trips',
      '61,480 kilometres travelled',
    ]);
  });

  test('You: the passport figures are one stop each, named in words, final from the first render', async () => {
    const totals: PassportTotals = {
      period: 'all',
      countries: 14,
      countriesOf: 195,
      trips: 22,
      distanceKm: 61480.4,
      continents: 4,
      continentsOf: 7,
      laps: 1.5358,
    };
    await render(<PassportCard totals={totals} holder="Marta" />);
    const figures = accessibleNodes().filter((node) =>
      node.id?.startsWith('passport-figure-'),
    );
    expect(figures.map((node) => node.name)).toEqual([
      '14 of 195 countries',
      '22 trips',
      '61,480 kilometres travelled',
      '4 of 7 continents',
    ]);
  });
});
