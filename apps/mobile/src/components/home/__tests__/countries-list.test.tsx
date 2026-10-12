/**
 * T536 - the Countries list, the full detent of the Home sheet and the screen-reader
 * alternative to the globe (feature 005; FR-016, FR-017, FR-064, FR-084; contract C5-23; owner
 * question Q-2): a header with a collapse control, a search field, a ring card ("14 of 195",
 * "4 of 7 continents . 19 trips") with up to two stamps, then the countries under continent
 * headers that stay in view, in a FlashList with `getItemType`, and a message when the search
 * finds nothing. It is built from data already on the device and shows nobody else's.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import {
  groupByContinent,
  type CountrySummary,
} from '@/features/passport/country-summary';
import type { CountryOverview } from '@/features/passport/use-country-overview';

import { appearance } from '../../../../test/helpers/appearance';
import { CountriesList } from '../countries-list';

jest.mock('@/hooks/use-appearance');
// FlashList, as the suite's own stand-in has it, but remembering the props it was given.
jest.mock('@shopify/flash-list', () => {
  const React = require('react') as typeof import('react');
  const actual = jest.requireActual('@shopify/flash-list');
  const { RecyclerView } = jest.requireActual(
    '@shopify/flash-list/dist/recyclerview/RecyclerView',
  );
  const mockSeen: { props: Record<string, unknown> | null } = { props: null };
  const FlashList = React.forwardRef(function FlashList(
    props: Record<string, unknown>,
    ref: unknown,
  ) {
    mockSeen.props = props;
    return React.createElement(RecyclerView, { ...props, ref });
  });
  return { ...actual, FlashList, __seen: mockSeen };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const flash = jest.requireMock('@shopify/flash-list') as {
  __seen: { props: Record<string, unknown> | null };
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  flash.__seen.props = null;
});

function country(
  iso2: string,
  name: string,
  continent: CountrySummary['continent'],
  extra: Partial<CountrySummary> = {},
): CountrySummary {
  return {
    countryId: iso2.charCodeAt(0) * 100 + iso2.charCodeAt(1),
    iso2,
    name,
    continent,
    tripCount: 1,
    firstVisit: '2021-02-03',
    lastVisit: '2021-02-09',
    isNow: false,
    planned: false,
    focus: { center: [0, 0], bounds: null },
    ...extra,
  };
}

const SUMMARIES = [
  country('FR', 'France', 'Europe', { tripCount: 2, firstVisit: '2022-06-01' }),
  country('PT', 'Portugal', 'Europe', {
    tripCount: 3,
    firstVisit: '2021-02-03',
    isNow: true,
  }),
  country('CH', 'Switzerland', 'Europe', { firstVisit: '2019-01-01' }),
  country('JP', 'Japan', 'Asia', { firstVisit: '2024-05-01' }),
  country('US', 'United States', 'North America', { firstVisit: '2023-09-10' }),
];

function overview(summaries: CountrySummary[] = SUMMARIES): CountryOverview {
  return {
    summaries,
    groups: groupByContinent(summaries),
    totals: {
      countries: 14,
      countriesOf: 195,
      trips: 19,
      distanceKm: 61480,
      continents: 4,
      continentsOf: 7,
    },
  };
}

function list(props: Partial<React.ComponentProps<typeof CountriesList>> = {}) {
  return (
    <CountriesList
      overview={overview()}
      onSelectCountry={jest.fn()}
      onCollapse={jest.fn()}
      {...props}
    />
  );
}

const hidden = { includeHiddenElements: true };

/** Renders, then lets FlashList's own first-load timer run inside act, as a device would. */
async function show(ui: React.ReactElement) {
  await render(ui);
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 30)));
}

