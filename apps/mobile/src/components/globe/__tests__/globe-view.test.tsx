/**
 * The globe — T093 (one MapView, globe projection), T094 (the arc source),
 * T095 (per-status layers and the animated trip), T096 (tap to open);
 * FR-045 to FR-047, research D-06 and D-30.
 *
 * Mapbox renders natively, so these suites assert on what the app HANDS it:
 * the props of each Mapbox component, stood in for by tagged views in
 * jest.setup.ts. Pixels are the Maestro flow's job (e2e/03-globe.yaml).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';

import {
  Colors,
  GlobeBasemap,
  GlobeCamera,
  GlobeColors,
  GlobeLayers,
  GlobePitch,
  GlobeStyle,
  GlobeTerrain,
  MinTouchTarget,
} from '@/constants/theme';
import {
  toGlobeTrips,
  type GlobeStopRow,
  type GlobeTrip,
} from '@/features/globe/globe-data';
import { globeFit, globeFitCamera } from '@/features/globe/globe-fit';
import type { AppearanceContext } from '@/hooks/use-appearance';

import {
  arcCollection,
  cameraCenter,
  journeyCollection,
  markerCollection,
} from '../arc-features';
import {
  BEACON_FRAME_MS,
  LEG_DURATION_MS,
  arcStyle,
  journeyCasingStyle,
} from '../arc-styles';
import { basemapConfig } from '../basemap-config';
import { GlobeView, type GlobeHandle } from '../globe-view';
import { TERRAIN_SOURCE_ID } from '../terrain-layers';

jest.mock('@/hooks/use-appearance');
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockPush = jest.fn();
const mockFocus = { focused: true, appActive: true };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => mockFocus.focused,
}));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: () => mockFocus.appActive,
}));

// Start-up itself (token, then telemetry) is pinned in test/lib/mapbox.test.ts
// and the waiting in src/hooks/use-mapbox-ready.test.ts; here it is a switch.
const mockMapbox: { state: 'starting' | 'ready' | 'unavailable' } = { state: 'ready' };

jest.mock('@/hooks/use-mapbox-ready', () => ({
  useMapboxReady: () => mockMapbox.state,
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  const theme = overrides.theme ?? 'light';
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors[theme],
    ...overrides,
  } as AppearanceContext);
}

const TODAY = '2026-05-10';
const ROME = { city_id: 1, country_id: 39, lng: 12.4964, lat: 41.9028 };
const FLORENCE = { city_id: 2, country_id: 39, lng: 11.2558, lat: 43.7696 };
const VENICE = { city_id: 3, country_id: 39, lng: 12.3155, lat: 45.4408 };
const PARIS = { city_id: 4, country_id: 33, lng: 2.3522, lat: 48.8566 };
const TOKYO = { city_id: 5, country_id: 81, lng: 139.6917, lat: 35.6895 };

let n = 0;
function stop(
  tripId: string,
  city: typeof ROME,
  arrive: string,
  depart = arrive,
): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: depart,
    ...city,
  };
}

/** An active Italian trip (animated) and a past French one (static). */
function sampleTrips(): GlobeTrip[] {
  return toGlobeTrips(
    [
      { id: 'italy', title: 'Italy' },
      { id: 'france', title: 'France' },
    ],
    [
      stop('italy', ROME, '2026-05-08', '2026-05-09'),
      stop('italy', FLORENCE, '2026-05-09', '2026-05-12'),
      stop('italy', VENICE, '2026-05-12', '2026-05-14'),
      stop('france', PARIS, '2025-03-01'),
      stop('france', ROME, '2025-03-04'),
    ],
    TODAY,
  );
}

