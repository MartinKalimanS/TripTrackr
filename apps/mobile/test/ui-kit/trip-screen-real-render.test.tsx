/**
 * 004 T431 - the trip screen over the REAL `heroui-native` under Jest (research D4-13).
 *
 * `test/app/trip-and-modal-screens.test.tsx` renders the screen over the stand-in. This
 * file puts the kit's own Button, Chip, Card and Skeleton underneath it, so what the screen
 * relies on is checked against the real components: nothing throws (a card inside a card
 * is a development error; a kit component needs only the provider), the ids and names land
 * on the nodes a test or a Maestro flow finds them by, and our classes reach the card. How
 * a class LOOKS (the rail, the dashed edge, the chip fill) is Uniwind's, on a device.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import TripScreen from '@/app/trip/[id]/index';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'trip-42' }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockStops: { data: StopWithPlace[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({ data: mockTrip, loading: false, error: null }),
  useTripStops: () => mockStops,
  useTripActions: () => ({}),
}));

const mockTrip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
};

function stop(id: string, city: string, order: number, dirty: boolean): StopWithPlace {
  return {
    id,
    trip_id: 'trip-42',
    city_id: 100 + order,
    sort_order: order,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: dirty,
    synced_at: dirty ? null : 'x',
    city_name: city,
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
  };
}

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// screen: only that message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
const consoleError = console.error.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());
const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

function renderScreen() {
  return render(
    <HeroUINativeProvider config={CONFIG}>
      <TripScreen />
    </HeroUINativeProvider>,
  );
}

beforeEach(() => {
  mockStops.data = [stop('s1', 'Roma', 0, false), stop('s2', 'Firenze', 1, true)];
  mockStops.loading = false;
  mockStops.error = null;
});

describe('the trip screen over the real kit', () => {
  test('renders the hero, the areas, the stops header and the timeline without error', async () => {
    await renderScreen();

    expect(screen.getByTestId('trip-title')).toHaveTextContent('Italy, spring 2026');
    expect(within(screen.getByTestId('trip-header-row')).getByText('EUR')).toBeTruthy();
    expect(screen.getByTestId(/^status-pill-/)).toBeTruthy();
    expect(screen.getByTestId('trip-links').props.horizontal).toBe(true);
    expect(screen.getByTestId('trip-stops')).toBeTruthy();
  });

  test('the five areas are chips the kit names, presses and routes', async () => {
    await renderScreen();

    const notes = screen.getByTestId('trip-open-notes');
    expect(notes.props.accessibilityRole).toBe('button');
    expect(notes.props.accessibilityLabel).toBe('Notes for this trip');
    await fireEvent.press(notes);
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42/notes');
  });

  test('"Add stop" is a button the kit names and presses', async () => {
    await renderScreen();

    const add = screen.getByTestId('trip-add-stop');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.accessibilityLabel).toBe('Add stop');
    expect(screen.getAllByLabelText('Add stop')).toHaveLength(1);
  });

  test('each stop is one row with four named controls, in a flat card; a pending one has a dashed edge', async () => {
    await renderScreen();

    for (const id of ['s1', 's2']) {
      expect(screen.getByTestId(`stop-row-${id}`).props.accessible).toBe(true);
      for (const control of ['move-up', 'move-down', 'edit', 'remove']) {
        expect(screen.getByTestId(`stop-${control}-${id}`).props.accessibilityRole).toBe(
          'button',
        );
      }
    }
    expect(classesOf(screen.getByTestId('stop-card-s1'))).toEqual(
      expect.arrayContaining(['surface__root--variant-transparent', 'shadow-none']),
    );
    expect(classesOf(screen.getByTestId('stop-card-s1'))).not.toContain('border-dashed');
    expect(classesOf(screen.getByTestId('stop-card-s2'))).toEqual(
      expect.arrayContaining([
        'surface__root--variant-transparent',
        'shadow-none',
        'border-dashed',
        'border-amber-line',
      ]),
    );
  });

  test('the first stop cannot move up and the last cannot move down, as the kit announces them', async () => {
    await renderScreen();

    expect(screen.getByTestId('stop-move-up-s1').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(
      screen.getByTestId('stop-move-down-s2').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByTestId('stop-move-down-s1').props.accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  test('while the stops load, the kit draws one named placeholder region instead of a list', async () => {
    mockStops.data = [];
    mockStops.loading = true;
    await renderScreen();

    const region = screen.getByLabelText('Loading stops');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByTestId('trip-stops')).toBeNull();
  });
});
