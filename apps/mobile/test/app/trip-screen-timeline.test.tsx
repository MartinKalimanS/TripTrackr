/**
 * `trip/[id]` as a journey, part two (T068, 004 T431, 005 T545, T546; spec FR-041, FR-042,
 * FR-012, FR-006, FR-020): the timeline, a trip with no stops, the stop editor, what the screen
 * is built from and the haptics of its writes. States, the hero, synchronisation, the five
 * areas and the day strip are `trip-screen.test.tsx`; the doubles and fixtures are
 * `trip-screen-harness.tsx`.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { Alert } from 'react-native';

import TripScreen from '@/app/trip/[id]/index';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';
import { Sentry } from '@/lib/sentry';

import {
  actions,
  florence,
  live,
  overview,
  resetTripScreen,
  rome,
  stop,
} from './trip-screen-harness';

const hidden = { includeHiddenElements: true };

jest.mock('expo-router', () => require('./trip-screen-harness').routerModule());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () =>
  require('./trip-screen-harness').reanimatedModule(),
);
// A View that carries every prop, so a test reads what a cover was given.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return {
    Image: (props: Record<string, unknown>) => React.createElement(Host, props),
  };
});
jest.mock('@/components/trip/city-picker', () =>
  require('./trip-screen-harness').cityPickerModule(),
);
jest.mock('@/features/trips/use-trips', () =>
  require('./trip-screen-harness').tripsModule(),
);
jest.mock('@/features/trips/trip-overview', () =>
  require('./trip-screen-harness').overviewModule(),
);
jest.mock('@/features/trips/use-trip-sync', () =>
  require('./trip-screen-harness').syncModule(),
);

beforeEach(resetTripScreen);

describe('<TripScreen> the timeline (FR-041, FR-012)', () => {
  test('lists stops in order with place, country, and dates, inside the stops list', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);

    expect(screen.getByText('Roma')).toBeTruthy();
    expect(screen.getByText('Firenze')).toBeTruthy();
    expect(screen.getByTestId('stop-dates-stop-rome')).toHaveTextContent(/\d.*→.*\d/);
    // Both are still to come, so each node shows its number; the row's own name
    // (`Stop 1: Roma, Italy. ...`) is what screen readers and the Maestro flows use.
    expect(screen.getByTestId('stop-number-stop-rome')).toHaveTextContent('1');
    expect(screen.getByTestId('stop-number-stop-florence')).toHaveTextContent('2');
    expect(screen.getByTestId('stop-row-stop-rome').props.accessibilityLabel).toMatch(
      /^Stop 1: Roma, Italy\./,
    );
    expect(screen.getByTestId('stop-row-stop-florence').props.accessibilityLabel).toMatch(
      /^Stop 2: Firenze, Italy\./,
    );
    const rows = within(screen.getByTestId('trip-stops')).getAllByTestId(/^stop-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'stop-row-stop-rome',
      'stop-row-stop-florence',
    ]);
  });

  test('says the stops with their count in a heading', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    expect(screen.getByText('Stops').props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('trip-stops-count')).toHaveTextContent('2');
  });

  test('draws the distance between the stops where the traveller moves on', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    expect(screen.getByTestId('stop-transit-stop-rome', hidden)).toBeTruthy();
    expect(screen.queryByTestId('stop-transit-stop-florence', hidden)).toBeNull();
  });

  test('gives each stop the picture of its city when the overview has one', async () => {
    live.stops.data = [rome];
    overview.cityThumbs = new Map([[100, 'file:///t/roma.thumb.jpg']]);
    await render(<TripScreen />);
    expect(screen.getByTestId('stop-thumb-stop-rome-photo', hidden).props.source).toEqual(
      {
        uri: 'file:///t/roma.thumb.jpg',
      },
    );
  });

  test('a stop whose city is not cached still has a name', async () => {
    live.stops.data = [stop({ city_name: null, country_name: null, city_id: 777 })];
    await render(<TripScreen />);
    expect(screen.getByText('City #777')).toBeTruthy();
  });

  test('move up / move down call the repository and are disabled at the ends (FR-012)', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);

    expect(
      screen.getByTestId('stop-move-up-stop-rome').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByTestId('stop-move-down-stop-florence').props.accessibilityState,
    ).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(actions.moveStop).toHaveBeenCalledWith('stop-rome', 'down');

    await fireEvent.press(screen.getByTestId('stop-move-up-stop-florence'));
    expect(actions.moveStop).toHaveBeenCalledWith('stop-florence', 'up');
  });

  test('Acceptance Scenario 1.6: dropping a dragged stop writes the whole new order once (T071b)', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);

    // Two stops: each row carries the drag handle the sortable list supplies.
    expect(screen.getAllByTestId('sortable-handle')).toHaveLength(2);
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(2);

    // The library delivers the drop as the data array in its new order.
    const { __dropAt } = jest.requireMock('react-native-sortables') as {
      __dropAt: (data: unknown[]) => void;
    };
    await act(async () => __dropAt([florence, rome]));

    expect(actions.reorderStops).toHaveBeenCalledWith('trip-42', [
      'stop-florence',
      'stop-rome',
    ]);
    expect(actions.moveStop).not.toHaveBeenCalled();
  });

  test('numbers the stops again once the dragged one has landed, and not while it is carried', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const sortables = jest.requireMock('react-native-sortables') as {
      __dragStart: (key: string) => void;
      __dropAt: (data: unknown[]) => void;
      __activeItemDropped: (key: string) => void;
    };

    await act(async () => sortables.__dragStart('stop-florence'));
    expect(screen.queryByTestId('stop-number-stop-rome')).toBeNull();
    expect(screen.queryByTestId('stop-number-stop-florence')).toBeNull();
    // The journey is not trusted while a row is carried either.
    expect(screen.queryByTestId('stop-transit-stop-rome', hidden)).toBeNull();

    await act(async () => sortables.__dropAt([florence, rome]));
    await act(async () => sortables.__activeItemDropped('stop-florence'));
    expect(screen.getByTestId('stop-number-stop-rome')).toHaveTextContent('1');
  });

  test('a single stop shows no drag handle: there is nothing to reorder', async () => {
    live.stops.data = [rome];
    await render(<TripScreen />);
    expect(screen.queryByTestId('sortable-handle')).toBeNull();
  });

  test('exposes the stop actions as accessibility actions on the row', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    const row = screen.getByTestId('stop-row-stop-florence');

    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'moveUp',
      'moveDown',
      'edit',
      'delete',
    ]);

    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    expect(actions.moveStop).toHaveBeenCalledWith('stop-florence', 'up');

    // Last row: "move down" is a no-op rather than a call the repository must reject.
    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveDown' },
    });
    expect(actions.moveStop).toHaveBeenCalledTimes(1);
  });

  test('remove asks for confirmation, then tombstones through the repository', async () => {
    live.stops.data = [rome];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-remove-stop-rome'));

    expect(alert).toHaveBeenCalledWith(
      'Remove Roma?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Remove' })]),
    );
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());
    expect(actions.removeStop).toHaveBeenCalledWith('stop-rome');
    alert.mockRestore();
  });

  test('a trip with stops has a dashed Add stop row at the end and no primary control (FR-006)', async () => {
    live.stops.data = [rome];
    await render(<TripScreen />);

    const add = screen.getByTestId('trip-add-stop');
    expect(add.props.accessibilityLabel).toBe('Add stop');
    expect(add.props.accessibilityRole).toBe('button');
    expect(screen.getAllByLabelText('Add stop')).toHaveLength(1);
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toHaveLength(0);
  });

  test('a failed local write is reported to Sentry AND shown to the traveller', async () => {
    live.stops.data = [rome, florence];
    actions.moveStop.mockImplementation(() => {
      throw new Error('database is locked');
    });
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByTestId('trip-write-error')).toHaveTextContent(
      /could not be saved/,
    );
    // An alert the platform announces on appearance; it reads after the list, as before.
    expect(screen.getByTestId('trip-write-error').props.accessibilityRole).toBe('alert');
  });

  test('a successful write clears an earlier failure', async () => {
    live.stops.data = [rome, florence];
    actions.moveStop.mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(screen.getByTestId('trip-write-error')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(screen.queryByTestId('trip-write-error')).toBeNull();
  });
});

describe('<TripScreen> a trip with no stops (FR-042)', () => {
  test('shows a ghost stamp, "No stops yet" and the one primary, "Add stop"', async () => {
    await render(<TripScreen />);
    expect(screen.getByText('No stops yet')).toBeTruthy();
    expect(screen.getByTestId('ghost-stamp', hidden)).toBeTruthy();
    const add = screen.getByTestId('trip-add-stop');
    expect(add.props.accessibilityLabel).toBe('Add stop');
    expect(add.props.variant).toBe('primary');
    expect(screen.getAllByLabelText('Add stop')).toHaveLength(1);
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toHaveLength(1);
  });

  test('has zeros in the tiles and no day strip, and the status is Planning', async () => {
    await render(<TripScreen />);
    expect(screen.queryByTestId('trip-days')).toBeNull();
    expect(within(screen.getByTestId('trip-open-notes')).getByText('0')).toBeTruthy();
    expect(screen.getByTestId('status-pill-planning')).toBeTruthy();
  });

  test('"Add stop" opens the stop editor as a page sheet whose Save is in the sticky footer (T437)', async () => {
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('trip-add-stop'));

    expect(screen.getByTestId('stop-editor-modal').props.presentationStyle).toBe(
      'pageSheet',
    );
    expect(
      within(screen.getByTestId('stop-editor-footer')).getByTestId('stop-editor-save'),
    ).toBeTruthy();
  });

  test('cancelling the editor writes nothing', async () => {
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    await fireEvent.press(screen.getByTestId('stop-editor-cancel'));

    expect(screen.queryByTestId('stop-editor')).toBeNull();
    expect(actions.addStop).not.toHaveBeenCalled();
  });
});

describe('<TripScreen> the stop editor', () => {
  test('"Add stop" opens the editor with arrival pre-suggested from the last departure (FR-015), and saves through the repository', async () => {
    live.stops.data = [stop({ arrive_date: '2026-05-10', depart_date: '2026-05-12' })];
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    expect(screen.getByTestId('stop-editor')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('pick-florence'));
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent(/^Firenze/);
    // Rome departs 12 May, so Florence arrives 12 May.
    expect(
      screen.getByTestId('stop-editor-arrive').props.accessibilityValue.text,
    ).toMatch(/12/);

    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(actions.addStop).toHaveBeenCalledWith({
      trip_id: 'trip-42',
      city_id: 101,
      arrive_date: '2026-05-12',
      depart_date: '2026-05-13',
    });
    expect(screen.queryByTestId('stop-editor')).toBeNull();
  });

  test('"Dates" opens the editor for an existing stop and saves the new pair', async () => {
    live.stops.data = [stop({ arrive_date: '2026-05-10', depart_date: '2026-05-12' })];
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-edit-stop-rome'));
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Roma');

    // Drive the iOS inline picker: open it, then pick a day.
    await fireEvent.press(screen.getByTestId('stop-editor-depart'));
    const picker = screen.getByTestId('stop-editor-depart-picker');
    await act(async () => picker.props.onValueChange({}, new Date(2026, 4, 14)));

    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(actions.updateStopDates).toHaveBeenCalledWith('stop-rome', {
      city_id: 100,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-14',
    });
  });
});

describe('<TripScreen> is built from the adapter layer', () => {
  test('uses no raised-surface primitive, no legacy text or status pill, no kit and no raw appearance', () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    for (const module of [
      '@/app/trip/[id]/index',
      '@/components/trip/trip-hero',
      '@/components/trip/progress-row',
      '@/components/trip/areas-strip',
      '@/components/trip/day-chips',
      '@/components/trip/stop-row',
      '@/components/trip/stop-list',
    ]) {
      const source = readFileSync(require.resolve(module), 'utf8');
      expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
      expect(source).not.toMatch(/components\/trip\/status-pill|StatusPill/);
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
      expect(source).not.toMatch(/use-appearance|Colors\[/);
    }
  });

  test('performs no network call: the screen reads the local store (Constitution II)', () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    for (const module of ['@/app/trip/[id]/index', '@/components/trip/trip-detail']) {
      const source = readFileSync(require.resolve(module), 'utf8');
      expect(source).not.toMatch(/apiFetch|fetch\(|useMutation|api-client/);
    }
  });
});

/**
 * T460 - FR-020: a saved stop gives the success haptic, a confirmed removal the warning, a
 * failed write nothing, and moving a stop is not a save. The real `useHaptics` is under these,
 * so what is read is `expo-haptics` (a global stand-in, jest.setup.ts).
 */
