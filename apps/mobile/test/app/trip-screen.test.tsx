/**
 * `trip/[id]` as a journey (T068, 004 T431, 005 T543 to T546; spec FR-025, FR-037 to FR-043,
 * FR-007, FR-081; screens.md "Trip").
 *
 * The live-query hooks and actions are mocked (their own suites run them against a real
 * database), and so are the two derived reads of this screen (`useTripOverview`, `useTripSync`;
 * `test/features` and `src/features/trips/__tests__` pin them). Pinned here: every state is
 * designed (FR-064), the hero, the status row, the five areas, the day strip and the timeline
 * are composed in that order, every pre-existing id and name still resolves (FR-081), every stop
 * action reaches the right repository call with the right arguments (FR-012), and a failed local
 * write is reported and shown rather than swallowed.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import TripScreen from '@/app/trip/[id]/index';
import { Sentry } from '@/lib/sentry';

import {
  florence,
  iso,
  live,
  overview,
  resetTripScreen,
  rome,
  router,
  spyOnScroll,
  stop,
  sync,
  trip,
} from './trip-screen-harness';

const hidden = { includeHiddenElements: true };

jest.mock('expo-router', () => require('./trip-screen-harness').routerModule());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('./trip-screen-harness').reanimatedModule(),
);
// A View that carries every prop, so a test reads what a cover was given.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});
jest.mock('@/components/trip/city-picker', () =>
  require('./trip-screen-harness').cityPickerModule(),
);
jest.mock('@/features/trips/use-trips', () =>
  require('./trip-screen-harness').tripsModule(),
);
jest.mock('@/features/trips/trip-overview', () =>
  require('./trip-screen-harness').overviewModule(),
);
jest.mock('@/features/trips/use-trip-sync', () =>
  require('./trip-screen-harness').syncModule(),
);

beforeEach(resetTripScreen);

describe('<TripScreen> states (FR-043, FR-064)', () => {
  test('shows a skeleton shaped like the screen until the trip is read, and is already the trip screen', async () => {
    live.trip.data = null;
    live.trip.loading = true;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-screen')).toBeTruthy();
    const region = screen.getByLabelText('Loading trip');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getByTestId('trip-skeleton')).toBeTruthy();
  });

  test('shows a designed empty state when the trip is not on this device', async () => {
    live.trip.data = null;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-screen')).toBeTruthy();
    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();
    expect(screen.queryByTestId('trip-add-stop')).toBeNull();
    expect(screen.queryByTestId('trip-title')).toBeNull();
    expect(screen.queryByTestId('trip-links')).toBeNull();
  });

  test('says in words that the trip could not be read, rather than that it is missing (FR-035)', async () => {
    live.trip.data = null;
    live.trip.error = new Error('locked');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(screen.queryByText('This trip isn’t on this device')).toBeNull();
    expect(screen.queryByTestId('trip-add-stop')).toBeNull();
  });

  // A live read that fails leaves its first-result timestamp unset, so a hook that only
  // looked at that reported `loading` together with the error. The screen must not let the
  // skeleton hide the words, whichever way a hook reports the pair.
  test('shows the error, not the skeleton, when a failed read still says loading', async () => {
    live.trip.data = null;
    live.trip.loading = true;
    live.trip.error = new Error('no such table');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(screen.queryByLabelText('Loading trip')).toBeNull();
  });

  test('shows the stops error, not the placeholders, when a failed read still says loading', async () => {
    live.stops.loading = true;
    live.stops.error = new Error('no such table');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read the stops')).toBeTruthy();
    expect(screen.queryByLabelText('Loading stops')).toBeNull();
    expect(screen.queryByTestId('trip-stops')).toBeNull();
  });

  test('never shows its empty state while the first read is still resolving (C4-10 rule 2)', async () => {
    live.trip.data = null;
    live.trip.loading = true;
    await render(<TripScreen />);
    expect(screen.queryByText('This trip isn’t on this device')).toBeNull();
    expect(screen.queryByTestId('trip-header-row')).toBeNull();
  });

  test('shows placeholders shaped like the stops while they load, named for assistive technology (FR-021)', async () => {
    live.stops.loading = true;
    await render(<TripScreen />);

    const region = screen.getByLabelText('Loading stops');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByText('No stops yet')).toBeNull();
    // The rest of the screen is already there while the stops load.
    expect(screen.getByTestId('trip-title')).toBeTruthy();
    expect(screen.getByTestId('trip-links')).toBeTruthy();
  });

  test('shows a designed error state when the stops query fails', async () => {
    live.stops.error = new Error('locked');
    await render(<TripScreen />);
    expect(screen.getByText('Couldn’t read the stops')).toBeTruthy();
  });

  test('handles an array param without crashing: expo-router can hand back one', async () => {
    router.params = { id: ['trip-42', 'other'] };
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-title')).toBeTruthy();
  });
});

describe('<TripScreen> the hero and the status row (FR-037, FR-038, FR-025)', () => {
  test("is the trip screen, and the title is the hero's heading in the exact words of the trip", async () => {
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-screen')).toBeTruthy();
    const title = screen.getByTestId('trip-title');
    expect(title).toHaveTextContent('Italy, spring 2026');
    expect(title.props.accessibilityRole).toBe('header');
    expect(
      within(screen.getByTestId('trip-hero')).getByTestId('trip-title'),
    ).toBeTruthy();
  });

  test('draws no Back of its own: the native header carries it (trip-layout.test.tsx)', async () => {
    await render(<TripScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.queryByText('Back')).toBeNull();
  });

  test('says the country with its flag and the dates of the stops above the title', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const eyebrow = screen.getByTestId('trip-hero-eyebrow');
    expect(eyebrow).toHaveTextContent(/^Italy · /);
    expect(screen.getByTestId('trip-hero-flag', hidden)).toBeTruthy();
  });

  test("draws the cover the overview resolved: the traveller's photograph", async () => {
    overview.cover = { kind: 'photo', photoId: 'p1', thumbnailUri: 'file:///t/p1.jpg' };
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-hero-photo', hidden).props.source).toEqual({
      uri: 'file:///t/p1.jpg',
    });
  });

  test("with no photograph it is the generated cover, with the trip's first letter", async () => {
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-hero-generated', hidden)).toBeTruthy();
  });

  test('has the collapsed bar beneath the header, with the title, hidden from assistive technology', async () => {
    await render(<TripScreen />);
    const bar = screen.getByTestId('trip-collapsed-bar', hidden);
    expect(bar.props.accessibilityElementsHidden).toBe(true);
    expect(within(bar).getByText('Italy, spring 2026', hidden)).toBeTruthy();
    expect(screen.getAllByText('Italy, spring 2026')).toHaveLength(1);
  });

  test('shows the derived status as text + icon, the currency, and a pending marker while dirty', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const row = within(screen.getByTestId('trip-header-row'));
    expect(row.getByTestId('status-pill-planning')).toBeTruthy();
    expect(row.getByLabelText('Status: Planning')).toBeTruthy();
    expect(row.getByText('EUR')).toBeTruthy();
    // The trip row and the Florence stop are dirty; Rome is synced.
    expect(screen.getAllByLabelText('Sync pending')).toHaveLength(2);
    expect(row.getByLabelText('Sync pending')).toBeTruthy();
  });

  test('derives Active from the stops, not from the stored column (FR-013), and says Day N of M', async () => {
    live.stops.data = [stop({ arrive_date: iso(-1), depart_date: iso(1) })];
    await render(<TripScreen />);
    expect(screen.getByLabelText('Status: Active')).toBeTruthy();
    expect(screen.getByTestId('trip-progress-day')).toHaveTextContent('Day 2 of 3');
  });

  test('says no day for a trip that has not started', async () => {
    live.stops.data = [rome];
    await render(<TripScreen />);
    expect(screen.queryByTestId('trip-progress-day')).toBeNull();
  });

  test('shows no sync marker beside a trip that is already on the server', async () => {
    live.trip.data = { ...trip, is_dirty: false };
    await render(<TripScreen />);
    expect(
      within(screen.getByTestId('trip-header-row')).queryByLabelText('Sync pending'),
    ).toBeNull();
  });

  test('reads top to bottom: title, status row, areas, stops, then Add stop at the end of the timeline', async () => {
    live.stops.data = [rome];
    await render(<TripScreen />);

    const order = screen
      .getAllByTestId(/^trip-(title|header-row|links|add-stop|stops)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual([
      'trip-title',
      'trip-header-row',
      'trip-links',
      'trip-stops',
      'trip-add-stop',
    ]);
  });
});

describe('<TripScreen> synchronisation (FR-026, FR-043, FR-065)', () => {
  test('shows the one chip beside the status, with the count', async () => {
    sync.state = { kind: 'waiting', count: 3 };
    await render(<TripScreen />);
    const chip = within(screen.getByTestId('trip-header-row')).getByTestId('sync-chip');
    expect(chip.props.accessibilityLabel).toBe('3 changes waiting to sync');
  });

  test('a failed sync is a Retry chip that syncs now', async () => {
    sync.state = { kind: 'failed', count: 2 };
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('sync-chip'));
    expect(sync.retrySync).toHaveBeenCalledTimes(1);
  });

  test('says nothing when everything is synchronised', async () => {
    await render(<TripScreen />);
    expect(screen.queryByTestId('sync-chip')).toBeNull();
    expect(screen.queryByTestId('trip-banner')).toBeNull();
  });

  test('offline is one slim banner under the status row, in words, and no action', async () => {
    sync.state = { kind: 'offline', count: 3 };
    sync.banner = {
      tone: 'offline',
      message: "Offline. 3 changes will sync when you're back online.",
      action: null,
    };
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-banner-message')).toHaveTextContent(
      "Offline. 3 changes will sync when you're back online.",
    );
    expect(screen.queryByTestId('trip-banner-retry')).toBeNull();
    expect(screen.getAllByTestId('trip-banner')).toHaveLength(1);
  });

  test('a failed upload is an error banner with Retry, and the Photos tile is ringed', async () => {
    overview.failedPhotos = 2;
    overview.failedPhotoIds = ['p1', 'p2'];
    sync.banner = {
      tone: 'error',
      message: "2 photos couldn't upload. They are safe on this phone.",
      action: 'photos',
    };
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-banner-message')).toHaveTextContent(
      /^2 photos couldn't upload\./,
    );
    expect(screen.getByTestId('trip-open-photos-warn', hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trip-banner-retry'));
    expect(sync.retry).toHaveBeenCalledTimes(1);
  });

  test('a Retry that cannot write locally is reported and shown, not swallowed', async () => {
    sync.banner = { tone: 'error', message: 'x', action: 'photos' };
    sync.retry.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('trip-banner-retry'));
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByTestId('trip-write-error')).toHaveTextContent(
      /could not be saved/,
    );
  });

  test('the Photos tile is not ringed when nothing failed', async () => {
    await render(<TripScreen />);
    expect(screen.queryByTestId('trip-open-photos-warn', hidden)).toBeNull();
  });
});

describe('<TripScreen> the five areas (FR-039, FR-081)', () => {
  test('shows the counts and the exact spending total the overview read', async () => {
    overview.counts = { photos: 128, notes: 6, expenses: 9, documents: 4 };
    overview.spendingTotal = '842.00';
    await render(<TripScreen />);
    expect(within(screen.getByTestId('trip-open-photos')).getByText('128')).toBeTruthy();
    expect(within(screen.getByTestId('trip-open-notes')).getByText('6')).toBeTruthy();
    expect(within(screen.getByTestId('trip-open-documents')).getByText('4')).toBeTruthy();
    expect(
      within(screen.getByTestId('trip-open-expenses')).getByText('€842.00'),
    ).toBeTruthy();
  });

  test('shows zeros in the tiles for a trip with nothing yet (FR-042)', async () => {
    await render(<TripScreen />);
    expect(within(screen.getByTestId('trip-open-photos')).getByText('0')).toBeTruthy();
  });

  test.each([
    ['notes', 'Notes', 'Notes for this trip'],
    ['expenses', 'Expenses', 'Spending for this trip'],
    ['photos', 'Photos', 'Photos for this trip'],
    ['documents', 'Documents', 'Travel documents for this trip'],
    ['offline-maps', 'Offline maps', 'Offline maps for this trip'],
  ])(
    '"%s" opens the trip\'s own screen for it (US2, US4, US5)',
    async (segment, text, label) => {
      live.stops.data = [rome];
      await render(<TripScreen />);

      const link = screen.getByTestId(`trip-open-${segment}`);
      expect(link.props.accessibilityLabel).toBe(label);
      expect(within(link).getByText(text)).toBeTruthy();

      await fireEvent.press(link);
      expect(router.push).toHaveBeenCalledWith(`/trip/trip-42/${segment}`);
    },
  );

  test('says in one line that Expenses and Documents are only visible to the traveller', async () => {
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-privacy-line')).toHaveTextContent(
      /only visible to you/,
    );
  });
});

describe('<TripScreen> the day strip (FR-040)', () => {
  const dated = [
    stop({ id: 'a', arrive_date: iso(10), depart_date: iso(12), city_name: 'Alfa' }),
    stop({
      id: 'b',
      sort_order: 1,
      city_id: 101,
      arrive_date: iso(12),
      depart_date: iso(14),
      city_name: 'Beta',
    }),
  ];

  test('is hidden for a trip with no stops, and drawn for one with', async () => {
    await render(<TripScreen />);
    expect(screen.queryByTestId('trip-days')).toBeNull();
    await screen.unmount();

    live.stops.data = dated;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-days')).toBeTruthy();
    expect(screen.getByTestId('trip-day-all')).toBeTruthy();
    expect(screen.getAllByTestId(/^trip-day-\d+$/)).toHaveLength(5);
  });

  test('"All" is chosen to start with, and no stop is highlighted', async () => {
    live.stops.data = dated;
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-day-all').props.accessibilityState.checked).toBe(
      true,
    );
    expect(screen.getByTestId('stop-card-a').props.variant).toBe('transparent');
  });

  test('choosing a day highlights that day\'s stops, and "All" takes it away', async () => {
    live.stops.data = dated;
    await render(<TripScreen />);
    // Day 3 is the day Alfa is left and Beta reached: both.
    await fireEvent.press(screen.getByTestId('trip-day-3'));
    expect(screen.getByTestId('trip-day-3').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('stop-card-a').props.variant).toBe('secondary');
    expect(screen.getByTestId('stop-card-b').props.variant).toBe('secondary');

    await fireEvent.press(screen.getByTestId('trip-day-1'));
    expect(screen.getByTestId('stop-card-a').props.variant).toBe('secondary');
    expect(screen.getByTestId('stop-card-b').props.variant).toBe('transparent');

    await fireEvent.press(screen.getByTestId('trip-day-all'));
    expect(screen.getByTestId('stop-card-a').props.variant).toBe('transparent');
  });

  test('choosing a day scrolls to its first stop, below the bar and the strip', async () => {
    live.stops.data = dated;
    await render(<TripScreen />);
    // Where things laid out: the stops section at 700 in the content, the list 40 into it,
    // each row 110 tall, the pinned strip 68 tall under the 56 dp bar.
    const at = (id: string, y: number, height: number) =>
      fireEvent(screen.getByTestId(id), 'layout', {
        nativeEvent: { layout: { x: 0, y, width: 390, height } },
      });
    await at('trip-stops-body', 700, 600);
    await at('trip-stops-list', 40, 220);
    await at('stop-item-a', 0, 110);
    await at('stop-item-b', 0, 110);
    await at('trip-days-pin', 0, 68);

    const scrollTo = spyOnScroll();
    await fireEvent.press(screen.getByTestId('trip-day-4'));
    // Day 4 starts with Beta: 700 + 40 + 110 - (56 + 68).
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 726, animated: true });

    await fireEvent.press(screen.getByTestId('trip-day-1'));
    // Day 1 is Alfa: 700 + 40 + 0 - 124.
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 616, animated: true });
  });

  test('"All" does not scroll', async () => {
    live.stops.data = dated;
    await render(<TripScreen />);
    const scrollTo = spyOnScroll();
    await fireEvent.press(screen.getByTestId('trip-day-all'));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
