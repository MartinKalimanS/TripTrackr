/**
 * `<StopList>` - the trip's stops as a timeline that can be dragged (tasks.md T071b,
 * 004 T431; FR-012, FR-013, FR-030; research D-22).
 *
 * `react-native-sortables` is the stand-in of `jest.setup.ts`: it renders the rows in
 * data order through the real `renderItem`, wraps each handle in a `sortable-handle`
 * view, and lets a test deliver a drop (`__dropAt`). What is pinned here is what the
 * list asks of it and of its rows; that a drag really lifts a row is a device check.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { DRAG_ACTIVATION_DELAY_MS, StopList } from '@/components/trip/stop-list';
import { MinTouchTarget } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import { Motion } from '@/theme';

const hidden = { includeHiddenElements: true };

// A View that carries every prop, so a test reads what a stop's thumbnail was given.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

function stop(id: string, city: string, order: number): StopWithPlace {
  return {
    id,
    trip_id: 't1',
    city_id: 100 + order,
    sort_order: order,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    city_name: city,
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
  };
}

const rome = stop('s1', 'Roma', 0);
const florence = stop('s2', 'Firenze', 1);
const venice = stop('s3', 'Venezia', 2);

/** Before every stop of the fixtures: each is still to come, so each node shows its number. */
const BEFORE = '2026-01-01';

async function renderList(
  stops: StopWithPlace[],
  extra: Partial<React.ComponentProps<typeof StopList>> = {},
) {
  const handlers = {
    onMove: jest.fn(),
    onReorder: jest.fn(),
    onEdit: jest.fn(),
    onRemove: jest.fn(),
  };
  const result = await render(
    <StopList stops={stops} today={BEFORE} {...handlers} {...extra} />,
  );
  return { result, ...handlers };
}