/** `sampleTrips` plus a past Japanese trip between the two, so two trips need joining. */
function tripsWithJourney(): GlobeTrip[] {
  return toGlobeTrips(
    [
      { id: 'italy', title: 'Italy' },
      { id: 'france', title: 'France' },
      { id: 'japan', title: 'Japan' },
    ],
    [
      stop('italy', ROME, '2026-05-08', '2026-05-09'),
      stop('italy', FLORENCE, '2026-05-09', '2026-05-12'),
      stop('france', PARIS, '2025-03-01'),
      stop('france', ROME, '2025-03-04'),
      stop('japan', TOKYO, '2025-09-01'),
    ],
    TODAY,
  );
}

const LABEL = 'Globe of your travels: 2 trips.';

async function renderGlobe(trips = sampleTrips(), focus = ['italy']) {
  return render(
    <GlobeView trips={trips} focus={focus} accessibilityLabel={LABEL} today={TODAY} />,
  );
}

const beaconCoordinates = () =>
  screen
    .getByTestId('mapbox-ShapeSource-globe-beacons')
    .props.shape.features.map(
      (f: { geometry: { coordinates: number[] } }) => f.geometry.coordinates,
    );

/**
 * The beacon's own interval, told apart from React's internal timers by its
 * frame period — `jest.getTimerCount()` counts those too.
 */
function watchBeaconTimer() {
  const set = jest.spyOn(global, 'setInterval');
  const clear = jest.spyOn(global, 'clearInterval');
  return {
    started: () =>
      set.mock.calls.flatMap((call, i) =>
        call[1] === BEACON_FRAME_MS ? [set.mock.results[i]!.value] : [],
      ),
    cleared: () => clear.mock.calls.map(([id]) => id),
    restore: () => {
      set.mockRestore();
      clear.mockRestore();
    },
  };
}

beforeEach(() => {
  mockAppearance();
  mockPush.mockReset();
  mockFocus.focused = true;
  mockFocus.appActive = true;
  mockMapbox.state = 'ready';
});

afterEach(() => {
  jest.useRealTimers();
});

describe('<GlobeView> — the map (T093, FR-045)', () => {
  test('is ONE MapView with the globe projection on the Standard basemap', async () => {
    await renderGlobe();
    const maps = screen.getAllByTestId('globe-map');
    expect(maps).toHaveLength(1);
    expect(maps[0]!.props.projection).toBe('globe');
    expect(maps[0]!.props.styleURL).toBe(GlobeBasemap.styleURL);
  });

  test('keeps the Mapbox logo and attribution, as Mapbox’s terms require', async () => {
    await renderGlobe();
    const map = screen.getByTestId('globe-map');
    expect(map.props.logoEnabled).not.toBe(false);
    expect(map.props.attributionEnabled).not.toBe(false);
  });

  test.each([
    ['light', 'day'],
    ['dark', 'night'],
  ] as const)(
    'the %s theme lights the basemap for %s (FR-023)',
    async (theme, preset) => {
      mockAppearance({ theme });
      await renderGlobe();
      expect(screen.getByTestId('mapbox-StyleImport-basemap').props).toMatchObject({
        existing: true,
        config: { lightPreset: preset, theme: GlobeBasemap.theme },
      });
    },
  );

  test('opens centred on the animated trip', async () => {
    const trips = sampleTrips();
    await renderGlobe(trips);
    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings).toEqual({
      centerCoordinate: cameraCenter(trips, ['italy']),
      zoomLevel: GlobeCamera.zoomLevel,
    });
  });

  test('is announced as one summarised image, because a screen reader cannot enter a map', async () => {
    await renderGlobe();
    const map = screen.getByTestId('globe-map');
    expect(map.props.accessible).toBe(true);
    expect(map.props.accessibilityRole).toBe('image');
    expect(map.props.accessibilityLabel).toBe(LABEL);
  });

  test('mounts no map until Mapbox is configured — token set, telemetry off', async () => {
    mockMapbox.state = 'starting';
    await renderGlobe();
    expect(screen.queryByTestId('globe-map')).toBeNull();
    expect(screen.getByLabelText('Preparing the globe')).toBeTruthy();
  });

  test('without a usable Mapbox token, shows a designed error instead of a blank map', async () => {
    mockMapbox.state = 'unavailable';
    await renderGlobe();
    expect(screen.queryByTestId('globe-map')).toBeNull();
    expect(screen.getByText('The globe can’t load in this build')).toBeTruthy();
  });
});

