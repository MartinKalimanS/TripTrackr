/**
 * Tapping a connection opens its trip — FR-047, spec Edge Cases (Globe).
 *
 * Mapbox hands the source's `onPress` every rendered feature inside the hit
 * box, so the handler must choose: where trips overlap, the active one opens
 * first, then a planned one, then a past one; anything without a trip id is
 * not a trip and is ignored.
 */
import { renderHook } from '@testing-library/react-native';

import { tripIdFromPress, useArcPress } from '../use-arc-press';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const feature = (properties: Record<string, unknown> | null) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [0, 0] },
  properties,
});

describe('tripIdFromPress', () => {
  test('an active trip wins over a planned one, and a planned one over a past one', () => {
    expect(
      tripIdFromPress([
        feature({ trip_id: 'past', status: 'past' }),
        feature({ trip_id: 'planned', status: 'planning' }),
        feature({ trip_id: 'now', status: 'active' }),
      ]),
    ).toBe('now');
    expect(
      tripIdFromPress([
        feature({ trip_id: 'past', status: 'past' }),
        feature({ trip_id: 'planned', status: 'planning' }),
      ]),
    ).toBe('planned');
  });

  test('among equals, the first feature Mapbox reports — the one drawn on top', () => {
    expect(
      tripIdFromPress([
        feature({ trip_id: 'first', status: 'past' }),
        feature({ trip_id: 'second', status: 'past' }),
      ]),
    ).toBe('first');
  });

  test('features without a trip id are ignored', () => {
    expect(
      tripIdFromPress([
        feature(null),
        feature({ name: 'basemap label' }),
        feature({ trip_id: 7 }),
      ]),
    ).toBeNull();
    expect(tripIdFromPress([])).toBeNull();
  });
});

describe('useArcPress', () => {
  beforeEach(() => mockPush.mockReset());

  test('opens the chosen trip', async () => {
    const { result } = await renderHook(() => useArcPress());
    result.current({ features: [feature({ trip_id: 'trip-42', status: 'active' })] });
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42');
  });

  test('does nothing when the tap found no trip', async () => {
    const { result } = await renderHook(() => useArcPress());
    result.current({ features: [feature({ name: 'water' })] });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
