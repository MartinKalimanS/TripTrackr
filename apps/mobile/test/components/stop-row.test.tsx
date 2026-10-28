/**
 * T545 - `StopRow` with the spine (contract C5-20; spec FR-041, FR-070, FR-075, FR-076, FR-074):
 * one stop on the trip's timeline. A node on a rail (a check for a stop done, coral for the one
 * the traveller is at, a ring for those to come), a solid line under it and a dotted segment
 * with the distance where the traveller moves on, the place, the country with its flag, the
 * dates and the nights, a "Now" chip, a picture of the city and the pending marker. Every id,
 * name, control and accessibility action of the 004 row is kept.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { StyleSheet } from 'react-native';

import { StopRow, type StopRowProps } from '@/components/trip/stop-row';
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

const hidden = { includeHiddenElements: true };

const sintraStop: StopWithPlace = {
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

function handlers() {
  return {
    onMoveUp: jest.fn(),
    onMoveDown: jest.fn(),
    onEdit: jest.fn(),
    onRemove: jest.fn(),
  };
}

function row(props: Partial<StopRowProps> = {}) {
  return (
    <StopRow
      stop={sintraStop}
      position={2}
      isFirst={false}
      isLast={false}
      state="next"
      {...handlers()}
      {...props}
    />
  );
}

const flat = (id: string) =>
  (StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) ?? {}) as Record<
    string,
    unknown
  >;

afterEach(() => jest.restoreAllMocks());

describe('<StopRow> keeps the 004 row: ids, name, controls and actions', () => {
  test('is ONE element named "Stop N: place, country. dates", with the four actions', async () => {
    await render(row());
    const node = screen.getByTestId('stop-row-s2');
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityLabel).toMatch(
      // The month's spelling is the device's (`formatIsoDate`); the shape is the row's.
      /^Stop 2: Sintra, Portugal\. (?:14 \S+|\S+ 14,?) 2026 → (?:15 \S+|\S+ 15,?) 2026$/,
    );
    expect(node.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'moveUp',
      'moveDown',
      'edit',
      'delete',
    ]);
  });

  test('keeps every id of a control, and the words of its name', async () => {
    await render(row());
    for (const [id, name] of [
      ['stop-move-up-s2', 'Move Sintra up'],
      ['stop-move-down-s2', 'Move Sintra down'],
      ['stop-edit-s2', 'Edit dates for Sintra'],
      ['stop-remove-s2', 'Remove Sintra'],
    ]) {
      const control = screen.getByTestId(id as string);
      expect(control.props.accessibilityLabel).toBe(name);
      expect(control.props.accessibilityRole).toBe('button');
    }
    expect(screen.getByTestId('stop-dates-s2')).toHaveTextContent(
      /^(?:14 \S+|\S+ 14,?) 2026 → (?:15 \S+|\S+ 15,?) 2026$/,
    );
  });

  test('each control and each accessibility action reaches its own handler', async () => {
    const h = handlers();
    await render(row(h));
    await fireEvent.press(screen.getByTestId('stop-move-up-s2'));
    await fireEvent.press(screen.getByTestId('stop-move-down-s2'));
    await fireEvent.press(screen.getByTestId('stop-edit-s2'));
    await fireEvent.press(screen.getByTestId('stop-remove-s2'));
    expect(h.onMoveUp).toHaveBeenCalledTimes(1);
    expect(h.onMoveDown).toHaveBeenCalledTimes(1);
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onRemove).toHaveBeenCalledTimes(1);

    const node = screen.getByTestId('stop-row-s2');
    for (const actionName of ['moveUp', 'moveDown', 'edit', 'delete']) {
      await fireEvent(node, 'accessibilityAction', { nativeEvent: { actionName } });
    }
    expect(h.onMoveUp).toHaveBeenCalledTimes(2);
    expect(h.onMoveDown).toHaveBeenCalledTimes(2);
    expect(h.onEdit).toHaveBeenCalledTimes(2);
    expect(h.onRemove).toHaveBeenCalledTimes(2);
  });

  test('a move past either end is disabled on the button and dropped as an action', async () => {
    const h = handlers();
    await render(row({ ...h, isFirst: true, isLast: true }));
    expect(screen.getByTestId('stop-move-up-s2').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(
      screen.getByTestId('stop-move-down-s2').props.accessibilityState.disabled,
    ).toBe(true);
    const node = screen.getByTestId('stop-row-s2');
    await fireEvent(node, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    await fireEvent(node, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveDown' },
    });
    expect(h.onMoveUp).not.toHaveBeenCalled();
    expect(h.onMoveDown).not.toHaveBeenCalled();
  });

  test('draws the drag handle it is given beside the place', async () => {
    const { Text } = jest.requireActual('react-native') as typeof import('react-native');
    await render(row({ handle: <Text testID="grip">grip</Text> }));
    expect(screen.getByTestId('grip')).toBeTruthy();
  });
});

describe('<StopRow> the node (never colour alone: a check, a number, a ring)', () => {
  test('a stop done is a check, with no number', async () => {
    await render(row({ state: 'done' }));
    expect(screen.getByTestId('stop-dot-s2')).toBeTruthy();
    expect(screen.queryByTestId('stop-number-s2')).toBeNull();
    expect(glyphNamesIn(screen.getByTestId('stop-dot-s2'))).toEqual(['check']);
  });

  test('the stop the traveller is at is its number on the coral fill, ringed by a halo', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((t) => `colour:${t}`)
          : `colour:${token}`) as never);
    await render(row({ state: 'now' }));
    expect(screen.getByTestId('stop-number-s2')).toHaveTextContent('2');
    const dot = flat('stop-dot-s2');
    expect(dot.backgroundColor).toBe('colour:accent');
    expect(dot.outlineColor).toBe('colour:accent-tint');
    expect(dot.outlineWidth).toBe(4);
    expect(String(screen.getByTestId('stop-number-s2').props.className)).toContain(
      'text-accent-foreground',
    );
  });

  test('a stop to come is its number inside a ring', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((t) => `colour:${t}`)
          : `colour:${token}`) as never);
    await render(row({ state: 'next' }));
    expect(screen.getByTestId('stop-number-s2')).toHaveTextContent('2');
    const dot = flat('stop-dot-s2');
    expect(dot.borderWidth).toBe(2);
    expect(dot.borderColor).toBe('colour:foreground');
  });

  test('is 28 dp, in a 32 dp rail', async () => {
    await render(row({ state: 'next' }));
    expect(flat('stop-dot-s2')).toMatchObject({ width: 28, height: 28 });
    expect(flat('stop-rail-s2').width).toBe(32);
  });
});

describe('<StopRow> the spine', () => {
  test('a solid line runs from the node to the next stop, and none under the last', async () => {
    await render(row());
    expect(screen.getByTestId('stop-rail-bottom-s2')).toBeTruthy();
    expect(flat('stop-rail-bottom-s2').width).toBe(3);
    await screen.rerender(row({ isLast: true }));
    expect(screen.queryByTestId('stop-rail-bottom-s2')).toBeNull();
  });

  test('is the ink while the stop is done or to come, and the coral line while the traveller is at it', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((t) => `colour:${t}`)
          : `colour:${token}`) as never);
    await render(row({ state: 'done' }));
    expect(flat('stop-rail-bottom-s2').backgroundColor).toBe('colour:foreground');
    await screen.rerender(row({ state: 'now' }));
    expect(flat('stop-rail-bottom-s2').backgroundColor).toBe('colour:accent-line');
    await screen.rerender(row({ state: 'next' }));
    expect(flat('stop-rail-bottom-s2').backgroundColor).toBe('colour:foreground');
  });

  test('nothing joins the node from above on the first stop', async () => {
    await render(row({ isFirst: true }));
    expect(screen.queryByTestId('stop-rail-top-s2', hidden)).toBeNull();
  });

  test('a stop after another that the traveller left behind is joined by a dotted lead', async () => {
    await render(row({ from: { place: 'Lisbon', km: 23 } }));
    expect(screen.getByTestId('stop-rail-top-s2', hidden)).toBeTruthy();
    expect(screen.getByTestId('stop-rail-top-dotted-s2', hidden)).toBeTruthy();
  });

  test('a stop in the same place as the one before is joined by a solid lead', async () => {
    await render(row({ from: null }));
    expect(screen.getByTestId('stop-rail-top-s2', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-rail-top-dotted-s2', hidden)).toBeNull();
  });

  test('the dotted segment with the distance sits beneath the stop, not inside its name', async () => {
    await render(row({ transit: { km: 313 } }));
    expect(screen.getByTestId('stop-transit-s2', hidden)).toBeTruthy();
    expect(screen.getByText('313 km', hidden)).toBeTruthy();
    expect(
      within(screen.getByTestId('stop-row-s2')).queryByText('313 km', hidden),
    ).toBeNull();
  });

  test('no segment where the traveller has not moved on or a stop is unplaced', async () => {
    await render(row({ transit: null }));
    expect(screen.queryByTestId('stop-transit-s2', hidden)).toBeNull();
  });
});

describe('<StopRow> says what it draws (FR-075, FR-076)', () => {
  const valueOf = () => screen.getByTestId('stop-row-s2').props.accessibilityValue;

  test('the stop the traveller is at says "Now" as the value after its name, as well as in the chip', async () => {
    await render(row({ state: 'now' }));
    expect(screen.getByTestId('stop-now-s2')).toBeTruthy();
    expect(valueOf()).toEqual({ text: 'Now.' });
  });

  test('other stops have no "Now" chip and no value: the name is the 004 row\'s alone', async () => {
    await render(row({ state: 'next' }));
    expect(screen.queryByTestId('stop-now-s2')).toBeNull();
    expect(valueOf()).toBeUndefined();
    expect(screen.getByTestId('stop-row-s2').props.accessibilityLabel).not.toMatch(/Now/);
  });

  test('the distance from the stop before is said as the value, in words', async () => {
    await render(row({ from: { place: 'Lisbon', km: 23.4 } }));
    expect(valueOf()).toEqual({ text: '23 kilometres from Lisbon.' });
  });

  test("says both, Now first, and never in the name: the name stays exactly the 004 row's (FR-081)", async () => {
    await render(row({ state: 'now', from: { place: 'Lisbon', km: 23 } }));
    expect(valueOf()).toEqual({ text: 'Now. 23 kilometres from Lisbon.' });
    expect(screen.getByTestId('stop-row-s2').props.accessibilityLabel).toMatch(
      /^Stop 2: Sintra, Portugal\. (?:14 \S+|\S+ 14,?) 2026 → (?:15 \S+|\S+ 15,?) 2026$/,
    );
  });

  test('the nights are said in words under the dates', async () => {
    await render(row());
    expect(screen.getByTestId('stop-nights-s2')).toHaveTextContent('1 night');
    await screen.rerender(
      row({
        stop: { ...sintraStop, arrive_date: '2026-10-12', depart_date: '2026-10-14' },
      }),
    );
    expect(screen.getByTestId('stop-nights-s2')).toHaveTextContent('2 nights');
    await screen.rerender(
      row({
        stop: { ...sintraStop, arrive_date: '2026-10-12', depart_date: '2026-10-12' },
      }),
    );
    expect(screen.getByTestId('stop-nights-s2')).toHaveTextContent('Same day');
  });

  test('says the country beside its flag, and the flag is decorative', async () => {
    await render(row());
    expect(screen.getByText('Portugal')).toBeTruthy();
    expect(
      screen.getByTestId('stop-flag-s2', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
  });

  test('a stop whose city is not cached still has a name and no country', async () => {
    await render(
      row({
        stop: { ...sintraStop, city_name: null, country_name: null, country_iso: null },
      }),
    );
    expect(screen.getByText('City #7')).toBeTruthy();
    expect(screen.queryByTestId('stop-flag-s2', hidden)).toBeNull();
    expect(screen.getByTestId('stop-row-s2').props.accessibilityLabel).toMatch(
      /^Stop 2: City #7\. /,
    );
  });

  test('a stop that only exists on this device carries the pending marker, in words, and a dashed edge', async () => {
    await render(row({ stop: { ...sintraStop, is_dirty: true } }));
    expect(screen.getByLabelText('Sync pending')).toBeTruthy();
    expect(String(screen.getByTestId('stop-card-s2').props.className)).toContain(
      'border-dashed',
    );
  });

  test('a synchronised stop has no marker and no dashed edge', async () => {
    await render(row());
    expect(screen.queryByLabelText('Sync pending')).toBeNull();
    expect(String(screen.getByTestId('stop-card-s2').props.className)).not.toContain(
      'border-dashed',
    );
  });

  test('highlights the stop of the chosen day as a cream tile', async () => {
    await render(row({ highlighted: true }));
    expect(screen.getByTestId('stop-card-s2').props.variant).toBe('secondary');
    await screen.rerender(row({ highlighted: false }));
    expect(screen.getByTestId('stop-card-s2').props.variant).toBe('transparent');
  });
});

describe('<StopRow> the picture of the city', () => {
  test("is the traveller's photograph when it is given one, else the generated thumbnail", async () => {
    await render(row({ thumb: 'file:///thumbs/x.thumb.jpg' }));
    expect(screen.getByTestId('stop-thumb-s2-photo', hidden)).toBeTruthy();
    await screen.rerender(row({ thumb: null }));
    expect(screen.getByTestId('stop-thumb-s2-generated', hidden)).toBeTruthy();
    expect(screen.getByTestId('stop-thumb-s2-generated-glyph', hidden)).toHaveTextContent(
      'PT',
    );
  });
});

describe('<StopRow> while it is being dragged (the neutral dot of 004)', () => {
  test('the node goes neutral in the same box: no number, no check, no rail, no segment, no lead', async () => {
    await render(
      row({ dragging: true, transit: { km: 313 }, from: { place: 'L', km: 5 } }),
    );
    expect(screen.getByTestId('stop-dot-s2')).toBeTruthy();
    expect(screen.queryByTestId('stop-number-s2')).toBeNull();
    expect(glyphNamesIn(screen.getByTestId('stop-dot-s2'))).toEqual([]);
    expect(screen.queryByTestId('stop-rail-bottom-s2')).toBeNull();
    expect(screen.queryByTestId('stop-rail-top-s2', hidden)).toBeNull();
    expect(screen.queryByTestId('stop-transit-s2', hidden)).toBeNull();
    expect(flat('stop-dot-s2')).toMatchObject({ width: 28, height: 28 });
  });

  test('keeps the row, its name and its controls', async () => {
    await render(row({ dragging: true }));
    expect(screen.getByTestId('stop-row-s2').props.accessibilityLabel).toMatch(
      /^Stop 2: Sintra/,
    );
    expect(screen.getByTestId('stop-move-down-s2')).toBeTruthy();
  });
});

describe('<StopRow> at the largest text size (FR-074)', () => {
  test('has no fixed height: the controls wrap and the row grows', async () => {
    await render(row());
    for (const id of ['stop-row-s2', 'stop-card-s2', 'stop-actions-s2']) {
      const style = flat(id);
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
    expect(String(screen.getByTestId('stop-actions-s2').props.className)).toContain(
      'flex-wrap',
    );
  });
});