/** What the native side reports once the camera settles (rnmapbox 10.3.5 `MapState`). */
function settledAt(zoom: number, pitch = 0) {
  return {
    properties: {
      center: [ROME.lng, ROME.lat],
      bounds: { ne: [ROME.lng + 1, ROME.lat + 1], sw: [ROME.lng - 1, ROME.lat - 1] },
      zoom,
      heading: 0,
      pitch,
    },
    gestures: { isGestureActive: false },
  };
}

const camera = () =>
  (jest.requireMock('@rnmapbox/maps') as { __camera: { setCamera: jest.Mock } }).__camera;

describe('<GlobeView> — close range (T103, T104; FR-048, FR-049)', () => {
  test('adds terrain relief from Mapbox’s elevation data, flat from afar', async () => {
    await renderGlobe();

    const dem = screen.getByTestId(`mapbox-RasterDemSource-${TERRAIN_SOURCE_ID}`);
    expect(dem.props).toMatchObject({
      url: GlobeTerrain.demURL,
      tileSize: GlobeTerrain.tileSize,
      maxZoomLevel: GlobeTerrain.maxZoomLevel,
    });
    const terrain = screen.getByTestId('mapbox-Terrain');
    expect(terrain.props.sourceID).toBe(TERRAIN_SOURCE_ID);
    expect(terrain.props.layerStyle.exaggeration).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      GlobeTerrain.startZoom,
      0,
      GlobeTerrain.fullZoom,
      GlobeTerrain.exaggeration,
    ]);
  });

  test('asks the basemap for its 3D buildings (Acceptance Scenario 4.2)', async () => {
    await renderGlobe();
    expect(screen.getByTestId('mapbox-StyleImport-basemap').props.config).toMatchObject({
      show3dObjects: true,
    });
  });

  test('tilts toward street level once the traveller stops zooming in', async () => {
    await renderGlobe();

    await act(async () => {
      screen.getByTestId('globe-map').props.onMapIdle(settledAt(GlobePitch.fullZoom));
    });

    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    expect(camera().setCamera).toHaveBeenCalledWith({
      pitch: GlobePitch.max,
      animationMode: 'easeTo',
      animationDuration: GlobePitch.durationMs,
    });
  });

  test('leaves a tilt the traveller chose by hand alone', async () => {
    await renderGlobe();

    await act(async () => {
      screen.getByTestId('globe-map').props.onMapIdle(settledAt(GlobePitch.fullZoom, 20));
    });

    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('never moves the camera by itself for a traveller who prefers less motion', async () => {
    mockAppearance({ prefersLessMotion: true });
    await renderGlobe();

    await act(async () => {
      screen.getByTestId('globe-map').props.onMapIdle(settledAt(GlobePitch.fullZoom));
    });

    expect(camera().setCamera).not.toHaveBeenCalled();
  });
});

