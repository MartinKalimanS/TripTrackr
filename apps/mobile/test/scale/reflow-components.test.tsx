/**
 * T561 - the text-scale sweep, part one: the components (feature 005; FR-074, SC-007;
 * `reference/UI-SPEC.md` "Text scale >= 1.15"). Each one is rendered at a font scale of 1,
 * 1.15, 1.5 and 2 and asserted in the layout mode the spec gives it: Home figures columns
 * then rows, trip areas four columns then two, the ticket card and the documents ticket a
 * row then stacked, the passport grid two columns then one, the stop dates side by side then
 * stacked, the hero title growing upward, the tab pill growing with its labels, the spending
 * hero and the notes cards wrapping. For every one, no rendered node that holds text pins a
 * `height` (a fixed height is a minimum: `minHeight`).
 *
 * What Jest cannot say (it has no layout engine) is whether the result looks right: that is
 * the device check listed in `reference/as-built/f14-scale.md`.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { render, screen } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { TabBar } from '@/components/navigation/tab-bar';
import { PillMetrics } from '@/components/navigation/tab-metrics';
import { GreetingHeader } from '@/components/home/greeting-header';
import { HomeTools } from '@/components/home/home-tools';
import { NextRow } from '@/components/home/next-row';
import { NowCard } from '@/components/home/now-card';
import { StatsRow } from '@/components/home/stats-row';
import { PassportCard } from '@/components/profile/passport-card';
import { PhotoTile } from '@/components/trip/photo-tile';
import { AreasStrip } from '@/components/trip/areas-strip';
import { DayBars } from '@/components/trip/day-bars';
import { DocumentTicket } from '@/components/trip/document-ticket';
import { NightsStepper } from '@/components/trip/nights-stepper';
import { NoteCard } from '@/components/trip/note-card';
import { SpendingHero } from '@/components/trip/spending-hero';
import { StopDatesBlock } from '@/components/trip/stop-dates-block';
import { TicketCard } from '@/components/trip/ticket-card';
import { TripHero } from '@/components/trip/trip-hero';
import { TripRow } from '@/components/trip/trip-row';
import { buttonFrame } from '@/components/ui/button';
import { FormActions } from '@/components/ui/form-actions';
import { areaColumns } from '@/components/ui/reflow';
import { categoryOptions, summariseExpenses } from '@/db/repositories/expenses';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { ExpenseRow } from '@/db/schema';
import type { HomeTrip } from '@/features/home/home-trips';
import { deriveSpendingView } from '@/features/expenses/spending-summary';
import type { PassportTotals } from '@/features/passport/passport-totals';

import { appearance, appearanceOf } from '../helpers/appearance';
import { captureIntervals } from '../helpers/captured-interval';
import { classesOf, hostsWhere } from '../helpers/host-nodes';
import {
  TEXT_SCALES,
  fixedHeightTextContainers,
  phoneAtFontScale,
  reflows,
  styleOf,
} from '../helpers/text-scale';
import { cardModel } from '../helpers/trip-card-fixture';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});
jest.mock('@/hooks/use-appearance');
jest.mock('@/features/sync/use-sync-chip-state', () => ({
  useSyncChipState: () => ({ kind: 'synced' }),
}));
jest.mock('@/sync/engine', () => ({ syncNow: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() },
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const hidden = { includeHiddenElements: true };

/** Both hooks that report the text size, set to the same scale. */
function atScale(fontScale: number) {
  phoneAtFontScale(fontScale);
  useAppearance.mockReturnValue(appearance({ fontScale, prefersLessMotion: true }));
}

beforeEach(() => captureIntervals());
afterEach(() => jest.restoreAllMocks());

/** The sweep's one cross-cutting rule: nothing that holds text has a fixed height. */
function expectNoFixedTextHeight() {
  expect(fixedHeightTextContainers()).toEqual([]);
}

