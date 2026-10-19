/**
 * T536 with T534 - the Countries list as the body of the Home sheet (feature 005; FR-012,
 * FR-016; contract C5-22): the list takes the sheet's scroll wiring, so it scrolls only once
 * the sheet has SETTLED at full, does not bounce, and runs its scroll gesture with the sheet's
 * body pan. The gestures are the real ones (`react-native-gesture-handler/jestSetup`) and the
 * animations those of `test/mocks/reanimated-live.ts`; what the list does with a finger on a
 * device is the sheet's device check (T509).
 */
import 'react-native-gesture-handler/jestSetup';

import { act, render, screen } from '@testing-library/react-native';
import { getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { Sheet } from '@/components/ui/sheet';
import {
  groupByContinent,
  type CountrySummary,
} from '@/features/passport/country-summary';

import { appearance } from '../../../../test/helpers/appearance';
import { CountriesList } from '../countries-list';

jest.mock('react-native-worklets', () => require('../../../../test/mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../../../../test/mocks/reanimated-live'),
);
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    (require('react') as typeof import('react')).useEffect(effect, [effect]),
}));
jest.mock('@/hooks/use-appearance');
jest.mock('@/hooks/use-haptics');
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
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock;
};
const flash = jest.requireMock('@shopify/flash-list') as {
  __seen: { props: Record<string, unknown> | null };
};
const live = (
  jest.requireMock('react-native-reanimated') as { __live: { finish: () => void } }
).__live;

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  useHaptics.mockReturnValue({ sheetSnap: jest.fn() });
  flash.__seen.props = null;
});

const FRANCE: CountrySummary = {
  countryId: 33,
  iso2: 'FR',
  name: 'France',
  continent: 'Europe',
  tripCount: 2,
  firstVisit: '2022-06-01',
  lastVisit: '2024-06-01',
  isNow: false,
  planned: false,
  focus: { center: [2.35, 48.85], bounds: null },
};

const overview = {
  summaries: [FRANCE],
  groups: groupByContinent([FRANCE]),
  totals: {
    countries: 1,
    countriesOf: 195 as const,
    trips: 2,
    distanceKm: 0,
    continents: 1,
    continentsOf: 7 as const,
  },
};

const HEIGHTS = { peek: 212, half: 439, full: 780 } as const;

function sheet(detent: 'peek' | 'half' | 'full') {
  return (
    <Sheet
      detents={HEIGHTS}
      detent={detent}
      handleLabel="Countries and trips"
      renderBody={() => (
        <CountriesList
          overview={overview}
          onSelectCountry={jest.fn()}
          onCollapse={jest.fn()}
        />
      )}
    />
  );
}

async function settle() {
  await act(async () => {
    live.finish();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
  });
}

describe('<CountriesList> inside the Home sheet', () => {
  test('is a list with the sheet\u2019s wiring: no bounce, no overscroll, scrolling held until full', async () => {
    await render(sheet('half'));
    await settle();
    const props = flash.__seen.props as Record<string, unknown>;
    expect(props.scrollEnabled).toBe(false);
    expect(props.bounces).toBe(false);
    expect(props.overScrollMode).toBe('never');
    expect(typeof props.onScroll).toBe('function');
  });

  test('scrolls once the sheet has settled at full', async () => {
    await render(sheet('half'));
    await settle();
    await screen.rerender(sheet('full'));
    await settle();
    expect((flash.__seen.props as Record<string, unknown>).scrollEnabled).toBe(true);
  });

  test('its own scroll gesture is the one the sheet\u2019s body pan runs with', async () => {
    await render(sheet('full'));
    await settle();
    const scroll = getByGestureTestId('home-sheet-scroll') as unknown as {
      handlerTag: number;
    };
    const body = getByGestureTestId('home-sheet-body-pan') as unknown as {
      config: { simultaneousWith?: unknown[] };
    };
    // Gesture Handler holds a relation as the other gesture's handler tag once both are attached.
    expect(body.config.simultaneousWith).toContain(scroll.handlerTag);
  });

  test('draws its rows inside the sheet\u2019s body', async () => {
    await render(sheet('full'));
    await settle();
    expect(screen.getByTestId('country-row-FR')).toBeOnTheScreen();
    expect(screen.getByTestId('countries-list')).toBeOnTheScreen();
  });
});