describe('<GlobeView> — the arc source and its layers (T094, T095)', () => {
  test('draws the derived arcs and stop markers, tappable across a full touch target', async () => {
    const trips = sampleTrips();
    await renderGlobe(trips);

    const arcs = screen.getByTestId('mapbox-ShapeSource-globe-arcs');
    const markers = screen.getByTestId('mapbox-ShapeSource-globe-markers');
    expect(arcs.props.shape).toEqual(arcCollection(trips));
    expect(markers.props.shape).toEqual(markerCollection(trips));
    for (const source of [arcs, markers]) {
      expect(source.props.hitbox).toEqual({
        width: MinTouchTarget,
        height: MinTouchTarget,
      });
    }
  });

  test('stacks the journey under casing, then past, planned and active lines, so the active trip is on top', async () => {
    await renderGlobe();
    // The connections' own layers; the Sunrise style layers (graticule, keylines and the
    // gradient overlays) are stacked around them and pinned in their own describe below.
    const layers = screen
      .getAllByTestId(
        /^mapbox-LineLayer-globe-(journey|arc)-(casing|line|past|planning|active)$/,
      )
      .map((node) => node.props.id);
    expect(layers).toEqual([
      'globe-journey-casing',
      'globe-journey-line',
      'globe-arc-casing',
      'globe-arc-past',
      'globe-arc-planning',
      'globe-arc-active',
    ]);
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-arc-planning').props.filter,
    ).toEqual(['==', ['get', 'status'], 'planning']);
  });

  test('uses the globe palette of the current theme', async () => {
    mockAppearance({ theme: 'dark' });
    await renderGlobe();
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-arc-active').props.layerStyle.lineColor,
    ).toBe(GlobeColors.dark.active);
  });
});

function globeElement(trips: GlobeTrip[], focus: string[]) {
  return (
    <GlobeView trips={trips} focus={focus} accessibilityLabel={LABEL} today={TODAY} />
  );
}

describe('<GlobeView> — a globe with nothing on it, then the first stop (feature 003, FR-001, FR-004)', () => {
  test('opens on the whole sphere when nothing is placed, with nothing drawn', async () => {
    await renderGlobe([], []);

    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings).toEqual({
      centerCoordinate: GlobeCamera.fallbackCenter,
      zoomLevel: GlobeCamera.zoomLevel,
    });
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-arcs').props.shape.features,
    ).toEqual([]);
    expect(screen.queryByTestId('mapbox-ShapeSource-globe-beacons')).toBeNull();
  });

  test('flies to the first stop the moment it appears, and only then', async () => {
    const view = await renderGlobe([], []);
    expect(camera().setCamera).not.toHaveBeenCalled();

    const trips = sampleTrips();
    await view.rerender(globeElement(trips, ['italy']));
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    expect(camera().setCamera).toHaveBeenCalledWith({
      centerCoordinate: cameraCenter(trips, ['italy']),
      zoomLevel: GlobeCamera.zoomLevel,
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });

    // Later edits and syncs never pull the camera out of the traveller's hands.
    await view.rerender(globeElement(tripsWithJourney(), ['italy']));
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
  });

  test('does not move a globe that opens with something already placed', async () => {
    await renderGlobe();
    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('does not move when the last placed stop goes away', async () => {
    const view = await renderGlobe();
    await view.rerender(globeElement([], []));
    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('flies again if the globe is emptied and then given a stop again', async () => {
    const view = await renderGlobe([], []);
    await view.rerender(globeElement(sampleTrips(), ['italy']));
    await view.rerender(globeElement([], []));
    await view.rerender(globeElement(sampleTrips(), ['italy']));
    expect(camera().setCamera).toHaveBeenCalledTimes(2);
  });

  test('jumps without animation for a traveller who prefers less motion', async () => {
    mockAppearance({ prefersLessMotion: true });
    const view = await renderGlobe([], []);
    await view.rerender(globeElement(sampleTrips(), ['italy']));

    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ animationMode: 'moveTo', animationDuration: 0 }),
    );
  });
});