describe.each(TEXT_SCALES)('at a font scale of %s', (scale) => {
  beforeEach(() => atScale(scale));

  test('Home figures: three columns, then three rows with the hairlines across', async () => {
    await render(
      <StatsRow
        countries={14}
        trips={22}
        distanceKm={61480.4}
        onOpenCountries={jest.fn()}
        onOpenTrips={jest.fn()}
      />,
    );
    expect(styleOf(screen.getByTestId('globe-stats')).flexDirection).toBe(
      reflows(scale) ? 'column' : 'row',
    );
    const dividers = screen.getAllByTestId('globe-stats-divider');
    expect(dividers).toHaveLength(2);
    for (const divider of dividers) {
      expect(classesOf(divider)).toContain(reflows(scale) ? 'h-px' : 'w-px');
    }
    expectNoFixedTextHeight();
  });

  test('trip areas: four columns, then two', async () => {
    await render(
      <AreasStrip
        counts={{ photos: 12, notes: 3, documents: 2 }}
        spending={{ total: '1234.50', currency: 'EUR' }}
        onOpen={jest.fn()}
      />,
    );
    expect(areaColumns(scale)).toBe(reflows(scale) ? 2 : 4);
    for (const segment of ['photos', 'notes', 'expenses', 'documents']) {
      expect(styleOf(screen.getByTestId(`trip-tile-${segment}`)).width).toBe(
        reflows(scale) ? '50%' : '25%',
      );
    }
    expectNoFixedTextHeight();
  });

  test('the ticket card: a row, then stacked with the notches gone', async () => {
    await render(
      <TicketCard
        trip={cardModel({
          id: 't1',
          title: 'Iceland Ring Road and the Westfjords',
          status: 'planning',
          country: { iso2: 'IS', name: 'Iceland' },
          dayOf: null,
          daysToGo: 94,
        })}
        onPress={jest.fn()}
      />,
    );
    expect(styleOf(screen.getByTestId('trip-card-t1-surface')).flexDirection).toBe(
      reflows(scale) ? 'column' : 'row',
    );
    expect(styleOf(screen.getByTestId('trip-card-t1-surface')).minHeight).toBeDefined();
    expect(styleOf(screen.getByTestId('trip-card-t1-surface')).height).toBeUndefined();
    expect(styleOf(screen.getByTestId('trip-card-t1-stub', hidden)).flexDirection).toBe(
      reflows(scale) ? 'row' : undefined,
    );
    expect(screen.queryByTestId('trip-card-t1-notch-top', hidden) === null).toBe(
      reflows(scale),
    );
    expectNoFixedTextHeight();
  });

  test('a trip row: thumbnail 64, then 56, and the lines wrap to two', async () => {
    await render(
      <TripRow trip={cardModel({ id: 'r1', status: 'past' })} onPress={jest.fn()} />,
    );
    const thumb = styleOf(screen.getByTestId('trip-card-r1-thumb'));
    expect(thumb.width).toBe(reflows(scale) ? 56 : 64);
    expect(styleOf(screen.getByTestId('trip-card-r1')).minHeight).toBe(72);
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(
      reflows(scale) ? 2 : 1,
    );
    expectNoFixedTextHeight();
  });

  test('the passport grid: two columns, then one', async () => {
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
    for (const row of ['passport-grid-row-0', 'passport-grid-row-1']) {
      expect(styleOf(screen.getByTestId(row, hidden)).flexDirection).toBe(
        reflows(scale) ? 'column' : 'row',
      );
    }
    expectNoFixedTextHeight();
  });

  test('the hero title grows upward to two lines; the eyebrow takes two from 1.15', async () => {
    await render(
      <TripHero
        title="Portugal Road Trip and the long way home through Spain"
        cover={{ kind: 'typographic', initial: 'P', status: 'active' }}
        tripId="trip-1"
        country={{ iso2: 'PT', name: 'Portugal' }}
        dateRange={{ start: '2026-10-12', end: '2026-10-19' }}
      />,
    );
    const hero = styleOf(screen.getByTestId('trip-hero'));
    expect(hero.minHeight).toBe(236);
    expect(hero.height).toBeUndefined();
    expect(hero.justifyContent).toBe('flex-end');
    expect(screen.getByTestId('trip-title').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('trip-hero-eyebrow').props.numberOfLines).toBe(
      reflows(scale) ? 2 : 1,
    );
    expectNoFixedTextHeight();
  });

  test('the documents ticket: a row, then stacked, the line to two lines', async () => {
    await render(
      <DocumentTicket
        id="d1"
        kind="boarding_pass"
        title="Boarding pass"
        line="AC834 · 22 Nov 2026"
        stub={{ day: '22', month: 'Nov', source: 'flight', spoken: 'Flight date 22 Nov' }}
        pending={false}
        spoken="Boarding pass. AC834"
        onPress={jest.fn()}
      />,
    );
    const surface = styleOf(screen.getByTestId('document-row-d1-surface'));
    expect(surface.flexDirection).toBe(reflows(scale) ? 'column' : 'row');
    expect(surface.minHeight).toBeDefined();
    expect(surface.height).toBeUndefined();
    expect(screen.getByTestId('document-flight-d1').props.numberOfLines).toBe(
      reflows(scale) ? 2 : 1,
    );
    expect(screen.queryByTestId('document-row-d1-notch-top', hidden) === null).toBe(
      reflows(scale),
    );
    expectNoFixedTextHeight();
  });

  test('the stop dates: side by side, then stacked with a hairline', async () => {
    await render(
      <StopDatesBlock
        arrive="2026-10-12"
        depart="2026-10-15"
        onArrive={jest.fn()}
        onDepart={jest.fn()}
      />,
    );
    const block = styleOf(screen.getByTestId('stop-editor-dates'));
    expect(block.flexDirection).toBe(reflows(scale) ? 'column' : 'row');
    expect(block.minHeight).toBeDefined();
    expect(block.height).toBeUndefined();
    expectNoFixedTextHeight();
  });

  test('the notes card: a one-line title, two from 1.5, a foot row that wraps', async () => {
    await render(<NoteCard note={NOTE} onEdit={jest.fn()} onRemove={jest.fn()} />);
    expect(screen.getByTestId('note-title-n1').props.numberOfLines).toBe(
      scale >= 1.5 ? 2 : 1,
    );
    expect(classesOf(screen.getByTestId('note-foot-n1'))).toContain('flex-wrap');
    expect(styleOf(screen.getByTestId('note-foot-n1')).height).toBeUndefined();
    expectNoFixedTextHeight();
  });

  test('the spending hero: the numeral shrinks before it clips, capped at 1.3; the pill wraps', async () => {
    const { view } = pictured();
    await render(<SpendingHero view={view} />);
    const numeral = screen.getAllByText(/^\d/).find((n) => n.props.numberOfLines === 1);
    expect(numeral?.props.adjustsFontSizeToFit).toBe(true);
    expect(numeral?.props.maxFontSizeMultiplier).toBe(1.3);
    expect(classesOf(screen.getByTestId('summary-average'))).toContain('self-start');
    expect(styleOf(screen.getByTestId('summary-average')).height).toBeUndefined();
    expectNoFixedTextHeight();
  });

  test('the per-day chart grows with its labels', async () => {
    const { view } = pictured();
    await render(
      <DayBars
        days={view.days}
        todayIndex={view.todayIndex}
        homeCurrency="CHF"
        fontScale={scale}
      />,
    );
    const chart = screen.getByRole('image');
    expect(styleOf(chart).minHeight).toBeGreaterThanOrEqual(142);
    expect(styleOf(chart).height).toBeUndefined();
    expectNoFixedTextHeight();
  });

  test('Home tools: the chip and the search disc in a row, then stacked right-aligned', async () => {
    await render(<HomeTools />);
    const tools = styleOf(screen.getByTestId('home-tools'));
    expect(tools.flexDirection).toBe(reflows(scale) ? 'column' : 'row');
    expect(tools.alignItems).toBe(reflows(scale) ? 'flex-end' : 'center');
    expect(screen.getByTestId('coming-soon-search')).toBeOnTheScreen();
    expectNoFixedTextHeight();
  });

  test('the greeting is two lines at most and never a fixed height', async () => {
    await render(<GreetingHeader name="Marta" today="2026-10-14" />);
    expect(screen.getByTestId('home-greeting').props.numberOfLines).toBe(2);
    expectNoFixedTextHeight();
  });

  test('the Now card: a 64 dp thumbnail, 48 from 1.15, the title to two lines', async () => {
    await render(<NowCard trip={LIVE} onPress={jest.fn()} />);
    expect(styleOf(screen.getByTestId('home-now-card-thumb', hidden)).width).toBe(
      reflows(scale) ? 48 : 64,
    );
    expect(screen.getByText('Portugal Road Trip').props.numberOfLines).toBe(
      reflows(scale) ? 2 : 1,
    );
    expectNoFixedTextHeight();
  });

  test('the Up next row: a 48 dp thumbnail, the lines to two from 1.15', async () => {
    await render(<NextRow trip={PLANNED} onPress={jest.fn()} />);
    expect(screen.getByText('Iceland Ring Road').props.numberOfLines).toBe(
      reflows(scale) ? 2 : 1,
    );
    expectNoFixedTextHeight();
  });

  test('the Nights stepper wraps under its words and keeps a minimum', async () => {
    await render(<NightsStepper nights={4} endsOn="19 Oct" onChange={jest.fn()} />);
    const tile = styleOf(screen.getByTestId('stop-editor-nights'));
    expect(tile.flexWrap).toBe('wrap');
    expect(tile.minHeight).toBe(64);
    expect(tile.height).toBeUndefined();
    expectNoFixedTextHeight();
  });

  test('the form footer: Save is a button that grows, never a fixed height', async () => {
    await render(
      <FormActions
        testIDPrefix="add-trip"
        saveLabel="Save the trip with a label that has to wrap"
        onCancel={jest.fn()}
        onSave={jest.fn()}
      />,
    );
    const save = styleOf(screen.getByTestId('add-trip-save'));
    expect(save.height).toBeUndefined();
    expect(save.minHeight).toBe(buttonFrame('lg', false, scale).minHeight);
    expectNoFixedTextHeight();
  });

  test('the +N photograph tile shrinks a long count to fit its tile instead of clipping', async () => {
    await render(
      <PhotoTile
        photo={PHOTO}
        frame={{ left: 0, top: 0, width: 112, height: 112 }}
        now={0}
        more={{ count: 1204, label: '1204 more photos from Wednesday 14 October' }}
        onOpen={jest.fn()}
        onRetry={jest.fn()}
        onMore={jest.fn()}
      />,
    );
    const count = screen.getByTestId('photo-more-count');
    expect(count).toHaveTextContent('+1204');
    expect(count.props.numberOfLines).toBe(1);
    expect(count.props.adjustsFontSizeToFit).toBe(true);
    // The tile is the mosaic's fixed square cell, and the count in it shrinks to fit.
    expect(fixedHeightTextContainers().map((node) => node.testID)).toEqual([
      `photo-tile-${PHOTO.id}`,
    ]);
  });

  test('the tab pill is a minimum and grows; a label wraps, capped at 1.3', async () => {
    useAppearance.mockReturnValue(appearanceOf('light', { fontScale: scale }));
    await render(<TabBar {...tabProps()} />);
    const surface = screen.getByTestId(/^tab-surface-(glass|blur|solid)$/);
    expect(styleOf(surface).minHeight).toBe(PillMetrics.height);
    expect(styleOf(surface).height).toBeUndefined();
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBe(PillMetrics.tabMinHeight);
    }
    for (const title of ['Globe', 'Trips', 'You']) {
      const label = screen.getByText(title);
      expect(label.props.maxFontSizeMultiplier).toBe(1.3);
      expect(label.props.numberOfLines).toBeUndefined();
    }
    expectNoFixedTextHeight();
  });
});

