/**
 * The small trip components: `<DateField>`, `<StopRow>`, and `<RequireLocalStore>`. (The status
 * chip has its own suite, `ui/chip.test.tsx`; the trip cards of the list have theirs beside them
 * in `components/trip/`, from feature 005.)
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, Text } from 'react-native';

import { RequireLocalStore } from '@/components/require-local-store';
import { DateField } from '@/components/trip/date-field';
import { StopRow, describePlace } from '@/components/trip/stop-row';
import { MinTouchTarget } from '@/constants/theme';
import { LocalStoreProvider, type AppDatabase } from '@/db/client';
import type { StopWithPlace } from '@/db/repositories/stops';

describe('<DateField>', () => {
  test('shows the day in words and exposes it as the accessibility value', async () => {
    await render(
      <DateField
        testID="arrive"
        label="Arrival"
        value="2026-05-12"
        onChange={jest.fn()}
      />,
    );
    const field = screen.getByTestId('arrive');
    expect(field.props.accessibilityValue.text).toMatch(/12/);
    expect(field.props.accessibilityValue.text).toMatch(/2026/);
  });

  test('on iOS, reveals the inline calendar on press and reports the picked day as an IsoDate', async () => {
    const onChange = jest.fn();
    await render(
      <DateField
        testID="arrive"
        label="Arrival"
        value="2026-05-12"
        onChange={onChange}
        minimumDate="2026-05-01"
      />,
    );

    expect(screen.queryByTestId('arrive-picker')).toBeNull();
    await fireEvent.press(screen.getByTestId('arrive'));
    const picker = screen.getByTestId('arrive-picker');
    expect(picker.props.mode).toBe('date');
    expect(picker.props.minimumDate).toEqual(new Date(2026, 4, 1));

    await act(async () => picker.props.onValueChange({}, new Date(2026, 4, 20, 23, 30)));
    expect(onChange).toHaveBeenCalledWith('2026-05-20');
    expect(screen.queryByTestId('arrive-picker')).toBeNull();
  });

  test('dismissing the inline calendar hides it without a change', async () => {
    const onChange = jest.fn();
    await render(
      <DateField
        testID="arrive"
        label="Arrival"
        value="2026-05-12"
        onChange={onChange}
      />,
    );
    await fireEvent.press(screen.getByTestId('arrive'));
    await act(async () => screen.getByTestId('arrive-picker').props.onDismiss());
    expect(screen.queryByTestId('arrive-picker')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('on Android, opens the system dialog imperatively instead of mounting a picker', async () => {
    // `Platform.OS` is a plain data property under jest-expo; swap it for the test.
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const onChange = jest.fn();
    await render(
      <DateField
        testID="arrive"
        label="Arrival"
        value="2026-05-12"
        onChange={onChange}
      />,
    );

    await fireEvent.press(screen.getByTestId('arrive'));

    expect(DateTimePickerAndroid.open).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'date', value: new Date(2026, 4, 12) }),
    );
    expect(screen.queryByTestId('arrive-picker')).toBeNull();
    const args = (DateTimePickerAndroid.open as jest.Mock).mock.calls[0]?.[0] as {
      onValueChange: (event: unknown, date: Date) => void;
    };
    // `pick` also closes the (never-opened) inline picker, which is a state
    // update — hence `act`, even though nothing visible changes on Android.
    await act(async () => args.onValueChange({}, new Date(2026, 4, 15)));
    expect(onChange).toHaveBeenCalledWith('2026-05-15');
    os.restore();
  });

  test('shows a validation message in words (FR-010)', async () => {
    await render(
      <DateField
        testID="depart"
        label="Departure"
        value="2026-05-10"
        onChange={jest.fn()}
        error="Departure can’t be before arrival."
      />,
    );
    expect(screen.getByText('Departure can’t be before arrival.')).toBeTruthy();
  });
});

describe('<StopRow>', () => {
  const stop: StopWithPlace = {
    id: 's1',
    trip_id: 't1',
    city_id: 100,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    city_name: 'Roma',
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
  };

  test('describePlace falls back to the city id when the cache has no name', () => {
    expect(describePlace(stop)).toBe('Roma');
    expect(describePlace({ city_name: null, city_id: 42 })).toBe('City #42');
  });

  test('routes every action, including the accessibility actions', async () => {
    const handlers = {
      onMoveUp: jest.fn(),
      onMoveDown: jest.fn(),
      onEdit: jest.fn(),
      onRemove: jest.fn(),
    };
    await render(
      <StopRow stop={stop} position={2} isFirst={false} isLast={false} {...handlers} />,
    );

    await fireEvent.press(screen.getByLabelText('Move Roma up'));
    await fireEvent.press(screen.getByLabelText('Move Roma down'));
    await fireEvent.press(screen.getByLabelText('Edit dates for Roma'));
    await fireEvent.press(screen.getByLabelText('Remove Roma'));
    expect(handlers.onMoveUp).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveDown).toHaveBeenCalledTimes(1);
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);

    const row = screen.getByTestId('stop-row-s1');
    for (const actionName of ['moveUp', 'moveDown', 'edit', 'delete', 'unknown']) {
      await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName } });
    }
    expect(handlers.onMoveUp).toHaveBeenCalledTimes(2);
    expect(handlers.onMoveDown).toHaveBeenCalledTimes(2);
    expect(handlers.onEdit).toHaveBeenCalledTimes(2);
    expect(handlers.onRemove).toHaveBeenCalledTimes(2);
  });

  test('the row label reads as a sentence with position, place, country, and dates', async () => {
    await render(
      <StopRow
        stop={stop}
        position={1}
        isFirst
        isLast
        onMoveUp={jest.fn()}
        onMoveDown={jest.fn()}
        onEdit={jest.fn()}
        onRemove={jest.fn()}
      />,
    );
    expect(screen.getByTestId('stop-row-s1').props.accessibilityLabel).toMatch(
      /^Stop 1: Roma, Italy\. .*10.*→.*12/,
    );
  });

  describe('as a timeline (004 T431; FR-013, FR-024, FR-026, FR-029, FR-030)', () => {
    const hidden = { includeHiddenElements: true };
    const noop = jest.fn();

    function renderRow(
      props: Partial<React.ComponentProps<typeof StopRow>> = {},
      overrides: Partial<StopWithPlace> = {},
    ) {
      return render(
        <StopRow
          stop={{ ...stop, ...overrides }}
          position={2}
          isFirst={false}
          isLast={false}
          onMoveUp={noop}
          onMoveDown={noop}
          onEdit={noop}
          onRemove={noop}
          {...props}
        />,
      );
    }

    test('numbers the stop by its place in the order, in tabular figures, on a dot', async () => {
      await renderRow({ position: 12 });

      const number = screen.getByTestId('stop-number-s1');
      expect(number).toHaveTextContent('12');
      // `numeric` is the role with tabular figures (text.tsx), and the dot has an ink on it.
      expect(number.props.className).toContain('text-accent-foreground');
      expect(StyleSheet.flatten(number.props.style).fontVariant).toContain(
        'tabular-nums',
      );
    });

    test('names the place as a headline, with the country beneath it and the dates under that', async () => {
      await renderRow();

      const place = screen.getByText('Roma');
      expect(place.props.className).toContain('text-[17px]');
      expect(screen.getByText('Italy')).toBeTruthy();
      expect(screen.getByTestId('stop-dates-s1')).toHaveTextContent(/10.*→.*12/);
    });

    test('leaves out the country line when the cache has no country', async () => {
      await renderRow({}, { country_name: null });
      expect(screen.queryByText('Italy')).toBeNull();
      expect(screen.getByText('Roma')).toBeTruthy();
    });

    test('is one element for assistive technology, named as before, with the four actions', async () => {
      await renderRow();

      const row = screen.getByTestId('stop-row-s1');
      expect(row.props.accessible).toBe(true);
      expect(row.props.accessibilityActions).toEqual([
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
        { name: 'edit', label: 'Edit dates' },
        { name: 'delete', label: 'Remove stop' },
      ]);
    });

    test('keeps the four controls under their ids, names and roles', async () => {
      await renderRow();

      const controls: [string, string][] = [
        ['stop-move-up-s1', 'Move Roma up'],
        ['stop-move-down-s1', 'Move Roma down'],
        ['stop-edit-s1', 'Edit dates for Roma'],
        ['stop-remove-s1', 'Remove Roma'],
      ];
      for (const [id, name] of controls) {
        const control = screen.getByTestId(id);
        expect(control.props.accessibilityLabel).toBe(name);
        expect(control.props.accessibilityRole).toBe('button');
      }
    });

    test('makes the controls compact: icon-only arrows, an icon and a word for Dates and Remove, at their own emphasis', async () => {
      await renderRow();

      for (const id of ['stop-move-up-s1', 'stop-move-down-s1']) {
        const arrow = screen.getByTestId(id);
        expect(arrow.props.isIconOnly).toBe(true);
        expect(arrow.props.variant).toBe('ghost');
        expect(screen.getByTestId(`${id}-icon`, hidden).props.accessible).toBe(false);
      }
      const dates = screen.getByTestId('stop-edit-s1');
      expect(dates.props.variant).toBe('ghost');
      expect(within(dates).getByText('Dates')).toBeTruthy();
      expect(screen.getByTestId('stop-edit-s1-icon', hidden)).toBeTruthy();
      const remove = screen.getByTestId('stop-remove-s1');
      expect(remove.props.variant).toBe('danger-soft');
      expect(within(remove).getByText('Remove')).toBeTruthy();
      expect(screen.getByTestId('stop-remove-s1-icon', hidden)).toBeTruthy();
    });

    test('gives every control the platform touch target, and lets them wrap at large text', async () => {
      await renderRow();

      for (const id of [
        'stop-move-up-s1',
        'stop-move-down-s1',
        'stop-edit-s1',
        'stop-remove-s1',
      ]) {
        const frame = StyleSheet.flatten(screen.getByTestId(id).props.style);
        expect(frame.minHeight ?? frame.height).toBeGreaterThanOrEqual(MinTouchTarget);
        expect(frame.minWidth ?? frame.width).toBeGreaterThanOrEqual(MinTouchTarget);
      }
      expect(screen.getByTestId('stop-actions-s1').props.className).toContain(
        'flex-wrap',
      );
    });

    test('disables move up on the first stop and move down on the last, and says so', async () => {
      await renderRow({ isFirst: true, isLast: true });

      expect(
        screen.getByTestId('stop-move-up-s1').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      expect(
        screen.getByTestId('stop-move-down-s1').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      expect(screen.getByTestId('stop-edit-s1').props.accessibilityState).toMatchObject({
        disabled: false,
      });
    });

    test('a disabled arrow and the row action do nothing at the ends', async () => {
      const onMoveUp = jest.fn();
      const onMoveDown = jest.fn();
      await renderRow({ isFirst: true, isLast: true, onMoveUp, onMoveDown });

      await fireEvent.press(screen.getByTestId('stop-move-up-s1'));
      await fireEvent.press(screen.getByTestId('stop-move-down-s1'));
      const row = screen.getByTestId('stop-row-s1');
      await fireEvent(row, 'accessibilityAction', {
        nativeEvent: { actionName: 'moveUp' },
      });
      await fireEvent(row, 'accessibilityAction', {
        nativeEvent: { actionName: 'moveDown' },
      });
      expect(onMoveUp).not.toHaveBeenCalled();
      expect(onMoveDown).not.toHaveBeenCalled();
    });

    test('draws the rail: a line above every stop but the first, below every stop but the last', async () => {
      const first = await renderRow({ isFirst: true, isLast: false });
      expect(screen.getByTestId('stop-rail-top-s1').props.className).not.toContain(
        'bg-border',
      );
      expect(screen.getByTestId('stop-rail-bottom-s1').props.className).toContain(
        'bg-border',
      );
      await first.unmount();

      await renderRow({ isFirst: false, isLast: true });
      expect(screen.getByTestId('stop-rail-top-s1').props.className).toContain(
        'bg-border',
      );
      expect(screen.queryByTestId('stop-rail-bottom-s1')).toBeNull();
    });

    test('marks a stop that is still only on this device, in words and icon, and with a dashed edge', async () => {
      await renderRow({}, { is_dirty: true, synced_at: null });

      expect(screen.getByLabelText('Sync pending')).toBeTruthy();
      expect(screen.getByText('Not yet synced')).toBeTruthy();
      expect(screen.getByTestId('stop-card-s1').props.className).toContain(
        'border-dashed',
      );
    });

    test('shows no marker and no dashed edge for a stop that has synced', async () => {
      await renderRow();

      expect(screen.queryByLabelText('Sync pending')).toBeNull();
      expect(screen.getByTestId('stop-card-s1').props.className).not.toContain(
        'border-dashed',
      );
    });

    test('places the drag handle the list supplies inside the card, and none when there is nothing to drag', async () => {
      const withHandle = await renderRow({ handle: <Text testID="grip">grip</Text> });
      expect(within(screen.getByTestId('stop-card-s1')).getByTestId('grip')).toBeTruthy();
      await withHandle.unmount();

      await renderRow();
      expect(screen.queryByTestId('grip')).toBeNull();
    });

    test('the dot carries the number, which is the order of the stop', async () => {
      await renderRow({ position: 3 });

      const dot = screen.getByTestId('stop-dot-s1');
      expect(within(dot).getByTestId('stop-number-s1')).toHaveTextContent('3');
    });

    test('while a stop is being dragged the dot is neutral: no number, no rail, same box', async () => {
      await renderRow({ dragging: true, position: 3 });

      const dot = screen.getByTestId('stop-dot-s1');
      expect(within(dot).queryByTestId('stop-number-s1')).toBeNull();
      expect(screen.queryByText('3')).toBeNull();
      expect(screen.queryByTestId('stop-rail-top-s1')).toBeNull();
      expect(screen.queryByTestId('stop-rail-bottom-s1')).toBeNull();
      // The box keeps its size classes, so lifting a row moves nothing.
      expect(screen.getByTestId('stop-dot-s1').props.className).toContain('min-h-8');
      expect(screen.getByTestId('stop-dot-s1').props.className).toContain('min-w-8');
    });

    test('dragging changes the dot only: the row keeps its name, actions and controls', async () => {
      const onMoveUp = jest.fn();
      await renderRow({ dragging: true, onMoveUp });

      expect(screen.getByTestId('stop-row-s1').props.accessibilityLabel).toMatch(
        /^Stop 2: Roma, Italy\./,
      );
      expect(screen.getByTestId('stop-row-s1').props.accessibilityActions).toHaveLength(
        4,
      );
      await fireEvent.press(screen.getByTestId('stop-move-up-s1'));
      expect(onMoveUp).toHaveBeenCalledTimes(1);
    });

    test('is built from the adapter layer only', () => {
      const source = jest
        .requireActual('fs')
        .readFileSync(require.resolve('@/components/trip/stop-row'), 'utf8') as string;
      expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    });
  });
});

describe('<RequireLocalStore>', () => {
  const Child = () => <Text>children</Text>;

  test('shows a designed opening state while the store is not open', async () => {
    await render(
      <LocalStoreProvider value={{ db: null, error: null, retry: jest.fn() }}>
        <RequireLocalStore>
          <Child />
        </RequireLocalStore>
      </LocalStoreProvider>,
    );
    expect(screen.getByTestId('local-store-opening')).toBeTruthy();
    expect(screen.getByLabelText('Opening your trips')).toBeTruthy();
    expect(screen.queryByText('children')).toBeNull();
  });

  test('shows a designed error state with retry when the store failed', async () => {
    const retry = jest.fn();
    await render(
      <LocalStoreProvider value={{ db: null, error: new Error('boom'), retry }}>
        <RequireLocalStore>
          <Child />
        </RequireLocalStore>
      </LocalStoreProvider>,
    );
    expect(screen.getByText('Couldn’t open your trips')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(retry).toHaveBeenCalled();
  });

  test('renders the children once the store is open', async () => {
    await render(
      <LocalStoreProvider
        value={{ db: {} as AppDatabase, error: null, retry: jest.fn() }}>
        <RequireLocalStore>
          <Child />
        </RequireLocalStore>
      </LocalStoreProvider>,
    );
    expect(screen.getByText('children')).toBeTruthy();
  });
});
