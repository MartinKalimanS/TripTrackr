/**
 * F13 (T557) - the passport card of the You screen (feature 005; FR-058, FR-060, FR-074,
 * FR-076; UI-SPEC section 8; the pictures `profile.png` and `profile-dark.png`): the navy
 * cover with its heading, four figures (countries "/195", trips, distance, continents "/7"),
 * the lap line and the machine-readable strip. Every figure is the one it is given.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { appearance } from '../../../../test/helpers/appearance';
import { captureIntervals } from '../../../../test/helpers/captured-interval';
import type { PassportTotals } from '@/features/passport/passport-totals';

import { PassportCard } from '../passport-card';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  captureIntervals();
});
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };

const TOTALS: PassportTotals = {
  period: 'all',
  countries: 14,
  countriesOf: 195,
  trips: 22,
  distanceKm: 61480.4,
  continents: 4,
  continentsOf: 7,
  laps: 1.5358,
};

const card = (totals: Partial<PassportTotals> = {}, holder = 'Marta') => (
  <PassportCard totals={{ ...TOTALS, ...totals }} holder={holder} />
);

describe('<PassportCard> - what it says', () => {
  test('is the card `passport-card`, named for its period, with the eyebrow heading', async () => {
    await render(card());
    expect(screen.getByTestId('passport-card')).toBeOnTheScreen();
    expect(screen.getByLabelText('Passport, all time')).toBe(
      screen.getByTestId('passport-card'),
    );
    expect(screen.getByText('Passport \u00b7 all time')).toBeOnTheScreen();
  });

  test('a year says the year', async () => {
    await render(card({ period: '2026' }));
    expect(screen.getByText('Passport \u00b7 2026')).toBeOnTheScreen();
    expect(screen.getByLabelText('Passport, 2026')).toBeOnTheScreen();
  });

  test('draws the four figures as plain numbers with the fixed /195 and /7 beside them', async () => {
    await render(card());
    expect(screen.getByTestId('passport-countries')).toHaveTextContent(/^14$/);
    expect(screen.getByTestId('passport-trips')).toHaveTextContent(/^22$/);
    expect(screen.getByTestId('passport-distance')).toHaveTextContent(/^61,480$/);
    expect(screen.getByTestId('passport-continents')).toHaveTextContent(/^4$/);
    expect(screen.getByText('/195')).toBeOnTheScreen();
    expect(screen.getByText('/7')).toBeOnTheScreen();
    expect(screen.getByText('km')).toBeOnTheScreen();
    for (const label of ['Countries', 'Trips', 'Distance', 'Continents']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
  });

  test('a screen reader hears each figure once, in words', async () => {
    await render(card());
    expect(screen.getByLabelText('14 of 195 countries')).toBeOnTheScreen();
    expect(screen.getByLabelText('22 trips')).toBeOnTheScreen();
    expect(screen.getByLabelText('61,480 kilometres travelled')).toBeOnTheScreen();
    expect(screen.getByLabelText('4 of 7 continents')).toBeOnTheScreen();
  });

  test('one trip and one continent are singular', async () => {
    await render(card({ trips: 1, continents: 1, countries: 1 }));
    expect(screen.getByLabelText('1 trip')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 of 7 continents')).toBeOnTheScreen();
    expect(screen.getByText('Trip')).toBeOnTheScreen();
    expect(screen.getByText('Country')).toBeOnTheScreen();
  });

  test('the lap line is the real distance over the Earth, to one decimal', async () => {
    await render(card());
    expect(screen.getByText('1.5\u00d7 around the Earth')).toBeOnTheScreen();
  });

  test('with no distance there is no lap line to claim', async () => {
    await render(card({ distanceKm: 0, laps: 0, trips: 0, countries: 0, continents: 0 }));
    expect(screen.queryByText(/around the Earth/)).toBeNull();
    expect(screen.getByTestId('passport-distance')).toHaveTextContent(/^0$/);
  });

  test('a huge distance goes compact so the figure never overflows', async () => {
    await render(card({ distanceKm: 1_260_000 }));
    expect(screen.getByTestId('passport-distance')).toHaveTextContent(/^1\.26[Mm]$/);
  });

  test('a numeral that does not fit shrinks instead of clipping', async () => {
    await render(card());
    const figure = screen.getByTestId('passport-distance');
    expect(figure.props.numberOfLines).toBe(1);
    expect(figure.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe('<PassportCard> - the machine-readable strip', () => {
  test('is the holder in passport letters, one line, hidden from assistive technology', async () => {
    await render(card({}, 'Marta'));
    const strip = screen.getByTestId('passport-mrz', hidden);
    expect(strip).toHaveTextContent(/^P<TRIPTRACKR<<MARTA<+$/);
    expect(strip.props.numberOfLines).toBe(1);
    expect(strip.props.accessibilityElementsHidden).toBe(true);
    expect(strip.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByText(/TRIPTRACKR/)).toBeNull();
  });
});

describe('<PassportCard> - the cover', () => {
  test('is the navy passport gradient, decorative, behind the content', async () => {
    await render(card());
    const cover = screen.getByTestId('passport-card-cover', hidden);
    expect(cover.props.pointerEvents).toBe('none');
    expect(cover.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('padding 20, gap 16, radius 24, clipped to its corners', async () => {
    await render(card());
    const style = StyleSheet.flatten(screen.getByTestId('passport-card').props.style);
    expect(style).toMatchObject({
      padding: 20,
      gap: 16,
      borderRadius: 24,
      overflow: 'hidden',
    });
  });

  test('the concentric watermark is decorative and hidden', async () => {
    await render(card());
    const mark = screen.getByTestId('passport-watermark', hidden);
    expect(mark.props.accessibilityElementsHidden).toBe(true);
  });
});

describe('<PassportCard> - reflow at large text (FR-074, SC-007)', () => {
  const directionOf = (testID: string) =>
    StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style).flexDirection;

  test('two columns of figures at the default size, the prototype gaps 16 and 20', async () => {
    await render(card());
    expect(directionOf('passport-grid-row-0')).toBe('row');
    expect(directionOf('passport-grid-row-1')).toBe('row');
    const style = StyleSheet.flatten(
      screen.getByTestId('passport-grid-row-0', hidden).props.style,
    );
    expect(style).toMatchObject({ columnGap: 20 });
    expect(
      StyleSheet.flatten(screen.getByTestId('passport-grid', hidden).props.style),
    ).toMatchObject({ gap: 16 });
  });

  test.each([1.15, 1.5, 2])(
    'one column from a font scale of 1.15 (%s)',
    async (scale) => {
      useAppearance.mockReturnValue(
        appearance({ prefersLessMotion: true, fontScale: scale }),
      );
      await render(card());
      expect(directionOf('passport-grid-row-0')).toBe('column');
      expect(directionOf('passport-grid-row-1')).toBe('column');
    },
  );
});