describe('<GlobeView> — one line through every place been to (feature 003, FR-006 to FR-011)', () => {
  test('draws the legs between trips in a source of its own', async () => {
    const trips = tripsWithJourney();
    await renderGlobe(trips);

    const journey = screen.getByTestId('mapbox-ShapeSource-globe-journey');
    expect(journey.props.shape).toEqual(journeyCollection(trips, TODAY));
    // France → Japan → Italy: the two legs no trip draws.
    expect(journey.props.shape.features).toHaveLength(2);
  });

  test('is not tappable: a leg belongs to no trip (FR-010)', async () => {
    await renderGlobe(tripsWithJourney());
    const journey = screen.getByTestId('mapbox-ShapeSource-globe-journey');
    expect(journey.props.onPress).toBeUndefined();
    expect(journey.props.hitbox).toBeUndefined();
  });

  test('reads as one line with the past connections: their style, on a casing (FR-011)', async () => {
    await renderGlobe(tripsWithJourney());
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-journey-line').props.layerStyle,
    ).toEqual(arcStyle('past', GlobeColors.light));
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-journey-casing').props.layerStyle,
    ).toEqual(journeyCasingStyle(GlobeColors.light));
  });

  test('follows the theme like every other connection', async () => {
    mockAppearance({ theme: 'dark' });
    await renderGlobe(tripsWithJourney());
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-journey-line').props.layerStyle
        .lineColor,
    ).toBe(GlobeColors.dark.past);
  });

  test('is an empty collection, not an absent source, when nothing needs joining', async () => {
    await renderGlobe(sampleTrips());
    expect(
      screen.getByTestId('mapbox-ShapeSource-globe-journey').props.shape.features,
    ).toEqual([]);
  });
});

describe('<GlobeView> — tapping opens the trip (T096, FR-047)', () => {
  test('a tap on an arc opens that trip', async () => {
    await renderGlobe();
    await fireEvent(screen.getByTestId('mapbox-ShapeSource-globe-arcs'), 'press', {
      features: [{ type: 'Feature', properties: { trip_id: 'france', status: 'past' } }],
    });
    expect(mockPush).toHaveBeenCalledWith('/trip/france');
  });

  test('a tap on a stop marker opens that trip too — a single-stop trip has nothing else', async () => {
    await renderGlobe();
    await fireEvent(screen.getByTestId('mapbox-ShapeSource-globe-markers'), 'press', {
      features: [{ type: 'Feature', properties: { trip_id: 'italy', status: 'active' } }],
    });
    expect(mockPush).toHaveBeenCalledWith('/trip/italy');
  });
});

describe('<GlobeView> — the animated trip (T095, FR-046)', () => {
  test('its beacon travels along the route while the globe is on screen', async () => {
    jest.useFakeTimers();
    await renderGlobe();
    const start = beaconCoordinates();
    expect(start).toEqual([[12.4964, 41.9028]]);

    await act(async () => {
      jest.advanceTimersByTime(LEG_DURATION_MS / 2);
    });
    expect(beaconCoordinates()).not.toEqual(start);
  });

  test('stops its timer when the globe unmounts', async () => {
    jest.useFakeTimers();
    const timer = watchBeaconTimer();
    const view = await renderGlobe();
    const [id] = timer.started();
    expect(timer.started()).toHaveLength(1);

    await view.unmount();
    expect(timer.cleared()).toContain(id);
    timer.restore();
  });

  test('under reduced motion, rests at today’s stop and never starts a timer', async () => {
    jest.useFakeTimers();
    const timer = watchBeaconTimer();
    mockAppearance({ prefersLessMotion: true });
    await renderGlobe();

    expect(beaconCoordinates()).toEqual([[11.2558, 43.7696]]);
    await act(async () => {
      jest.advanceTimersByTime(LEG_DURATION_MS);
    });
    expect(beaconCoordinates()).toEqual([[11.2558, 43.7696]]);
    expect(timer.started()).toEqual([]);
    timer.restore();
  });

  test.each([
    ['another tab is showing', { focused: false, appActive: true }],
    ['the app is in the background', { focused: true, appActive: false }],
  ])('pauses while %s', async (_case, state) => {
    jest.useFakeTimers();
    const timer = watchBeaconTimer();
    Object.assign(mockFocus, state);
    await renderGlobe();
    expect(timer.started()).toEqual([]);
    timer.restore();
  });

  test('with nothing to animate, no beacon is drawn at all', async () => {
    await renderGlobe(sampleTrips(), []);
    expect(screen.queryByTestId('mapbox-ShapeSource-globe-beacons')).toBeNull();
  });
});

