/**
 * The small trip components: `<DateField>`, `<StatusPill>`, `<TripCard>`,
 * `<StopRow>`, and `<RequireLocalStore>`.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Text } from 'react-native';

import { RequireLocalStore } from '@/components/require-local-store';
import { DateField } from '@/components/trip/date-field';
import { StatusPill } from '@/components/trip/status-pill';
import { StopRow, describePlace } from '@/components/trip/stop-row';
import { TripCard, describeStopCount } from '@/components/trip/trip-card';
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

describe('<StatusPill>', () => {
  test.each([
    ['planning', 'Planning'],
    ['active', 'Active'],
    ['past', 'Past'],
  ] as const)(
    '%s renders text and an icon, labelled for a screen reader',
    async (status, label) => {
      await render(<StatusPill status={status} />);
      expect(screen.getByLabelText(`Status: ${label}`)).toBeTruthy();
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getByTestId(`status-pill-${status}`).children.length).toBe(2);
    },
  );
});

describe('<TripCard>', () => {
  test('describes the stop count in words', () => {
    expect(describeStopCount(0)).toBe('No stops yet');
    expect(describeStopCount(1)).toBe('1 stop');
    expect(describeStopCount(3)).toBe('3 stops');
  });

  test('is one labelled control that opens the trip', async () => {
    const onPress = jest.fn();
    await render(
      <TripCard
        summary={{
          trip: {
            id: 't1',
            title: 'Italy',
            home_currency: 'EUR',
            is_public: false,
            cover_photo_id: null,
            status: 'planning',
            created_at: 'x',
            updated_at: 'x',
            deleted_at: null,
            is_dirty: false,
            synced_at: 'x',
          },
          stopCount: 2,
          status: 'active',
        }}
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Italy, active, 2 stops'));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByLabelText('Sync pending')).toBeNull();
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
