/**
 * Feature 005, F5 "Trip screen", objective 2 (UI-SPEC section 6, `screens/core/trip*.png`,
 * `prototype/styles.css` `.timeline`, `.stop`, `.transit`, `.add-stop`, `.empty`): what the
 * stops of a trip look like against the pictures. The structure, ids and names of the rows are
 * `stop-row.test.tsx`, `stop-list.test.tsx` and `trip-screen-timeline.test.tsx`; this file pins
 * the measurements and the pictured controls that have no capability behind them (Q-11).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AddStopRow } from '@/components/trip/add-stop-row';
import { StopRow, type StopRowProps } from '@/components/trip/stop-row';
import { StopsHeader, ZeroStops } from '@/components/trip/trip-states';
import type { StopWithPlace } from '@/db/repositories/stops';

import { glyphNamesIn } from '../helpers/icons';

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};

const hidden = { includeHiddenElements: true };

const stop: StopWithPlace = {
  id: 's2',
  trip_id: 't1',
  city_id: 7,
  sort_order: 1,
  arrive_date: '2026-10-14',
  depart_date: '2026-10-15',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  city_name: 'Sintra',
  country_id: 1,
  country_name: 'Portugal',
  country_iso: 'PT',
  lat: 38.8,
  lng: -9.38,
};

function row(props: Partial<StopRowProps> = {}) {
  return (
    <StopRow
      stop={stop}
      position={2}
      isFirst={false}
      isLast={false}
      state="next"
      onMoveUp={jest.fn()}
      onMoveDown={jest.fn()}
      onEdit={jest.fn()}
      onRemove={jest.fn()}
      {...props}
    />
  );
}

const flat = (id: string) =>
  (StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) ?? {}) as Record<
    string,
    unknown
  >;
const classes = (id: string) => String(screen.getByTestId(id, hidden).props.className);

beforeEach(() => mockToast.show.mockClear());
afterEach(() => jest.restoreAllMocks());

describe('"Stops N" and the pictured List / Map toggle (trip.png)', () => {
  test('says "Stops" as a header with the count beside it, in the muted ink', async () => {
    await render(<StopsHeader count={3} />);
    expect(screen.getByText('Stops').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('trip-stops-count')).toHaveTextContent('3');
    expect(classes('trip-stops-count')).toContain('text-muted');
  });

  test('draws the toggle as pictured: List selected, Map beside it, one group named', async () => {
    await render(<StopsHeader count={0} />);
    const group = screen.getByTestId('trip-stops-view');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Stops view');
    expect(screen.getByText('List')).toBeTruthy();
    expect(screen.getByText('Map')).toBeTruthy();
    expect(
      screen.getByTestId('trip-stops-view-list').props.accessibilityState,
    ).toMatchObject({ selected: true, checked: true });
    expect(
      screen.getByTestId('coming-soon-trip-map').props.accessibilityState,
    ).toMatchObject({ selected: false, checked: false });
  });

  test('is 136 dp wide at least, as the prototype draws it', async () => {
    await render(<StopsHeader count={3} />);
    expect(flat('trip-stops-view-box').minWidth).toBe(136);
  });

  test('Map is a coming-soon control: named, hinted, and its only effect is one toast', async () => {
    await render(<StopsHeader count={3} />);
    const map = screen.getByTestId('coming-soon-trip-map');
    expect(map.props.accessibilityLabel).toBe('Map');
    expect(map.props.accessibilityHint).toBe('Not available yet');
    await fireEvent.press(map);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coming-soon' }),
    );
    expect(
      screen.getByTestId('trip-stops-view-list').props.accessibilityState,
    ).toMatchObject({ selected: true });
  });

  test('pressing List again does nothing at all', async () => {
    await render(<StopsHeader count={3} />);
    await fireEvent.press(screen.getByTestId('trip-stops-view-list'));
    expect(mockToast.show).not.toHaveBeenCalled();
  });

  test('wraps under the heading at large text instead of clipping', async () => {
    await render(<StopsHeader count={3} />);
    expect(classes('trip-stops-head')).toContain('flex-wrap');
  });
});

describe('a trip with no stops (trip-zero.png)', () => {
  test('a ghost stamp with the plane in it, the words, and the one primary', async () => {
    const onAdd = jest.fn();
    await render(<ZeroStops onAdd={onAdd} />);
    expect(screen.getByTestId('ghost-stamp', hidden)).toBeTruthy();
    expect(glyphNamesIn(screen.getByTestId('trip-empty-plane', hidden))).toEqual([
      'plane',
    ]);
    expect(screen.getByText('No stops yet')).toBeTruthy();
    const add = screen.getByTestId('trip-add-stop');
    expect(add.props.accessibilityLabel).toBe('Add stop');
    await fireEvent.press(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  test('the plane is the prototype 2x glyph in a 96 dp stamp (1.6 of a 24 dp icon), and hidden', async () => {
    await render(<ZeroStops onAdd={jest.fn()} />);
    const plane = screen.getByTestId('trip-empty-plane', hidden);
    expect(plane.props.accessibilityElementsHidden).toBe(true);
    expect(flat('trip-empty-plane').transform).toEqual([{ scale: 1.6 }]);
  });

  test('the detail is a muted label no wider than 280 dp, 8 dp under the title', async () => {
    await render(<ZeroStops onAdd={jest.fn()} />);
    const detail = screen.getByTestId('trip-empty-detail');
    expect(String(detail.props.className)).toEqual(
      expect.stringContaining('text-[14px]'),
    );
    expect(String(detail.props.className)).toContain('text-muted');
    expect(String(detail.props.className)).toContain('max-w-[280px]');
    expect(classes('trip-empty')).toContain('gap-2');
  });
});

describe('the stop row, as .stop in the prototype', () => {
  test('text and thumbnail sit on the 20 dp margin: no inset from the card', async () => {
    await render(row());
    expect(classes('stop-card-s2')).toContain('-m-2');
    expect(classes('stop-card-s2')).toContain('p-2');
    expect(classes('stop-card-s2')).not.toContain('p-3');
  });

  test('the dates and nights are label lines in the muted ink, on one wrapping line', async () => {
    await render(row());
    for (const id of ['stop-dates-s2', 'stop-nights-s2']) {
      expect(classes(id)).toContain('text-[14px]');
      expect(classes(id)).toContain('text-muted');
    }
    expect(classes('stop-meta-s2')).toContain('flex-row');
    expect(classes('stop-meta-s2')).toContain('flex-wrap');
    expect(screen.getByTestId('stop-dates-s2')).toHaveTextContent(/\d.*→.*\d/);
  });

  test('a stay with unknown nights has just the dates', async () => {
    await render(
      row({ stop: { ...stop, arrive_date: '2026-10-16', depart_date: '2026-10-15' } }),
    );
    expect(screen.queryByTestId('stop-nights-s2')).toBeNull();
    expect(screen.getByTestId('stop-dates-s2')).toBeTruthy();
  });

  test('the node figure is the 13 dp caption, capped, in tabular figures', async () => {
    await render(row({ state: 'now' }));
    expect(classes('stop-number-s2')).toContain('text-[13px]');
    expect(screen.getByTestId('stop-number-s2').props.maxFontSizeMultiplier).toBe(1.3);
  });

  test('the distance between stops is the 13/18 caption in the muted ink: never a drive time', async () => {
    await render(row({ transit: { km: 313 } }));
    expect(classes('stop-transit-distance-s2')).toContain('text-[13px]');
    expect(classes('stop-transit-distance-s2')).toContain('text-muted');
    expect(screen.getByTestId('stop-transit-distance-s2', hidden)).toHaveTextContent(
      /^313 km$/,
    );
    expect(screen.queryByText(/min\b/, hidden)).toBeNull();
    expect(glyphNamesIn(screen.getByTestId('stop-transit-s2', hidden))).toEqual([
      'route',
    ]);
  });

  test('keeps the picture, the place at callout and the thumbnail at 56 dp', async () => {
    await render(row());
    expect(flat('stop-thumb-s2')).toMatchObject({ width: 56, height: 56 });
    expect(classes('stop-place-s2')).toContain('text-[17px]');
  });
});

describe('the dashed "Add stop" row (.add-stop)', () => {
  test('is 4 dp below the list, 52 dp at least, with the 2 dp dashed border outline', async () => {
    await render(<AddStopRow onPress={jest.fn()} />);
    expect(flat('trip-add-stop')).toMatchObject({
      marginTop: 4,
      minHeight: 52,
      borderWidth: 2,
      borderStyle: 'dashed',
    });
  });
});