describe('every scroller of the components keeps scrolling at the largest size', () => {
  test('the per-day chart scrolls sideways at 2 instead of squeezing its columns', async () => {
    atScale(2);
    const { view } = pictured();
    await render(
      <DayBars
        days={view.days}
        todayIndex={view.todayIndex}
        homeCurrency="CHF"
        fontScale={2}
      />,
    );
    expect(hostsWhere((node) => node.type === 'RCTScrollView')).toHaveLength(1);
  });
});

const PHOTO: PhotoWithPlace = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  trip_id: 'trip-42',
  city_id: 100,
  taken_at: '2026-10-14T12:00:00.000Z',
  exif_lat: null,
  exif_lng: null,
  is_public: false,
  upload_state: 'uploaded',
  moderation_state: 'pending',
  has_thumbnail: false,
  created_at: '2026-10-14T12:00:00.000Z',
  updated_at: '2026-10-14T12:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-10-14T12:00:00.000Z',
  local_file_uri: 'photos/trip-42/aaaaaaaa.jpg',
  city_name: 'Roma',
  country_name: 'Italy',
  city_lat: 41.9,
  city_lng: 12.5,
  city_timezone: 'Europe/Rome',
};

const LIVE: HomeTrip = {
  id: 'live',
  title: 'Portugal Road Trip',
  status: 'active',
  cover: { kind: 'typographic', initial: 'P', status: 'active' },
  dayOf: { day: 3, of: 8 },
  place: 'Sintra',
  strip: ['done', 'done', 'now', 'next', 'later', 'later', 'later', 'later'],
  startsOn: '2026-10-12',
  daysToGo: null,
  iso2: 'PT',
};

