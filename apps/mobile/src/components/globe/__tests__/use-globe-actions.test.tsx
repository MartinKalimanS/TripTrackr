/**
 * `useGlobeActions` - the globe without dragging or sight (feature 005, T537; FR-017; contract
 * C5-24): the map's accessibility actions "next trip", "previous trip", "recentre" and "open
 * countries". Stepping flies the camera to the trip and says its name; recentre and open
 * countries are the Home's, handed in; every step counts as the traveller moving the globe (the
 * idle spin stops). Reduced motion jumps instead of flying.
 */
import { renderHook } from '@testing-library/react-native';
import { AccessibilityInfo, type AccessibilityActionEvent } from 'react-native';

import { GlobeCamera } from '@/constants/theme';
import type { GlobeTrip } from '@/features/globe/globe-data';

import { GLOBE_ACTIONS, useGlobeActions } from '../use-globe-actions';

const TODAY = '2026-05-10';

function trip(id: string, arrive: string, coordinate: [number, number]): GlobeTrip {
  return {
    id,
    title: `Trip ${id}`,
    status: 'past',
    stops: [
      {
        id: `${id}-s`,
        cityId: 1,
        countryId: 1,
        arriveDate: arrive,
        departDate: arrive,
        coordinate,
      },
    ],
  };
}

const TRIPS = [
  trip('a', '2024-01-01', [2.35, 48.85]),
  trip('b', '2025-01-01', [139.69, 35.69]),
  trip('c', '2026-01-01', [12.5, 41.9]),
];

const action = (actionName: string) =>
  ({ nativeEvent: { actionName } }) as AccessibilityActionEvent;

async function setup(overrides: Partial<Parameters<typeof useGlobeActions>[0]> = {}) {
  const setCamera = jest.fn();
  const handlers = {
    onRecentre: jest.fn(),
    onOpenCountries: jest.fn(),
    onMoved: jest.fn(),
  };
  const hook = await renderHook(() =>
    useGlobeActions({
      trips: TRIPS,
      focus: ['c'],
      today: TODAY,
      handle: { current: { setCamera } },
      animated: true,
      ...handlers,
      ...overrides,
    }),
  );
  return { setCamera, handlers, hook };
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useGlobeActions: the four actions of FR-017', () => {
  test('offers next trip, previous trip, recentre and open countries, in words', async () => {
    const { hook } = await setup();
    expect(hook.result.current.accessibilityActions).toEqual([
      { name: 'nextTrip', label: 'Next trip' },
      { name: 'previousTrip', label: 'Previous trip' },
      { name: 'recentre', label: 'Recentre the globe' },
      { name: 'openCountries', label: 'Open countries' },
    ]);
    expect(GLOBE_ACTIONS).toHaveLength(4);
  });

  test('next trip flies to the trip after the one in focus (wrapping) and says its name', async () => {
    const { hook, setCamera, handlers } = await setup();
    hook.result.current.onAccessibilityAction(action('nextTrip'));
    expect(setCamera).toHaveBeenCalledWith({
      centerCoordinate: [2.35, 48.85],
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Trip a');
    expect(handlers.onMoved).toHaveBeenCalledTimes(1);
  });

  test('keeps stepping from the trip it reached', async () => {
    const { hook, setCamera } = await setup();
    hook.result.current.onAccessibilityAction(action('nextTrip'));
    hook.result.current.onAccessibilityAction(action('nextTrip'));
    expect(setCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerCoordinate: [139.69, 35.69] }),
    );
    hook.result.current.onAccessibilityAction(action('previousTrip'));
    expect(setCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerCoordinate: [2.35, 48.85] }),
    );
  });

  test('previous trip from the focus goes back in time', async () => {
    const { hook, setCamera } = await setup();
    hook.result.current.onAccessibilityAction(action('previousTrip'));
    expect(setCamera).toHaveBeenCalledWith(
      expect.objectContaining({ centerCoordinate: [139.69, 35.69] }),
    );
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Trip b');
  });

  test('jumps instead of flying under reduced motion', async () => {
    const { hook, setCamera } = await setup({ animated: false });
    hook.result.current.onAccessibilityAction(action('nextTrip'));
    expect(setCamera).toHaveBeenCalledWith({
      centerCoordinate: [2.35, 48.85],
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  });

  test('with no trip on the map there is nothing to fly to, and nothing is moved or said', async () => {
    const { hook, setCamera, handlers } = await setup({ trips: [], focus: [] });
    hook.result.current.onAccessibilityAction(action('nextTrip'));
    expect(setCamera).not.toHaveBeenCalled();
    expect(handlers.onMoved).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  test('recentre is the Home\u2019s, and is announced', async () => {
    const { hook, handlers, setCamera } = await setup();
    hook.result.current.onAccessibilityAction(action('recentre'));
    expect(handlers.onRecentre).toHaveBeenCalledTimes(1);
    expect(setCamera).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Globe recentred',
    );
  });

  test('open countries is the Home\u2019s', async () => {
    const { hook, handlers } = await setup();
    hook.result.current.onAccessibilityAction(action('openCountries'));
    expect(handlers.onOpenCountries).toHaveBeenCalledTimes(1);
  });

  test('ignores an action it does not offer', async () => {
    const { hook, setCamera, handlers } = await setup();
    hook.result.current.onAccessibilityAction(action('activate'));
    expect(setCamera).not.toHaveBeenCalled();
    expect(handlers.onRecentre).not.toHaveBeenCalled();
    expect(handlers.onOpenCountries).not.toHaveBeenCalled();
  });

  test('does not throw when the map has no camera yet', async () => {
    const { hook } = await setup({ handle: { current: null } });
    expect(() =>
      hook.result.current.onAccessibilityAction(action('nextTrip')),
    ).not.toThrow();
  });
});