describe('save and destructive-confirmation haptics of the stops (T460; FR-020)', () => {
  const haptics = jest.mocked(ExpoHaptics);
  const notified = () => haptics.notificationAsync.mock.calls.map(([kind]) => kind);

  beforeEach(() => {
    haptics.notificationAsync.mockClear();
    haptics.selectionAsync.mockClear();
  });
  afterEach(() => __resetAppearanceStoreForTests());

  test('a saved stop plays the success haptic once, and a failed one none', async () => {
    live.stops.data = [rome];
    actions.addStop.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    await fireEvent.press(screen.getByTestId('pick-florence'));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(screen.getByTestId('trip-write-error')).toBeTruthy();
    expect(notified()).not.toContain('success');

    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    await fireEvent.press(screen.getByTestId('pick-florence'));
    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(actions.addStop).toHaveBeenCalledTimes(2);
    expect(notified()).toEqual(['success']);
  });

  test('confirming the removal of a stop plays the warning haptic, and the question alone does not', async () => {
    live.stops.data = [rome];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-remove-stop-rome'));
    haptics.notificationAsync.mockClear();
    expect(actions.removeStop).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());
    expect(actions.removeStop).toHaveBeenCalledWith('stop-rome');
    expect(notified()).toEqual(['warning']);
    alert.mockRestore();
  });

  test('moving a stop is not a save: no success haptic', async () => {
    live.stops.data = [rome, florence];
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(actions.moveStop).toHaveBeenCalled();
    expect(notified()).toEqual([]);
  });
});