describe('<StopList>', () => {
  test('is the trip-stops container, with a row per stop in the order given', async () => {
    await renderList([rome, florence, venice]);

    const rows = within(screen.getByTestId('trip-stops')).getAllByTestId(/^stop-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'stop-row-s1',
      'stop-row-s2',
      'stop-row-s3',
    ]);
  });

  test('numbers the timeline from one, and draws the rail from the first dot to the last', async () => {
    await renderList([rome, florence, venice]);

    expect(screen.getByTestId('stop-number-s1')).toHaveTextContent('1');
    expect(screen.getByTestId('stop-number-s2')).toHaveTextContent('2');
    expect(screen.getByTestId('stop-number-s3')).toHaveTextContent('3');
    // Nothing above the first dot, nothing below the last: the rail joins the stops.
    expect(screen.queryByTestId('stop-rail-top-s1', hidden)).toBeNull();
    expect(screen.getByTestId('stop-rail-bottom-s1')).toBeTruthy();
    expect(screen.getByTestId('stop-rail-top-s2', hidden)).toBeTruthy();
    expect(screen.getByTestId('stop-rail-bottom-s2')).toBeTruthy();
    expect(screen.getByTestId('stop-rail-top-s3', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-rail-bottom-s3')).toBeNull();
  });

  test('disables move up on the first row and move down on the last', async () => {
    await renderList([rome, florence, venice]);

    const disabled = (id: string) =>
      screen.getByTestId(id).props.accessibilityState.disabled;
    expect(disabled('stop-move-up-s1')).toBe(true);
    expect(disabled('stop-move-down-s1')).toBe(false);
    expect(disabled('stop-move-up-s2')).toBe(false);
    expect(disabled('stop-move-down-s2')).toBe(false);
    expect(disabled('stop-move-up-s3')).toBe(false);
    expect(disabled('stop-move-down-s3')).toBe(true);
  });

  test('routes each row control to its own stop', async () => {
    const { onMove, onEdit, onRemove } = await renderList([rome, florence]);

    await fireEvent.press(screen.getByTestId('stop-move-down-s1'));
    await fireEvent.press(screen.getByTestId('stop-move-up-s2'));
    await fireEvent.press(screen.getByTestId('stop-edit-s2'));
    await fireEvent.press(screen.getByTestId('stop-remove-s1'));

    expect(onMove).toHaveBeenNthCalledWith(1, 's1', 'down');
    expect(onMove).toHaveBeenNthCalledWith(2, 's2', 'up');
    expect(onEdit).toHaveBeenCalledWith(florence);
    expect(onRemove).toHaveBeenCalledWith(rome);
  });

  test('hands back every id in the order the stops were dropped (Acceptance Scenario 1.6)', async () => {
    const { onReorder } = await renderList([rome, florence, venice]);

    const { __dropAt } = jest.requireMock('react-native-sortables') as {
      __dropAt: (data: unknown[]) => void;
    };
    await act(async () => __dropAt([venice, rome, florence]));

    expect(onReorder).toHaveBeenCalledWith(['s3', 's1', 's2']);
  });

  test('the drag handle is only drawn when there is something to reorder', async () => {
    const one = await renderList([rome]);
    expect(screen.queryByTestId('sortable-handle')).toBeNull();
    await one.result.unmount();

    await renderList([rome, florence]);
    expect(screen.getAllByTestId('sortable-handle')).toHaveLength(2);
  });

  test('the handle keeps its name and hint, is decorative inside, and meets the touch target', async () => {
    await renderList([rome, florence]);

    const grips = screen.getAllByLabelText('Drag to reorder');
    expect(grips).toHaveLength(2);
    for (const grip of grips) {
      expect(grip.props.accessibilityHint).toBe(
        "Hold and move to change this stop's position",
      );
      const frame = StyleSheet.flatten(grip.props.style);
      expect(frame.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
      expect(frame.minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
    }
    expect(
      screen.getByTestId('stop-grip-s1-icon', { includeHiddenElements: true }).props
        .accessible,
    ).toBe(false);
  });

  test('a drag starts after a short hold, so a scroll does not lift a row', () => {
    expect(DRAG_ACTIVATION_DELAY_MS).toBe(150);
  });

  // T460 - FR-019, FR-022: the first visual response of a control is within 100 ms. The row
  // lifts only after the 150 ms hold, so the grip itself answers the finger at once; and the
  // lift and the drop settle within an in-place transition (200 ms), not the library's 300.
  describe('the grip answers the touch (T460; FR-019, FR-022)', () => {
    const FILL = 'bg-separator-secondary';
    const classesOf = (id: string) =>
      String(screen.getByTestId(`stop-grip-${id}`).props.className ?? '');
    const sortables = jest.requireMock('react-native-sortables') as {
      __dragStart: (key: string) => void;
      __activeItemDropped: (key: string) => void;
      __gridSettings: () => Record<string, unknown>;
    };

    test('shows a held fill as the finger lands, and drops it on lift or cancel', async () => {
      await renderList([rome, florence]);
      expect(classesOf('s1')).not.toContain(FILL);

      await fireEvent(screen.getByTestId('stop-grip-s1'), 'touchStart');
      expect(classesOf('s1')).toContain(FILL);
      expect(classesOf('s2')).not.toContain(FILL);

      await fireEvent(screen.getByTestId('stop-grip-s1'), 'touchEnd');
      expect(classesOf('s1')).not.toContain(FILL);

      await fireEvent(screen.getByTestId('stop-grip-s1'), 'touchStart');
      await fireEvent(screen.getByTestId('stop-grip-s1'), 'touchCancel');
      expect(classesOf('s1')).not.toContain(FILL);
    });

    test('leaves no fill behind once the row it lifted has been dropped', async () => {
      await renderList([rome, florence]);
      await fireEvent(screen.getByTestId('stop-grip-s1'), 'touchStart');

      await act(async () => sortables.__dragStart('s1'));
      expect(classesOf('s1')).not.toContain(FILL);

      await act(async () => sortables.__activeItemDropped('s1'));
      expect(classesOf('s1')).not.toContain(FILL);
    });

    test('keeps its name, hint, target and drag handle: the cue adds nothing to announce', async () => {
      await renderList([rome, florence]);
      const grip = screen.getByTestId('stop-grip-s1');
      expect(grip.props.accessibilityLabel).toBe('Drag to reorder');
      expect(StyleSheet.flatten(grip.props.style).minWidth).toBeGreaterThanOrEqual(
        MinTouchTarget,
      );
      expect(sortables.__gridSettings().customHandle).toBe(true);
    });

    test('lifts and settles a row within the in-place transition budget', async () => {
      await renderList([rome, florence]);
      expect(sortables.__gridSettings()).toMatchObject({
        activationAnimationDuration: Motion.transitionMs,
        dropAnimationDuration: Motion.transitionMs,
      });
      expect(Motion.transitionMs).toBeLessThanOrEqual(200);
    });
  });

  test('is built from the adapter layer only', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/components/trip/stop-list'), 'utf8') as string;
    expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
  });
});

// The numbers and the rail are derived from each row's index in `data`, and `data` only
// changes after the drop is written. While a row is being carried the order on screen is
// ahead of the order in `data`, so the dots would read 1, 3, 2 and the "last" row's rail
// would stay on the item that was last when the drag began. The list therefore shows
// neutral dots from the moment a row lifts (`onDragStart`) until the drop animation has
// finished (`onActiveItemDropped`), by which time the new order has been written back.
describe('<StopList> while a stop is being dragged', () => {
  const sortables = jest.requireMock('react-native-sortables') as {
    __dragStart: (key: string) => void;
    __dropAt: (data: unknown[]) => void;
    __activeItemDropped: (key: string) => void;
  };
  const ids = ['s1', 's2', 's3'];

  test('shows neutral dots, without numbers or rail, from the moment a row lifts', async () => {
    await renderList([rome, florence, venice]);
    expect(screen.getByTestId('stop-number-s1')).toBeTruthy();
    expect(screen.getByTestId('stop-rail-bottom-s1')).toBeTruthy();

    await act(async () => sortables.__dragStart('s2'));

    for (const id of ids) {
      expect(screen.getByTestId(`stop-dot-${id}`)).toBeTruthy();
      expect(screen.queryByTestId(`stop-number-${id}`)).toBeNull();
      expect(screen.queryByTestId(`stop-rail-top-${id}`)).toBeNull();
      expect(screen.queryByTestId(`stop-rail-bottom-${id}`)).toBeNull();
    }
  });

  test('keeps every row, name and control while it is carried', async () => {
    await renderList([rome, florence, venice]);

    await act(async () => sortables.__dragStart('s2'));

    for (const id of ids) {
      expect(screen.getByTestId(`stop-row-${id}`)).toBeTruthy();
      expect(screen.getByTestId(`stop-move-down-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('stop-row-s2').props.accessibilityLabel).toMatch(
      /^Stop 2: Firenze/,
    );
  });

  test('brings the numbers and the rail back when the drop animation has finished, not at the drop', async () => {
    const { onReorder } = await renderList([rome, florence, venice]);

    await act(async () => sortables.__dragStart('s2'));
    await act(async () => sortables.__dropAt([florence, rome, venice]));

    // The drop is written back at once ...
    expect(onReorder).toHaveBeenCalledWith(['s2', 's1', 's3']);
    // ... but `data` has not followed yet, so the dots are still neutral.
    expect(screen.queryByTestId('stop-number-s1')).toBeNull();

    await act(async () => sortables.__activeItemDropped('s2'));

    expect(screen.getByTestId('stop-number-s1')).toHaveTextContent('1');
    expect(screen.getByTestId('stop-number-s3')).toHaveTextContent('3');
    expect(screen.queryByTestId('stop-rail-bottom-s3')).toBeNull();
    expect(screen.getByTestId('stop-rail-bottom-s1')).toBeTruthy();
  });

  test('a second drag after the first behaves the same way', async () => {
    await renderList([rome, florence]);

    await act(async () => sortables.__dragStart('s1'));
    await act(async () => sortables.__activeItemDropped('s1'));
    expect(screen.getByTestId('stop-number-s1')).toBeTruthy();

    await act(async () => sortables.__dragStart('s2'));
    expect(screen.queryByTestId('stop-number-s1')).toBeNull();
    await act(async () => sortables.__activeItemDropped('s2'));
    expect(screen.getByTestId('stop-number-s2')).toHaveTextContent('2');
  });
});

// T545 - the journey between the stops, the stop the traveller is at, the picture of a city,
// the day that was chosen and where each row sits (for the day strip to scroll to).
describe('<StopList> the timeline (T545; FR-041)', () => {
  const at = (
    id: string,
    city: string,
    order: number,
    lat: number | null,
    lng: number | null,
    arrive: string,
    depart: string,
  ): StopWithPlace => ({
    ...stop(id, city, order),
    city_id: 7 + order,
    arrive_date: arrive,
    depart_date: depart,
    country_name: 'Portugal',
    country_iso: 'PT',
    lat,
    lng,
  });
  const lisbon = at('s1', 'Lisbon', 0, 38.7223, -9.1393, '2026-10-12', '2026-10-14');
  const sintra = at('s2', 'Sintra', 1, 38.8029, -9.3817, '2026-10-14', '2026-10-15');
  const porto = at('s3', 'Porto', 2, 41.1579, -8.6291, '2026-10-15', '2026-10-19');

  test('draws the distance beneath each stop the traveller moves on from, and none beneath the last', async () => {
    await renderList([lisbon, sintra, porto]);
    expect(
      within(screen.getByTestId('stop-transit-s1', hidden)).getByText(/^2\d km$/, hidden),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('stop-transit-s2', hidden)).getByText(
        /^27\d km$/,
        hidden,
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('stop-transit-s3', hidden)).toBeNull();
  });

  test('says each journey in the name of the stop it leads to, and the first stop has none', async () => {
    await renderList([lisbon, sintra, porto]);
    expect(screen.getByTestId('stop-row-s1').props.accessibilityValue).toBeUndefined();
    expect(screen.getByTestId('stop-row-s2').props.accessibilityValue.text).toMatch(
      /^2\d kilometres from Lisbon\.$/,
    );
    expect(screen.getByTestId('stop-row-s3').props.accessibilityValue.text).toMatch(
      /^27\d kilometres from Sintra\.$/,
    );
  });

  test('joins a stop after a journey by a dotted lead, and a stay in one place by a solid one', async () => {
    const stayed = { ...sintra, lat: lisbon.lat, lng: lisbon.lng };
    await renderList([lisbon, stayed, porto]);
    expect(screen.queryByTestId('stop-transit-s1', hidden)).toBeNull();
    expect(screen.getByTestId('stop-rail-top-s2', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-rail-top-dotted-s2', hidden)).toBeNull();
    expect(screen.getByTestId('stop-rail-top-dotted-s3', hidden)).toBeTruthy();
  });

  test('draws no journey to or from a stop this device has not placed, and does not bridge it', async () => {
    const unplaced = { ...sintra, lat: null, lng: null, city_name: null };
    await renderList([lisbon, unplaced, porto]);
    expect(screen.queryByTestId('stop-transit-s1', hidden)).toBeNull();
    expect(screen.queryByTestId('stop-transit-s2', hidden)).toBeNull();
    expect(screen.getByTestId('stop-row-s3').props.accessibilityValue).toBeUndefined();
  });

  test('marks the stop the traveller is at, ticks the ones behind it and rings the one ahead', async () => {
    await renderList([lisbon, sintra, porto], { today: '2026-10-14' });
    expect(screen.getByTestId('stop-check-s1', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-number-s1')).toBeNull();
    expect(screen.getByTestId('stop-now-s2')).toBeTruthy();
    expect(screen.getByTestId('stop-number-s2')).toHaveTextContent('2');
    expect(screen.queryByTestId('stop-now-s3')).toBeNull();
    expect(screen.getByTestId('stop-number-s3')).toHaveTextContent('3');
    expect(screen.getByTestId('stop-row-s2').props.accessibilityValue.text).toMatch(
      /^Now\./,
    );
  });

  test('hands each stop the picture of its city, when the traveller has one', async () => {
    await renderList([lisbon, sintra], {
      thumbs: new Map([[8, 'file:///thumbs/sintra.thumb.jpg']]),
    });
    expect(screen.getByTestId('stop-thumb-s2-photo', hidden).props.source).toEqual({
      uri: 'file:///thumbs/sintra.thumb.jpg',
    });
    expect(screen.getByTestId('stop-thumb-s1-generated', hidden)).toBeTruthy();
  });

  test('draws the stops of the chosen day as cream tiles and the rest flat', async () => {
    await renderList([lisbon, sintra, porto], { highlighted: new Set(['s2']) });
    expect(screen.getByTestId('stop-card-s2').props.variant).toBe('secondary');
    expect(screen.getByTestId('stop-card-s1').props.variant).toBe('transparent');
    expect(screen.getByTestId('stop-card-s3').props.variant).toBe('transparent');
  });

  test('draws no journey while a stop is carried: the order on screen is ahead of the data', async () => {
    const sortables = jest.requireMock('react-native-sortables') as {
      __dragStart: (key: string) => void;
      __activeItemDropped: (key: string) => void;
    };
    await renderList([lisbon, sintra, porto]);
    expect(screen.getByTestId('stop-transit-s1', hidden)).toBeTruthy();
    await act(async () => sortables.__dragStart('s2'));
    expect(screen.queryByTestId('stop-transit-s1', hidden)).toBeNull();
    expect(screen.queryByTestId('stop-transit-s2', hidden)).toBeNull();
    await act(async () => sortables.__activeItemDropped('s2'));
    expect(screen.getByTestId('stop-transit-s1', hidden)).toBeTruthy();
  });

  test('reports where each stop starts, from the heights its rows laid out at, in data order', async () => {
    const onOffsets = jest.fn();
    await renderList([lisbon, sintra, porto], { onOffsets });
    for (const [id, height] of [
      ['s1', 100],
      ['s2', 120],
      ['s3', 90],
    ] as const) {
      await fireEvent(screen.getByTestId(`stop-item-${id}`), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
      });
    }
    const last = onOffsets.mock.calls[onOffsets.mock.calls.length - 1]?.[0] as Map<
      string,
      number
    >;
    expect([...last.entries()]).toEqual([
      ['s1', 0],
      ['s2', 100],
      ['s3', 220],
    ]);
  });
});