const PLANNED: HomeTrip = {
  id: 'soon',
  title: 'Iceland Ring Road',
  status: 'planning',
  cover: { kind: 'typographic', initial: 'I', status: 'planning' },
  dayOf: null,
  place: null,
  strip: ['next', 'later'],
  startsOn: '2027-01-16',
  daysToGo: 94,
  iso2: 'IS',
};

const NOTE: NoteWithPlace = {
  id: 'n1',
  trip_id: 'trip-42',
  country_id: 1,
  city_id: 100,
  title: 'A long title for a note that has to wrap at the largest text size',
  body: 'Body of the note',
  is_public: false,
  created_at: '2026-10-14T08:15:00.000Z',
  updated_at: '2026-10-14T08:15:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
  country_name: 'Portugal',
  city_name: 'Sintra',
  country_iso: 'PT',
};

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

function tabProps(): BottomTabBarProps {
  const descriptors = Object.fromEntries(
    ROUTES.map((route) => [
      route.key,
      {
        options: { title: route.title },
        route: { key: route.key, name: route.name },
        navigation: {},
        render: () => null,
      },
    ]),
  );
  return {
    state: {
      key: 'tabs',
      index: 0,
      routeNames: ROUTES.map((r) => r.name),
      routes: ROUTES.map((r) => ({ key: r.key, name: r.name })),
      type: 'tab',
      stale: false,
      history: [],
      preloadedRouteKeys: [],
    },
    descriptors,
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  } as unknown as BottomTabBarProps;
}

const [FOOD, LODGING] = SYSTEM_EXPENSE_CATEGORIES.map((c) => c.id) as [string, string];

const expense = (over: Partial<ExpenseRow> & { id: string }): ExpenseRow => ({
  trip_id: 't',
  city_id: null,
  category_id: FOOD,
  amount: '1.00',
  currency: 'CHF',
  spent_at: '2026-10-12',
  note: null,
  fx_rate_to_home: '1.000000',
  amount_home: '1.00',
  fx_pending: false,
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  ...over,
});

/** Three days of eight with spending on two of them. */
function pictured() {
  const rows = [
    expense({ id: 'a', spent_at: '2026-10-12', amount_home: '310.00' }),
    expense({
      id: 'b',
      spent_at: '2026-10-13',
      amount_home: '252.00',
      category_id: LODGING,
    }),
  ];
  const summary = summariseExpenses(
    rows,
    'CHF',
    categoryOptions([]),
    'https://rates.example',
  );
  return {
    view: deriveSpendingView(summary, {
      range: { start: '2026-10-12', end: '2026-10-19' },
      today: '2026-10-14',
    }),
  };
}