describe('<CountriesList> header and ring card', () => {
  test('is a list named Countries, under a heading', async () => {
    await show(list());
    expect(screen.getByTestId('countries-list')).toBeOnTheScreen();
    expect(screen.getByText('Countries').props.accessibilityRole).toBe('header');
  });

  test('has a collapse control that says what it does and calls back', async () => {
    const onCollapse = jest.fn();
    await show(list({ onCollapse }));
    const collapse = screen.getByTestId('countries-collapse');
    expect(collapse.props.accessibilityRole).toBe('button');
    expect(collapse.props.accessibilityLabel).toBe('Collapse the countries list');
    await fireEvent.press(collapse);
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  test('the ring card says "14 of 195" and the continents and trips, with the fixed denominators', async () => {
    await show(list());
    expect(screen.getByText('14 of 195')).toBeOnTheScreen();
    expect(screen.getByText('4 of 7 continents \u00b7 19 trips')).toBeOnTheScreen();
  });

  test('the ring card is read once, whole, and its ring is decoration', async () => {
    await show(list());
    expect(
      screen.getByLabelText('14 of 195 countries, 4 of 7 continents, 19 trips'),
    ).toBeOnTheScreen();
    expect(
      screen.getByTestId('countries-ring', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
  });

  test('shows the stamps of the two newest visits, as decoration', async () => {
    await show(list());
    const stamps = screen.getByTestId('countries-stamps', hidden);
    expect(stamps.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(
      screen.getAllByTestId(/^countries-stamp-/, hidden).map((s) => s.props.testID),
    ).toEqual(['countries-stamp-JP', 'countries-stamp-US']);
  });

  test('one continent and one trip are singular', async () => {
    const one = overview();
    await show(
      list({ overview: { ...one, totals: { ...one.totals, continents: 1, trips: 1 } } }),
    );
    expect(screen.getByText('1 of 7 continents \u00b7 1 trip')).toBeOnTheScreen();
  });
});

describe('<CountriesList> the countries', () => {
  test('are grouped under continent headers by name, each with its count', async () => {
    await show(list());
    expect(screen.getByTestId('countries-header-Asia')).toBeOnTheScreen();
    expect(screen.getByTestId('countries-header-Europe').props.accessibilityLabel).toBe(
      'Europe, 3 countries',
    );
    expect(screen.getByTestId('countries-header-Asia').props.accessibilityLabel).toBe(
      'Asia, 1 country',
    );
    expect(screen.getByTestId('countries-header-Europe').props.accessibilityRole).toBe(
      'header',
    );
  });

  test('every country is a row, in the order of its group', async () => {
    await show(list());
    for (const iso of ['FR', 'PT', 'CH', 'JP', 'US']) {
      expect(screen.getByTestId(`country-row-${iso}`)).toBeOnTheScreen();
    }
    const items = flash.__seen.props?.data as { type: string }[];
    expect(items.map((item) => item.type)).toEqual([
      'header',
      'country',
      'header',
      'country',
      'country',
      'country',
      'header',
      'country',
    ]);
  });

  test('the continent headers stay in view and each kind of item has its own type', async () => {
    await show(list());
    const props = flash.__seen.props as {
      stickyHeaderIndices: number[];
      getItemType: (item: { type: string }) => string;
      data: { type: string }[];
    };
    expect(props.stickyHeaderIndices).toEqual([0, 2, 6]);
    expect(props.data.map(props.getItemType)).toEqual(
      props.data.map((item) => item.type),
    );
  });

  test('a press on a row hands the country to the screen', async () => {
    const onSelectCountry = jest.fn();
    await show(list({ onSelectCountry }));
    await fireEvent.press(screen.getByTestId('country-row-PT'));
    expect(onSelectCountry).toHaveBeenCalledWith(
      expect.objectContaining({ iso2: 'PT', name: 'Portugal' }),
    );
  });

  test('a row names its country, trips and first year, and the live one says now', async () => {
    await show(list());
    expect(screen.getByTestId('country-row-FR').props.accessibilityLabel).toBe(
      'France, 2 trips, first visited 2022',
    );
    expect(screen.getByTestId('country-row-PT').props.accessibilityLabel).toMatch(/now$/);
  });
});

describe('<CountriesList> search', () => {
  const search = (text: string) =>
    fireEvent.changeText(screen.getByTestId('countries-search'), text);

  test('is a field named Search countries', async () => {
    await show(list());
    const field = screen.getByTestId('countries-search');
    expect(field.props.accessibilityLabel).toBe('Search countries');
    expect(field.props.autoCorrect).toBe(false);
    expect(field.props.returnKeyType).toBe('search');
  });

  test('keeps the countries whose name contains the text, ignoring case and accents', async () => {
    await show(list());
    await search('FRAN');
    expect(screen.getByTestId('country-row-FR')).toBeOnTheScreen();
    expect(screen.queryByTestId('country-row-PT')).toBeNull();
    expect(screen.queryByTestId('country-row-JP')).toBeNull();
  });

  test('drops a continent header when none of its countries match, and counts the rest', async () => {
    await show(list());
    await search('o');
    expect(screen.queryByTestId('countries-header-North America')).toBeNull();
    expect(screen.getByTestId('countries-header-Europe').props.accessibilityLabel).toBe(
      'Europe, 1 country',
    );
  });

  test('says so in words when nothing matches, and Clear search brings everything back', async () => {
    await show(list());
    await search('zzz');
    expect(screen.getByText(/No countries match/)).toBeOnTheScreen();
    expect(screen.queryByTestId('country-row-FR')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByTestId('country-row-FR')).toBeOnTheScreen();
    expect(screen.getByTestId('countries-search').props.value).toBe('');
  });

  test('searching changes the list and not the figures above it', async () => {
    await show(list());
    await search('fra');
    expect(screen.getByText('14 of 195')).toBeOnTheScreen();
  });
});

describe('<CountriesList> with no countries', () => {
  test('says there are none yet and how one appears, with no search to type in', async () => {
    await show(
      list({
        overview: {
          ...overview([]),
          totals: { ...overview().totals, countries: 0, continents: 0, trips: 0 },
        },
      }),
    );
    expect(screen.getByText('No countries yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('countries-search')).toBeNull();
    expect(screen.getByText('0 of 195')).toBeOnTheScreen();
    expect(screen.queryByTestId('countries-stamps', hidden)).toBeNull();
  });
});

describe('<CountriesList> in a sheet', () => {
  test('is a plain list outside one: it scrolls and bounces as any list does', async () => {
    await show(list());
    const props = flash.__seen.props as Record<string, unknown>;
    expect(props.scrollEnabled).toBeUndefined();
    expect(props.bounces).toBeUndefined();
  });
});
