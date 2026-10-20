/**
 * T536 and F2 - the Countries list, the full detent of the Home sheet and the screen-reader
 * alternative to the globe (feature 005; FR-016, FR-017, FR-064, FR-081, FR-084; contract
 * C5-23; owner question Q-2; picture `home-full.png`): the heading "Countries" over "14 of 195
 * · 4 continents" with a round search button that reveals the existing filter field, an
 * invisible collapse control, then the countries under sticky continent labels ("EUROPE · 9")
 * in a FlashList with `getItemType`, and a message when the search finds nothing. It is built
 * from data already on the device and shows nobody else's.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

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
  country('FR', 'France', 'Europe', {
    tripCount: 2,
    firstVisit: '2021-06-01',
    lastVisit: '2022-06-09',
  }),
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

describe('<CountriesList> header', () => {
  test('is a list named Countries, under a heading', async () => {
    await show(list());
    expect(screen.getByTestId('countries-list')).toBeOnTheScreen();
    expect(screen.getByText('Countries').props.accessibilityRole).toBe('header');
  });

  test('says "14 of 195 · 4 continents" under the heading, with the fixed 195', async () => {
    await show(list());
    expect(screen.getByText('14 of 195 \u00b7 4 continents')).toBeOnTheScreen();
  });

  test('one continent is singular', async () => {
    const one = overview();
    await show(list({ overview: { ...one, totals: { ...one.totals, continents: 1 } } }));
    expect(screen.getByText('14 of 195 \u00b7 1 continent')).toBeOnTheScreen();
  });

  test('has no ring card or stamps: the picture shows none', async () => {
    await show(list());
    expect(screen.queryByTestId('countries-ring', hidden)).toBeNull();
    expect(screen.queryByTestId('countries-stamps', hidden)).toBeNull();
    expect(screen.queryByText(/of 7 continents/)).toBeNull();
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

  test('the collapse control is not drawn: it is one dp, with nothing in it', async () => {
    await show(list());
    const style = StyleSheet.flatten(
      screen.getByTestId('countries-collapse').props.style,
    );
    expect(style).toMatchObject({ position: 'absolute', width: 1, height: 1 });
  });

  test('has the round search button, named Search countries', async () => {
    await show(list());
    const button = screen.getByTestId('countries-search-toggle');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Search countries');
    expect(screen.getByTestId('countries-search-toggle-icon', hidden)).toBeTruthy();
  });

  test('is NOT a coming-soon control: the filter it opens is real', async () => {
    await show(list());
    expect(screen.queryByTestId('coming-soon-countries-search')).toBeNull();
    expect(screen.getByTestId('countries-search-toggle').props.accessibilityHint).toBe(
      undefined,
    );
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

  test('each sticky label reads "EUROPE · 3": the eyebrow role over the continent and count', async () => {
    await show(list());
    const europe = screen.getByTestId('countries-header-Europe');
    expect(screen.getByText('Europe \u00b7 3')).toBeOnTheScreen();
    expect(europe.props.accessibilityLabel).toBe('Europe, 3 countries');
    expect(screen.queryByText(/countries$/)).toBeNull();
  });

  test('a label has a hairline under it and the surface behind it', async () => {
    await show(list());
    const label = screen.getByTestId('countries-header-Asia');
    expect(label.props.className).toContain('bg-surface');
    const inner = label.children[0] as unknown as { props: { className: string } };
    expect(inner.props.className).toContain('border-b');
    expect(inner.props.className).toContain('border-separator');
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

  test('a row names its country, trips and last visit, and the live one says now', async () => {
    await show(list());
    expect(screen.getByTestId('country-row-FR').props.accessibilityLabel).toBe(
      'France, 2 trips, last visited Jun 2022',
    );
    expect(screen.getByTestId('country-row-FR-meta')).toHaveTextContent(
      '2 trips \u00b7 last Jun 2022',
    );
    expect(screen.getByTestId('country-row-PT').props.accessibilityLabel).toMatch(/now$/);
  });
});

describe('<CountriesList> search', () => {
  const open = () => fireEvent.press(screen.getByTestId('countries-search-toggle'));
  const search = (text: string) =>
    fireEvent.changeText(screen.getByTestId('countries-search'), text);

  test('the field is hidden until the round button reveals it, then focused', async () => {
    await show(list());
    expect(screen.queryByTestId('countries-search')).toBeNull();
    await open();
    expect(screen.getByTestId('countries-search').props.autoFocus).toBe(true);
    expect(screen.getByTestId('countries-search-toggle').props.accessibilityLabel).toBe(
      'Close search',
    );
  });

  test('is a field named Search countries', async () => {
    await show(list());
    await open();
    const field = screen.getByTestId('countries-search');
    expect(field.props.accessibilityLabel).toBe('Search countries');
    expect(field.props.autoCorrect).toBe(false);
    expect(field.props.returnKeyType).toBe('search');
  });

  test('keeps the countries whose name contains the text, ignoring case and accents', async () => {
    await show(list());
    await open();
    await search('FRAN');
    expect(screen.getByTestId('country-row-FR')).toBeOnTheScreen();
    expect(screen.queryByTestId('country-row-PT')).toBeNull();
    expect(screen.queryByTestId('country-row-JP')).toBeNull();
  });

  test('drops a continent label when none of its countries match, and counts the rest', async () => {
    await show(list());
    await open();
    await search('o');
    expect(screen.queryByTestId('countries-header-North America')).toBeNull();
    expect(screen.getByTestId('countries-header-Europe').props.accessibilityLabel).toBe(
      'Europe, 1 country',
    );
    expect(screen.getByText('Europe \u00b7 1')).toBeOnTheScreen();
  });

  test('says so in words when nothing matches, and Clear search brings everything back', async () => {
    await show(list());
    await open();
    await search('zzz');
    expect(screen.getByText(/No countries match/)).toBeOnTheScreen();
    expect(screen.queryByTestId('country-row-FR')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByTestId('country-row-FR')).toBeOnTheScreen();
    expect(screen.getByTestId('countries-search').props.value).toBe('');
  });

  test('closing the search clears the query and shows every country again', async () => {
    await show(list());
    await open();
    await search('fra');
    expect(screen.queryByTestId('country-row-PT')).toBeNull();
    await open();
    expect(screen.queryByTestId('countries-search')).toBeNull();
    expect(screen.getByTestId('country-row-PT')).toBeOnTheScreen();
    await open();
    expect(screen.getByTestId('countries-search').props.value).toBe('');
  });

  test('searching changes the list and not the figures above it', async () => {
    await show(list());
    await open();
    await search('fra');
    expect(screen.getByText('14 of 195 \u00b7 4 continents')).toBeOnTheScreen();
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
    expect(screen.queryByTestId('countries-search-toggle')).toBeNull();
    expect(screen.getByText('0 of 195 \u00b7 0 continents')).toBeOnTheScreen();
  });
});

describe('<CountriesList> in a sheet', () => {
  test('is a plain list outside one: it scrolls and bounces as any list does', async () => {
    await show(list());
    const props = flash.__seen.props as Record<string, unknown>;
    expect(props.scrollEnabled).toBeUndefined();
    expect(props.bounces).toBeUndefined();
  });

  test('ends contentInsetBottom above the bottom so the last row clears the tab pill', async () => {
    await show(list({ contentInsetBottom: 112 }));
    const props = flash.__seen.props as {
      contentContainerStyle: { paddingBottom: number };
    };
    expect(props.contentContainerStyle.paddingBottom).toBe(112);
  });

  test('the rows keep their flag size and wrap their second line at large text', async () => {
    useAppearance.mockReturnValue(appearance({ fontScale: 1.5 }));
    await show(list());
    expect(screen.getByTestId('country-row-FR-meta').props.numberOfLines).toBeUndefined();
    expect(
      StyleSheet.flatten(screen.getByTestId('country-row-FR-flag', hidden).props.style),
    ).toMatchObject({ width: 28, height: 20 });
  });
});
