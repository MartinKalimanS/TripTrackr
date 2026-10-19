/**
 * What the Home asks of `GlobeView` beyond the sheet's camera handle (feature 005, T537; FR-013,
 * FR-017; contracts C5-22 and C5-24): the first frame already fitted to the free space (no
 * animation, so the planet never visibly jumps into place), the first-placement flight that
 * keeps that fit's zoom, and the map's accessibility actions. The rest of the globe is
 * `globe-view.test.tsx`.
 */
import { render, screen } from '@testing-library/react-native';

import { GlobeCamera } from '@/constants/theme';
import type { GlobeTrip } from '@/features/globe/globe-data';
import { globeFit, globeFitCamera } from '@/features/globe/globe-fit';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { appearance } from '../../../../test/helpers/appearance';
import { cameraCenter } from '../arc-features';
import { GlobeView } from '../globe-view';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
}));
jest.mock('@/hooks/use-app-active', () => ({ useAppActive: () => true }));
jest.mock('@/hooks/use-mapbox-ready', () => ({ useMapboxReady: () => 'ready' }));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

const camera = () =>
  (jest.requireMock('@rnmapbox/maps') as { __camera: { setCamera: jest.Mock } }).__camera;

const TODAY = '2026-05-10';
const LABEL = 'Globe of your travels.';

const ITALY: GlobeTrip = {
  id: 'italy',
  title: 'Italy',
  status: 'active',
  stops: [
    {
      id: 's1',
      cityId: 1,
      countryId: 39,
      arriveDate: '2026-05-08',
      departDate: '2026-05-12',
      coordinate: [12.4964, 41.9028],
    },
  ],
};

const FIT = globeFitCamera('half', globeFit('half', 390, 150, 405, 844), {
  animated: false,
})!;
const INITIAL_FIT = { padding: FIT.padding, zoomLevel: FIT.zoomLevel };

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  camera().setCamera.mockClear();
});

function globe(extra: Partial<React.ComponentProps<typeof GlobeView>> = {}) {
  const trips = extra.trips ?? [ITALY];
  return (
    <GlobeView
      trips={trips}
      focus={trips.map((t) => t.id)}
      accessibilityLabel={LABEL}
      today={TODAY}
      {...extra}
    />
  );
}

describe('<GlobeView initialFit> - the first frame is already where the sheet wants it', () => {
  test('hands the camera its padding and zoom as its default, so nothing animates on mount', async () => {
    await render(globe({ initialFit: INITIAL_FIT }));
    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings).toEqual({
      centerCoordinate: cameraCenter([ITALY], ['italy']),
      zoomLevel: FIT.zoomLevel,
      padding: FIT.padding,
    });
    expect(camera().setCamera).not.toHaveBeenCalled();
  });

  test('without it the camera opens as it always did', async () => {
    await render(globe());
    expect(screen.getByTestId('mapbox-Camera').props.defaultSettings).toEqual({
      centerCoordinate: cameraCenter([ITALY], ['italy']),
      zoomLevel: GlobeCamera.zoomLevel,
    });
  });

  test('the flight to the first stop keeps the fitted zoom instead of the default one', async () => {
    const view = await render(globe({ trips: [], initialFit: INITIAL_FIT }));
    await view.rerender(globe({ trips: [ITALY], initialFit: INITIAL_FIT }));
    expect(camera().setCamera).toHaveBeenCalledWith({
      centerCoordinate: cameraCenter([ITALY], ['italy']),
      zoomLevel: FIT.zoomLevel,
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });
  });

  test('the flight uses the default zoom when there is no fit', async () => {
    const view = await render(globe({ trips: [] }));
    await view.rerender(globe({ trips: [ITALY] }));
    expect(camera().setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ zoomLevel: GlobeCamera.zoomLevel }),
    );
  });
});

describe('<GlobeView> accessibility actions (FR-017)', () => {
  test('forwards the actions and their handler to the map: the one element a screen reader meets', async () => {
    const actions = [{ name: 'nextTrip', label: 'Next trip' }];
    const handler = jest.fn();
    await render(
      globe({ accessibilityActions: actions, onAccessibilityAction: handler }),
    );
    const map = screen.getByTestId('globe-map');
    expect(map.props.accessibilityActions).toEqual(actions);
    expect(map.props.onAccessibilityAction).toBe(handler);
    expect(map.props.accessibilityRole).toBe('image');
    expect(map.props.accessibilityLabel).toBe(LABEL);
  });

  test('offers none unless the screen gives some', async () => {
    await render(globe());
    expect(screen.getByTestId('globe-map').props.accessibilityActions).toBeUndefined();
  });
});
