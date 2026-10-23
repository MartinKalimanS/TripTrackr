/**
 * T560 - the reading order of a trip (feature 005; FR-075, FR-076, SC-015; UI-SPEC section 6;
 * quickstart section 8): the hero's country and dates and the title (a heading), the status, the
 * five areas and the offline maps, the stops with their count, each stop one stop with the four
 * actions a reader offers on it, "Add stop", and the day strip. The mocked world is the harness
 * of `trip-screen.test.tsx`.
 *
 * The day strip is ONE pinned instance laid over the scroll view, so in the tree it follows the
 * stops although it is drawn above them; whether the platforms read it there or by position is a
 * device check (contract C5-20, "the reading order of the strip").
 */
import { render } from '@testing-library/react-native';

import TripScreen from '@/app/trip/[id]/index';

import { florence, live, resetTripScreen, rome } from '../app/trip-screen-harness';
import { accessibleNodes, expectReadingOrder, unnamed } from '../helpers/a11y-nodes';

jest.mock('expo-router', () => require('../app/trip-screen-harness').routerModule());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('../app/trip-screen-harness').reanimatedModule(),
);
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});
jest.mock('@/components/trip/city-picker', () =>
  require('../app/trip-screen-harness').cityPickerModule(),
);
jest.mock('@/features/trips/use-trips', () =>
  require('../app/trip-screen-harness').tripsModule(),
);
jest.mock('@/features/trips/trip-overview', () =>
  require('../app/trip-screen-harness').overviewModule(),
);
jest.mock('@/features/trips/use-trip-sync', () =>
  require('../app/trip-screen-harness').syncModule(),
);

beforeEach(resetTripScreen);

const AREAS = [
  'trip-open-photos',
  'trip-open-notes',
  'trip-open-expenses',
  'trip-open-documents',
  'trip-privacy-line',
  'trip-open-offline-maps',
];

describe('Trip reading order', () => {
  test('hero, status, areas, stops, add stop, then the day strip', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'trip-hero-eyebrow',
      'trip-title',
      'status-pill-planning',
      ...AREAS,
      'Stops',
      'trip-stops-count',
      'trip-stops-view-list',
      'stop-row-stop-rome',
      'stop-row-stop-florence',
      'trip-add-stop',
      'trip-day-all',
      'trip-day-1',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(nodes.find((node) => node.id === 'trip-title')).toMatchObject({
      name: 'Italy, spring 2026',
      role: 'header',
    });
  });

  test('the five areas read as buttons that name the trip they belong to', async () => {
    live.stops.data = [rome];
    await render(<TripScreen />);
    const areas = accessibleNodes().filter((node) => node.id?.startsWith('trip-open-'));
    expect(areas.map((node) => node.name)).toEqual([
      'Photos for this trip',
      'Notes for this trip',
      'Spending for this trip',
      'Travel documents for this trip',
      'Offline maps for this trip',
    ]);
    expect(areas.every((node) => node.role === 'button')).toBe(true);
  });

  test('each stop is one stop with its position, place, dates and the four actions', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const rows = accessibleNodes().filter((node) => node.id?.startsWith('stop-row-'));
    expect(rows.map((node) => node.name)).toEqual([
      expect.stringMatching(/^Stop 1: Roma, Italy./),
      expect.stringMatching(/^Stop 2: Firenze, Italy./),
    ]);
    for (const row of rows) {
      expect(row.actions).toEqual(['Move up', 'Move down', 'Edit dates', 'Remove stop']);
    }
  });

  test('the spine, the node numbers and the thumbnails are decoration, not stops', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const ids = accessibleNodes().map((node) => node.id ?? '');
    expect(
      ids.filter((id) => /^(stop-number|stop-thumb|stop-node|spine)/.test(id)),
    ).toEqual([]);
  });

  test('a trip with no stops: the words, then ONE Add stop, and no day strip', async () => {
    await render(<TripScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'trip-title',
      ...AREAS,
      'Stops',
      'No stops yet',
      'trip-add-stop',
    ]);
    expect(nodes.filter((node) => node.id === 'trip-add-stop')).toHaveLength(1);
    expect(nodes.some((node) => node.id?.startsWith('trip-day-'))).toBe(false);
  });
});
