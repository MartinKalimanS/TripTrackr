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

async function renderList(stops: StopWithPlace[]) {
  const handlers = {
    onMove: jest.fn(),
    onReorder: jest.fn(),
    onEdit: jest.fn(),
    onRemove: jest.fn(),
  };
  const result = await render(<StopList stops={stops} {...handlers} />);
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
    expect(screen.getByTestId('stop-rail-top-s1').props.className).not.toContain(
      'bg-border',
    );
    expect(screen.getByTestId('stop-rail-bottom-s1').props.className).toContain(
      'bg-border',
    );
    expect(screen.getByTestId('stop-rail-top-s2').props.className).toContain('bg-border');
    expect(screen.getByTestId('stop-rail-bottom-s2').props.className).toContain(
      'bg-border',
    );
    expect(screen.getByTestId('stop-rail-top-s3').props.className).toContain('bg-border');
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

  test('is built from the adapter layer only', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/components/trip/stop-list'), 'utf8') as string;
    expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
  });
});