/** The same stop with the ISO code of its country, as the stops query now returns it. */
const inCountry = (row: GlobeStopRow, iso: string): GlobeStopRow => ({
  ...row,
  country_iso: iso,
});

/** Visited France and Italy, a planned Japan: what the country layers should tint. */
function tripsWithCountries(): GlobeTrip[] {
  return toGlobeTrips(
    [
      { id: 'italy', title: 'Italy' },
      { id: 'france', title: 'France' },
      { id: 'japan', title: 'Japan' },
    ],
    [
      inCountry(stop('italy', ROME, '2026-05-08', '2026-05-09'), 'IT'),
      inCountry(stop('italy', VENICE, '2026-05-12', '2026-05-14'), 'IT'),
      inCountry(stop('france', PARIS, '2025-03-01'), 'FR'),
      inCountry(stop('japan', TOKYO, '2027-01-10'), 'JP'),
    ],
    TODAY,
  );
}

describe('<GlobeView> — the Sunrise look (T532; FR-010, FR-082)', () => {
  test.each(['light', 'dark'] as const)(
    'configures the basemap with the %s tokens, from basemap-config.ts, at world scale',
    async (theme) => {
      mockAppearance({ theme });
      await renderGlobe();
      expect(screen.getByTestId('mapbox-StyleImport-basemap').props.config).toBe(
        basemapConfig(theme, true),
      );
    },
  );

  test('switches the street labels on once the traveller is in, and off again on the way out', async () => {
    await renderGlobe();
    const config = () => screen.getByTestId('mapbox-StyleImport-basemap').props.config;
    expect(config().showRoadLabels).toBe(false);

    await act(async () => {
      screen
        .getByTestId('globe-map')
        .props.onMapIdle(settledAt(GlobeLayers.worldScaleZoom + 1));
    });
    expect(config()).toBe(basemapConfig('light', false));
    expect(config().showRoadLabels).toBe(true);

    await act(async () => {
      screen.getByTestId('globe-map').props.onMapIdle(settledAt(GlobeCamera.zoomLevel));
    });
    expect(config()).toBe(basemapConfig('light', true));
  });

  test('re-applies the tilt as before while it watches the zoom: both read the same idle event', async () => {
    await renderGlobe();
    await act(async () => {
      screen.getByTestId('globe-map').props.onMapIdle(settledAt(GlobePitch.fullZoom));
    });
    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: GlobePitch.max }),
    );
    expect(
      screen.getByTestId('mapbox-StyleImport-basemap').props.config.showRoadLabels,
    ).toBe(true);
  });

  test.each(['light', 'dark'] as const)('mounts the %s atmosphere', async (theme) => {
    mockAppearance({ theme });
    await renderGlobe();
    expect(screen.getByTestId('mapbox-Atmosphere').props.layerStyle).toMatchObject({
      spaceColor: GlobeStyle[theme].atmosphere.spaceColor,
    });
  });

  test('draws the graticule', async () => {
    await renderGlobe();
    expect(screen.getByTestId('mapbox-ShapeSource-globe-graticule')).toBeTruthy();
  });

  test('tints the countries of the stops: visited by now, planned still to come', async () => {
    await renderGlobe(tripsWithCountries());
    const filter = (id: string) =>
      screen.getByTestId(`mapbox-FillLayer-${id}`).props.filter as unknown[];
    expect(filter('globe-visited-fill')).toContainEqual([
      'in',
      ['get', 'iso_3166_1'],
      ['literal', ['FR', 'IT']],
    ]);
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-planned-keyline').props.filter,
    ).toContainEqual(['in', ['get', 'iso_3166_1'], ['literal', ['JP']]]);
  });

  test('loads no country tiles when no stop has a country on this device', async () => {
    await renderGlobe();
    expect(screen.queryByTestId('mapbox-VectorSource-globe-countries')).toBeNull();
  });

  test('follows the theme: the keyline is the dark token at night', async () => {
    mockAppearance({ theme: 'dark' });
    await renderGlobe(tripsWithCountries());
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-visited-keyline').props.layerStyle
        .lineColor,
    ).toBe(GlobeColors.dark.visitedKeyline);
  });

  test('draws the gradients above their solid layers, in one stack with the connections', async () => {
    await renderGlobe(tripsWithCountries());
    const source = screen.getByTestId('mapbox-ShapeSource-globe-arc-gradients');
    expect(source.props.lineMetrics).toBe(true);
    for (const id of ['journey', 'arc-past', 'arc-active']) {
      expect(
        screen.getByTestId(`mapbox-LineLayer-globe-${id}-gradient`).props.aboveLayerID,
      ).toBe(id === 'journey' ? 'globe-journey-line' : `globe-${id}`);
    }
  });

  test('keeps the shared hit source as it was: casing, past, planned and active, with the press', async () => {
    await renderGlobe();
    const arcs = screen.getByTestId('mapbox-ShapeSource-globe-arcs');
    expect(arcs.props.lineMetrics).toBeUndefined();
    expect(arcs.props.onPress).toEqual(expect.any(Function));
    expect(
      screen.getByTestId('mapbox-LineLayer-globe-arc-planning').props.layerStyle,
    ).toHaveProperty('lineDasharray');
  });

  test('stacks atmosphere, graticule, countries, terrain, connections, gradients, beacons in that order', async () => {
    await renderGlobe(tripsWithCountries());
    const order = [
      'mapbox-Atmosphere',
      'mapbox-ShapeSource-globe-graticule',
      'mapbox-VectorSource-globe-countries',
      `mapbox-RasterDemSource-${TERRAIN_SOURCE_ID}`,
      'mapbox-ShapeSource-globe-journey',
      'mapbox-ShapeSource-globe-arcs',
      'mapbox-ShapeSource-globe-markers',
      'mapbox-ShapeSource-globe-arc-gradients',
      'mapbox-ShapeSource-globe-beacons',
    ];
    const seen = screen
      .getAllByTestId(/^mapbox-/)
      .map((node) => node.props.testID as string)
      .filter((id) => order.includes(id));
    expect(seen).toEqual(order);
  });

  test('leaves the Mapbox logo and attribution where the sheet puts them, and never hides them', async () => {
    const offsets = { bottom: 220, left: 8 };
    await render(
      <GlobeView
        trips={sampleTrips()}
        focus={['italy']}
        accessibilityLabel={LABEL}
        today={TODAY}
        logoPosition={offsets}
        attributionPosition={{ bottom: 220, right: 8 }}
      />,
    );
    const map = screen.getByTestId('globe-map');
    expect(map.props.logoPosition).toEqual(offsets);
    expect(map.props.attributionPosition).toEqual({ bottom: 220, right: 8 });
    expect(map.props.logoEnabled).not.toBe(false);
    expect(map.props.attributionEnabled).not.toBe(false);
  });

  test('hands the sheet the camera: setCamera through the ref, once per settle', async () => {
    const ref = createRef<GlobeHandle>();
    await render(
      <GlobeView
        ref={ref}
        trips={sampleTrips()}
        focus={['italy']}
        accessibilityLabel={LABEL}
        today={TODAY}
      />,
    );
    const fit = globeFit('half', 390, 110, 405, 844);
    const settings = globeFitCamera('half', fit);
    ref.current?.setCamera(settings!);
    expect(camera().setCamera).toHaveBeenCalledTimes(1);
    expect(camera().setCamera).toHaveBeenCalledWith(settings);
  });
});
