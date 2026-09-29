/**
 * Globe to street in one view — T102 (FR-048, Acceptance Scenario 4.1).
 *
 * The transition itself is Mapbox's: one MapView whose globe projection
 * flattens into a street map as the camera descends (research D-06). What
 * the app must guarantee is that it never swaps that view for another on the
 * way down — no second map, no remount at a zoom threshold — and that the
 * camera is allowed the whole way, from the full sphere to the streets.
 */
import { act, render, screen } from '@testing-library/react-native';

import { Colors, GlobeCamera, GlobePitch } from '@/constants/theme';
import { toGlobeTrips } from '@/features/globe/globe-data';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { GlobeView } from '../globe-view';

jest.mock('@/hooks/use-appearance');
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: () => true }));
jest.mock('@/hooks/use-mapbox-ready', () => ({ useMapboxReady: () => 'ready' }));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

const TODAY = '2026-05-10';
const ROME = { city_id: 1, country_id: 39, lng: 12.4964, lat: 41.9028 };
const PARIS = { city_id: 4, country_id: 33, lng: 2.3522, lat: 48.8566 };

function trips() {
  return toGlobeTrips(
    [{ id: 'europe', title: 'Europe' }],
    [
      {
        id: 's1',
        trip_id: 'europe',
        arrive_date: '2025-03-01',
        depart_date: '2025-03-03',
        ...PARIS,
      },
      {
        id: 's2',
        trip_id: 'europe',
        arrive_date: '2025-03-04',
        depart_date: '2025-03-06',
        ...ROME,
      },
    ],
    TODAY,
  );
}

/** What the native side reports once the camera settles (rnmapbox 10.3.5 `MapState`). */
function settledAt(zoom: number) {
  return {
    properties: {
      center: [ROME.lng, ROME.lat],
      bounds: { ne: [ROME.lng + 1, ROME.lat + 1], sw: [ROME.lng - 1, ROME.lat - 1] },
      zoom,
      heading: 0,
      pitch: 0,
    },
    gestures: { isGestureActive: false },
  };
}

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
  } as AppearanceContext);
});

const renderGlobe = () =>
  render(
    <GlobeView trips={trips()} focus={[]} accessibilityLabel="Globe" today={TODAY} />,
  );

describe('<GlobeView> — continuous zoom (T102, FR-048)', () => {
  test('is one MapView, the same instance, from the whole globe to street level', async () => {
    await renderGlobe();
    const map = screen.getByTestId('globe-map');

    for (const zoom of [GlobeCamera.zoomLevel, 4, 8, 12, 15, GlobeCamera.maxZoomLevel]) {
      await act(async () => {
        map.props.onCameraChanged?.(settledAt(zoom));
        map.props.onMapIdle?.(settledAt(zoom));
      });

      expect(screen.getAllByTestId('globe-map')).toHaveLength(1);
      expect(screen.getByTestId('globe-map')).toBe(map);
      expect(map.props.projection).toBe('globe');
    }
  });

  test('lets the camera travel the whole range and tilt at close range', async () => {
    await renderGlobe();

    const camera = screen.getByTestId('mapbox-Camera');
    expect(camera.props.minZoomLevel).toBeLessThanOrEqual(GlobeCamera.zoomLevel);
    expect(camera.props.maxZoomLevel).toBeGreaterThanOrEqual(GlobePitch.fullZoom);

    const map = screen.getByTestId('globe-map');
    expect(map.props.pitchEnabled).toBe(true);
    expect(map.props.maxPitch).toBeGreaterThanOrEqual(GlobePitch.max);
  });
});
