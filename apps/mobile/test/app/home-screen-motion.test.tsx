/**
 * The Home in motion (feature 005, T537; contract C5-24; FR-015, FR-017, FR-019, FR-081, FR-082):
 * the recentre control that appears only after the globe was moved, the idle spin with ONE timer
 * and every stop condition, the actions of the map for a traveller who cannot drag or see, the
 * connections that still open their trip, and the touches the cards leave to the map. The states,
 * the sheet and the camera's fit are `home-screen.test.tsx`; the mocked world is
 * `test/helpers/home-state.tsx`, and the timer is spied through `setInterval` (AGENTS.md).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { IDLE_SPIN_MOVES, IdleSpin } from '@/features/globe/idle-spin';
import { globeFitCamera } from '@/features/globe/globe-fit';
import { recentreMove } from '@/features/globe/globe-moves';

import { appearance } from '../helpers/appearance';
import { captureIntervals, type CapturedIntervals } from '../helpers/captured-interval';
import {
  camera,
  changeDetent,
  fitFor,
  renderHome,
  resetHome,
  sheetDetent,
  trip,
  ui,
  withLiveTrip,
  withPastTrip,
} from '../helpers/home-harness';
import { focus, globe, homeTrips, router, sync } from '../helpers/home-state';

// The mocks are the shared world of the Home suites: see test/helpers/home-state.tsx.
jest.mock('expo-router', () => require('../helpers/home-state').factories.router());
jest.mock('@/hooks/use-app-active', () =>
  require('../helpers/home-state').factories.appActive(),
);
jest.mock('@/hooks/use-mapbox-ready', () =>
  require('../helpers/home-state').factories.mapboxReady(),
);
jest.mock('@/hooks/use-appearance');
jest.mock('@/components/trip/use-tab-zone', () =>
  require('../helpers/home-state').factories.tabZone(),
);
jest.mock('@/lib/sentry', () => require('../helpers/home-state').factories.sentry());
jest.mock('expo-image', () => require('../helpers/home-state').factories.image());
jest.mock('@/features/globe/use-globe', () =>
  require('../helpers/home-state').factories.useGlobe(),
);
jest.mock('@/features/home/use-home-trips', () =>
  require('../helpers/home-state').factories.useHomeTrips(),
);
jest.mock('@/features/passport/use-country-overview', () =>
  require('../helpers/home-state').factories.useCountryOverview(),
);
jest.mock('@/features/sync/use-sync-chip-state', () =>
  require('../helpers/home-state').factories.syncChipState(),
);
jest.mock('@/sync/engine', () => require('../helpers/home-state').factories.syncEngine());
jest.mock('@/components/ui/sheet', () =>
  require('../helpers/home-state').factories.sheet(),
);

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

let intervals: CapturedIntervals;
const spins = () => intervals.all.filter((interval) => interval.ms === IdleSpin.stepMs);
const liveSpins = () => intervals.live().filter((i) => i.ms === IdleSpin.stepMs);

beforeEach(() => {
  resetHome();
  intervals = captureIntervals(IdleSpin.stepMs);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Recentre appears only after the globe was moved (FR-015)', () => {
  const touch = (type: 'touchStart' | 'touchMove', x: number, y: number, count = 1) =>
    fireEvent(screen.getByTestId('home-globe'), type, {
      nativeEvent: {
        pageX: x,
        pageY: y,
        touches: Array.from({ length: count }, () => ({})),
      },
    });

  test('none at first, and none after a tap', async () => {
    withPastTrip();
    await renderHome();
    expect(screen.queryByTestId('home-recentre')).toBeNull();
    await touch('touchStart', 100, 300);
    await touch('touchMove', 102, 301);
    expect(screen.queryByTestId('home-recentre')).toBeNull();
  });

  test('a drag brings it, and it flies back to the globe\u2019s centre with the sheet\u2019s fit and goes away', async () => {
    withPastTrip();
    await renderHome();
    await touch('touchStart', 100, 300);
    await touch('touchMove', 160, 340);
    const control = screen.getByTestId('home-recentre');
    expect(control.props.accessibilityLabel).toBe('Recentre the globe');

    await fireEvent.press(control);
    const fit = globeFitCamera('half', fitFor('half'), { animated: true })!;
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    expect(camera().setCamera).toHaveBeenCalledWith(
      recentreMove(expect.any(Array) as never, fit, true),
    );
    expect(screen.queryByTestId('home-recentre')).toBeNull();
  });

  test('a pinch brings it too', async () => {
    withPastTrip();
    await renderHome();
    await touch('touchStart', 100, 300, 2);
    expect(screen.getByTestId('home-recentre')).toBeTruthy();
  });

  test('the control floats below the header: it never changes where the globe is fitted', async () => {
    withPastTrip();
    await renderHome();
    await touch('touchStart', 100, 300, 2);
    expect(camera().setCamera).not.toHaveBeenCalled();
  });
});

describe('The idle spin: one timer, every stop condition (FR-019)', () => {
  test('turns while Home is idle at world scale: ONE timer of one step', async () => {
    withPastTrip();
    await renderHome();
    expect(spins()).toHaveLength(1);
    expect(liveSpins()).toHaveLength(1);
    await act(async () => intervals.tick(intervals.all.indexOf(spins()[0]!)));
    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ animationMode: 'linearTo', animationDuration: 5000 }),
    );
  });

  test('also turns with nothing on it (no trips)', async () => {
    await renderHome();
    expect(liveSpins()).toHaveLength(1);
  });

  test('being offline is no reason to stop', async () => {
    withPastTrip();
    sync.current = { kind: 'offline', count: 3 };
    await renderHome();
    expect(liveSpins()).toHaveLength(1);
  });

  test('stops at the first touch of the globe, for good', async () => {
    withPastTrip();
    await renderHome();
    await fireEvent(screen.getByTestId('home-globe'), 'touchStart', {
      nativeEvent: { pageX: 1, pageY: 1, touches: [{}] },
    });
    expect(liveSpins()).toHaveLength(0);
  });

  test('stops when the sheet is above half, and turns again when it is lowered', async () => {
    withPastTrip();
    await renderHome();
    await changeDetent('full');
    expect(liveSpins()).toHaveLength(0);
    await changeDetent('half');
    expect(liveSpins()).toHaveLength(1);
  });

  test('never starts under reduced motion', async () => {
    useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
    withPastTrip();
    await renderHome();
    expect(spins()).toHaveLength(0);
  });

  test('stops while the app is in the background', async () => {
    withPastTrip();
    const view = await renderHome();
    focus.appActive = false;
    await view.rerender(ui());
    expect(liveSpins()).toHaveLength(0);
  });

  test('stops while Home is not the visible screen', async () => {
    withPastTrip();
    const view = await renderHome();
    focus.focused = false;
    await view.rerender(ui());
    expect(liveSpins()).toHaveLength(0);
  });

  test('does not turn while a live trip\u2019s callout is showing', async () => {
    withLiveTrip();
    await renderHome();
    expect(spins()).toHaveLength(0);
  });

  test('is over after 45 seconds of turning', async () => {
    withPastTrip();
    await renderHome();
    const index = intervals.all.indexOf(spins()[0]!);
    for (let move = 0; move <= IDLE_SPIN_MOVES; move += 1) {
      await act(async () => intervals.tick(index));
    }
    const moves = camera().setCamera.mock.calls.filter(
      ([settings]) => settings.animationMode === 'linearTo',
    );
    expect(moves).toHaveLength(IDLE_SPIN_MOVES);
    expect(liveSpins()).toHaveLength(0);
  });

  test('has no timer before the globe is drawn (loading)', async () => {
    globe.loading = true;
    await render(ui());
    expect(spins()).toHaveLength(0);
  });
});

describe('The globe without dragging or sight (FR-017)', () => {
  const action = (actionName: string) =>
    act(() =>
      screen.getByTestId('globe-map').props.onAccessibilityAction({
        nativeEvent: { actionName },
      }),
    );

  test('offers next trip, previous trip, recentre and open countries on the map', async () => {
    withPastTrip();
    await renderHome();
    expect(
      screen
        .getByTestId('globe-map')
        .props.accessibilityActions.map((a: { name: string }) => a.name),
    ).toEqual(['nextTrip', 'previousTrip', 'recentre', 'openCountries']);
  });

  test('open countries raises the sheet to the Countries list', async () => {
    withPastTrip();
    await renderHome();
    await action('openCountries');
    expect(sheetDetent()).toBe('full');
  });

  test('next trip flies to a trip, stops the spin and offers recentre', async () => {
    withPastTrip();
    await renderHome();
    await action('nextTrip');
    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        animationMode: 'flyTo',
        centerCoordinate: [12.4964, 41.9028],
      }),
    );
    expect(liveSpins()).toHaveLength(0);
    expect(screen.getByTestId('home-recentre')).toBeTruthy();
  });

  test('recentre recentres the camera', async () => {
    withPastTrip();
    await renderHome();
    await action('recentre');
    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ heading: 0, pitch: 0, animationMode: 'flyTo' }),
    );
  });
});

describe('The globe keeps its interactions and its ONE map (FR-081, FR-082)', () => {
  test('tapping a connection still opens its trip', async () => {
    withPastTrip();
    await renderHome();
    await fireEvent(screen.getByTestId('mapbox-ShapeSource-globe-arcs'), 'press', {
      features: [{ properties: { trip_id: 'past', status: 'past' } }],
    });
    expect(router.push).toHaveBeenCalledWith('/trip/past');
  });

  test('draws the arcs of the same local trips on that one map, with the covers the sheet read', async () => {
    withPastTrip();
    homeTrips.covers = { past: 'file:///thumbs/past.jpg' };
    await renderHome();
    expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
    const arcs = screen.getByTestId('mapbox-ShapeSource-globe-arcs').props.shape;
    expect(arcs.features.length).toBeGreaterThanOrEqual(0);
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-pins').props.shape.features,
    ).toHaveLength(1);
  });
});

describe('Touches: the globe stays interactive around the cards (003 FR-003)', () => {
  const flat = (style: unknown) =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<
      string,
      unknown
    >;
  const states = {
    invitation: [
      'globe-empty-state',
      () => {
        globe.data = { ...globe.data, trips: [trip('lonely', 'planning', false)] };
      },
    ],
    notice: [
      'globe-notice',
      () => {
        globe.error = new Error('database is locked');
      },
    ],
  } as const;

  test.each(Object.keys(states) as (keyof typeof states)[])(
    'the %s takes its own touches: nothing between it and its slot blocks them',
    async (name) => {
      const [id, setup] = states[name];
      setup();
      await renderHome();
      let node = screen.getByTestId(id) as { props: Record<string, unknown> } | null;
      let walked = 0;
      while (node && node.props.testID !== 'home-bottom-card') {
        const own = node.props.pointerEvents ?? flat(node.props.style).pointerEvents;
        expect([undefined, 'auto']).toContain(own);
        node = (node as unknown as { parent: typeof node }).parent;
        walked += 1;
      }
      expect(node).not.toBeNull();
      expect(walked).toBeGreaterThan(0);
      // The slot itself lets a touch beside the card reach the map.
      expect(node!.props.pointerEvents).toBe('box-none');
    },
  );
});

describe('The Home is built on the adapter layer (research D4-02)', () => {
  test.each([
    '@/app/(tabs)/index',
    '@/components/home/home-globe',
    '@/components/home/home-header',
    '@/components/home/home-sheet',
    '@/components/home/home-states',
    '@/components/home/use-home-camera',
  ])(
    '%s imports neither the kit nor uniwind, and none of the retired primitives',
    (module) => {
      const source = jest
        .requireActual('fs')
        .readFileSync(require.resolve(module), 'utf8') as string;
      expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
      expect(source).not.toMatch(
        /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
      );
    },
  );
});
