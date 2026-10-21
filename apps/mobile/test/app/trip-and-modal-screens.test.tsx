/**
 * `modal/add-trip` (T066), the stop editor sheet (T437) and `+not-found`. The trip screen's own
 * tests are `trip-screen.test.tsx` and `trip-screen-timeline.test.tsx` (005 T546).
 *
 * The live-query hooks and actions are mocked (their own suite runs them against a real
 * database). A failed local write is reported and shown rather than swallowed.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import NotFoundScreen from '@/app/+not-found';
import AddTripScreen from '@/app/modal/add-trip';
import { StopEditor, type StopEditorMode } from '@/components/trip/stop-editor';
import { sheetMaxHeight } from '@/components/ui/form-sheet';
import type { TripRow } from '@/db/schema';
import { useSessionStore } from '@/features/auth/session-store';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';
import { Sentry } from '@/lib/sentry';

import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const { Pressable, Text } = require('react-native');
  return {
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => true,
    }),
    // A Link is a Pressable that navigates; recording the href is what matters.
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <Pressable testID={`link:${href}`} {...rest}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Pressable>
    ),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

// The city picker talks to the geography hooks; here it is a stand-in that
// offers one city so the stop editor can be driven end to end.
jest.mock('@/components/trip/city-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CityPicker: ({
      onSelect,
    }: {
      onSelect: (city: Record<string, unknown>, country: Record<string, unknown>) => void;
    }) => (
      <Pressable
        testID="pick-florence"
        onPress={() =>
          onSelect(
            {
              id: 101,
              country_id: 1,
              name: 'Firenze',
              ascii_name: 'Firenze',
              lat: 43.8,
              lng: 11.3,
              timezone: 'Europe/Rome',
              population: 380_000,
            },
            { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
          )
        }>
        <Text>Pick Florence</Text>
      </Pressable>
    ),
  };
});

const mockActions = {
  createTrip: jest.fn(),
  removeTrip: jest.fn(),
  addStop: jest.fn(),
  updateStopDates: jest.fn(),
  moveStop: jest.fn(),
  reorderStops: jest.fn(),
  removeStop: jest.fn(),
};

jest.mock('@/features/trips/use-trips', () => ({
  useTripActions: () => mockActions,
}));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
};

/** Icons are decorative, so a query for one has to look at hidden elements too. */
const hidden = { includeHiddenElements: true };

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'GBP',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  for (const action of Object.values(mockActions)) action.mockReset();
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('<AddTripScreen> — modal/add-trip (T066)', () => {
  test('defaults the home currency to the traveller’s own', async () => {
    await render(<AddTripScreen />);
    expect(screen.getByTestId('currency-GBP').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  test('refuses an empty title in words and writes nothing', async () => {
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByText('Give your trip a name.')).toBeTruthy();
    expect(mockActions.createTrip).not.toHaveBeenCalled();
  });

  test('refuses a malformed currency code in words', async () => {
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    await fireEvent.changeText(screen.getByLabelText('Other currency code'), 'eu');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByText('Use a 3-letter currency code, like EUR.')).toBeTruthy();
    expect(mockActions.createTrip).not.toHaveBeenCalled();
  });

  test('writes the trip locally first and opens it (Acceptance Scenario 1.3)', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'new-trip' });
    await render(<AddTripScreen />);
    await fireEvent.changeText(
      screen.getByLabelText('Trip name'),
      '  Italy, spring 2026 ',
    );
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(mockActions.createTrip).toHaveBeenCalledWith({
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
    });
    expect(mockReplace).toHaveBeenCalledWith('/trip/new-trip');
  });

  test('accepts a free-text code, upper-cased', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'thai' });
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Thailand');
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    await fireEvent.changeText(screen.getByLabelText('Other currency code'), 'thb');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(mockActions.createTrip).toHaveBeenCalledWith({
      title: 'Thailand',
      home_currency: 'THB',
    });
  });

  test('a failed local write is reported and shown, and the sheet stays open', async () => {
    mockActions.createTrip.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByTestId('add-trip-error')).toHaveTextContent(/could not be saved/);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('performs no network call — the trip is local-first (Constitution II)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/modal/add-trip'), 'utf8') as string;
    expect(source).not.toMatch(/apiFetch|fetch\(|useMutation|api-client/);
  });

  test('offers a way to dismiss the modal', async () => {
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<AddTripScreen> as a form sheet (T434; FR-005, FR-009, FR-024, FR-025, FR-029, FR-030)', () => {
  afterEach(() => resetKeyboard());

  test('is the form-sheet pattern: a titled sheet whose root, body and footer are named from add-trip-screen', async () => {
    await render(<AddTripScreen />);

    expect(screen.getByTestId('add-trip-screen')).toBeTruthy();
    const title = within(screen.getByTestId('add-trip-screen-body')).getByText(
      'New trip',
    );
    expect(title.props.accessibilityRole).toBe('header');
    const footer = within(screen.getByTestId('add-trip-screen-footer'));
    expect(footer.getByTestId('add-trip-cancel')).toBeTruthy();
    expect(footer.getByTestId('add-trip-save')).toBeTruthy();
  });

  test('keeps the reading order: title, trip name, home currency, then Cancel and Save', async () => {
    await render(<AddTripScreen />);

    const order = screen
      .getAllByText(/^(New trip|Trip name|Home currency|Cancel|Save trip)$/)
      .map((node) => String(node.props.children));
    expect(order).toEqual([
      'New trip',
      'Trip name',
      'Home currency',
      'Cancel',
      'Save trip',
    ]);
  });

  test('has ONE primary control, Save; Cancel is a text button (FR-005)', async () => {
    await render(<AddTripScreen />);

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.props.variant === 'primary'),
    ).toEqual([screen.getByTestId('add-trip-save')]);
    expect(screen.getByTestId('add-trip-cancel').props.variant).toBe('ghost');
  });

  test('the trip name is a Field: label on top, its own id and name, words under it when refused (FR-025)', async () => {
    await render(<AddTripScreen />);

    const input = screen.getByTestId('add-trip-title');
    expect(input.props.accessibilityLabel).toBe('Trip name');
    expect(screen.getByText('Trip name')).toBeTruthy();
    expect(input.props.placeholder).toBe('Italy, spring 2026');
    expect(input.props.autoCapitalize).toBe('words');
    expect(input.props.maxLength).toBe(200);
    expect(input.props['aria-invalid']).toBe(false);

    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByTestId('add-trip-title').props['aria-invalid']).toBe(true);
    const words = screen.getByTestId('add-trip-title-error');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(words).toHaveTextContent('Give your trip a name.');
  });

  test('offers the home currency as one sideways chip row ending in Other (003 FR-017; FR-009)', async () => {
    await render(<AddTripScreen />);

    const group = screen.getByTestId('currency-pills');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    const radios = within(group).getAllByRole('radio');
    expect(radios.at(-1)?.props.testID).toBe('currency-other-toggle');
    expect(radios).toHaveLength(11);
    expect(group.queryAll((node) => node.props.horizontal === true)).toHaveLength(1);
  });

  test('"Other" opens a field in the sheet whose refusal reads in words under it', async () => {
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
    await fireEvent.changeText(screen.getByTestId('currency-other'), 'eu');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByTestId('currency-other-error')).toHaveTextContent(
      'Use a 3-letter currency code, like EUR.',
    );
    expect(mockActions.createTrip).not.toHaveBeenCalled();
  });

  test('saves from the keyboard too: Done on the name field submits the form', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'kb-trip' });
    await render(<AddTripScreen />);
    const input = screen.getByTestId('add-trip-title');
    expect(input.props.returnKeyType).toBe('done');

    await fireEvent.changeText(input, 'Lisbon');
    await fireEvent(input, 'submitEditing');

    expect(mockActions.createTrip).toHaveBeenCalledWith({
      title: 'Lisbon',
      home_currency: 'GBP',
    });
    expect(mockReplace).toHaveBeenCalledWith('/trip/kb-trip');
  });

  test('a failed local write shows its words in the body, above the actions, as an alert', async () => {
    mockActions.createTrip.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    const error = screen.getByTestId('add-trip-error');
    expect(error.props.accessibilityRole).toBe('alert');
    const body = within(screen.getByTestId('add-trip-screen-body'));
    expect(body.getByTestId('add-trip-error')).toBe(error);
  });

  describe('with the keyboard up (C4-10 rule 8; the keyboard-visibility test of every form)', () => {
    beforeEach(() => setWindow(PHONE_360X640));

    test('Save is in the footer, outside the scrolling body, and the sheet is capped above the keyboard', async () => {
      await render(<AddTripScreen />);
      await showKeyboard();

      expectActionAboveKeyboard('add-trip-screen', 'add-trip-save');
    });

    test('the last field can be filled and Save submits it, with the keyboard still up', async () => {
      mockActions.createTrip.mockReturnValue({ ...trip, id: 'new-trip' });
      await render(<AddTripScreen />);
      await showKeyboard();

      await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
      await fireEvent.press(screen.getByTestId('currency-other-toggle'));
      await fireEvent.changeText(screen.getByTestId('currency-other'), 'thb');
      expectActionAboveKeyboard('add-trip-screen', 'add-trip-save');
      await fireEvent.press(screen.getByTestId('add-trip-save'));

      expect(mockActions.createTrip).toHaveBeenCalledWith({
        title: 'Italy',
        home_currency: 'THB',
      });
    });

    test('an invalid submit with the keyboard up still says why, and Save stays where it was', async () => {
      await render(<AddTripScreen />);
      await showKeyboard();

      await fireEvent.press(screen.getByTestId('add-trip-save'));
      expect(screen.getByText('Give your trip a name.')).toBeTruthy();
      expectActionAboveKeyboard('add-trip-screen', 'add-trip-save');
    });

    test('the body keeps taps with the keyboard up, so a chip is not swallowed by a dismissal', async () => {
      await render(<AddTripScreen />);
      await showKeyboard();
      expect(
        screen.getByTestId('add-trip-screen-body').props.keyboardShouldPersistTaps,
      ).toBe('handled');
    });
  });

  describe('fits one screen at the default text size on 360 x 640 dp (FR-009; 003 FR-017)', () => {
    // Jest renders no layout, so this is a desk budget, not a measurement: the heights of
    // the parts as the tokens and the kit set them, added up for the busiest state, against
    // the room the sheet is allowed. The on-phone check (tasks.md T434) measures it.
    const HANDLE = 4 + 12;
    const BODY_PAD = 24 + 16;
    const GAP = 16;
    const TITLE = 28;
    const LABEL = 20;
    const INPUT = 48;
    const LABEL_TO_INPUT = 8;
    const ERROR_LINE = 20;
    const CHIP_ROW = 48 + 8;
    const FOOTER = 12 + 48 + 16;
    const field = (error: boolean) =>
      LABEL + LABEL_TO_INPUT + INPUT + (error ? ERROR_LINE : 0);

    const quiet = () =>
      HANDLE +
      BODY_PAD +
      TITLE +
      GAP +
      field(false) +
      GAP +
      (LABEL + 8 + CHIP_ROW) +
      FOOTER;
    const busiest = () =>
      HANDLE +
      BODY_PAD +
      TITLE +
      GAP +
      field(true) +
      GAP +
      (LABEL + 8 + CHIP_ROW + 8 + field(true)) +
      GAP +
      ERROR_LINE +
      FOOTER;

    test('the form needs less than the room the sheet is allowed, even when every message is showing', () => {
      const room = sheetMaxHeight({ windowHeight: 640, topInset: 24, keyboardHeight: 0 });
      expect(quiet()).toBeLessThan(room);
      expect(busiest()).toBeLessThan(room);
    });

    test('has nothing to scroll in the quiet state: the sheet is not capped below the form', async () => {
      setWindow(PHONE_360X640);
      await render(<AddTripScreen />);
      const cap = StyleSheet.flatten(screen.getByTestId('add-trip-screen').props.style)
        .maxHeight as number;
      expect(cap).toBeGreaterThan(quiet());
    });
  });

  test('is composed from the adapter layer only: the form-sheet pattern and Field, no retired primitive', () => {
    const source = (jest.requireActual('fs') as typeof import('fs')).readFileSync(
      require.resolve('@/app/modal/add-trip'),
      'utf8',
    );
    expect(source).toMatch(/from '@\/components\/ui\/form-sheet'/);
    expect(source).toMatch(/from '@\/components\/ui\/field'/);
    expect(source).not.toMatch(
      /ThemedText|ThemedView|TextField|\bSurface\b|PressableSurface|PillGroup/,
    );
    expect(source).not.toMatch(/components\/ui\/screen|ui\/form-actions/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/use-appearance|Colors\[|#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('<StopEditor> - a page sheet on the form-sheet pattern (T437; FR-005, FR-009, FR-024, FR-029, FR-030, FR-037)', () => {
  const onCancel = jest.fn();
  const onSubmit = jest.fn();
  const addMode: StopEditorMode = {
    kind: 'add',
    previousStop: { depart_date: '2026-05-12' },
  };
  const editMode: StopEditorMode = {
    kind: 'edit',
    stop: { city_id: 100, arrive_date: '2026-05-10', depart_date: '2026-05-12' },
    placeName: 'Roma',
  };
  const flat = (testID: string) =>
    (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<
      string,
      unknown
    >;

  beforeEach(() => {
    onCancel.mockReset();
    onSubmit.mockReset();
  });
  afterEach(() => {
    resetKeyboard();
    __resetAppearanceStoreForTests();
  });

  const renderEditor = (mode: StopEditorMode = addMode) =>
    render(<StopEditor visible mode={mode} onCancel={onCancel} onSubmit={onSubmit} />);

  const pickDate = async (fieldTestId: string, date: Date) => {
    await fireEvent.press(screen.getByTestId(fieldTestId));
    const picker = screen.getByTestId(`${fieldTestId}-picker`);
    await act(async () => picker.props.onValueChange({}, date));
  };

  const primaries = () =>
    screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary')
      .map((button) => button.props.testID);

  describe('the Modal', () => {
    test('is a React Native Modal presented as a page sheet, which a swipe down or Back dismisses as Cancel', async () => {
      await renderEditor();

      const modal = screen.getByTestId('stop-editor-modal');
      expect(modal.props).toMatchObject({
        visible: true,
        presentationStyle: 'pageSheet',
        animationType: 'slide',
        allowSwipeDismissal: true,
      });
      await act(async () => modal.props.onRequestClose());
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('with reduced motion it does not slide in (feature 002 FR-015)', async () => {
      const reduced = jest
        .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
        .mockResolvedValue(true);
      await renderEditor();
      await act(async () => undefined);

      expect(screen.getByTestId('stop-editor-modal').props.animationType).toBe('none');
      reduced.mockRestore();
    });

    test('draws a handle on iOS, where the page sheet has none of its own, hidden from assistive technology', async () => {
      const os = jest.replaceProperty(Platform, 'OS', 'ios');
      await renderEditor();
      os.restore();

      const handle = screen.getByTestId('stop-editor-handle', hidden);
      expect(handle.props.accessibilityElementsHidden).toBe(true);
      expect(handle.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(handle.props.accessible).not.toBe(true);
    });

    test('draws none on Android: the Modal is a full-screen dialog there, with nothing to drag', async () => {
      const os = jest.replaceProperty(Platform, 'OS', 'android');
      await renderEditor();
      os.restore();

      expect(screen.queryByTestId('stop-editor-handle', hidden)).toBeNull();
    });

    test('keeps clear of the status bar on Android, where the Modal draws under it, and not on iOS, where the sheet starts below it', async () => {
      const insets = { top: 24, bottom: 34, left: 0, right: 0 };
      const withInsets = (
        <SafeAreaInsetsContext.Provider value={insets}>
          <StopEditor visible mode={addMode} onCancel={onCancel} onSubmit={onSubmit} />
        </SafeAreaInsetsContext.Provider>
      );

      const android = jest.replaceProperty(Platform, 'OS', 'android');
      const first = await render(withInsets);
      android.restore();
      expect(flat('stop-editor-frame').paddingTop).toBe(insets.top);
      await first.unmount();

      const ios = jest.replaceProperty(Platform, 'OS', 'ios');
      await render(withInsets);
      ios.restore();
      expect(flat('stop-editor-frame').paddingTop).toBe(0);
      expect(screen.getByTestId('stop-editor-footer').props.offset).toEqual({
        closed: 0,
        opened: insets.bottom,
      });
    });

    test('renders nothing of the sheet while hidden', async () => {
      await render(
        <StopEditor
          visible={false}
          mode={addMode}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />,
      );
      expect(screen.queryByTestId('stop-editor')).toBeNull();
    });
  });

  describe('the sheet', () => {
    test('is a titled form sheet on the modal host: root, body and footer are named from stop-editor', async () => {
      await renderEditor();

      const title = screen.getByText('Add stop');
      expect(title.props.accessibilityRole).toBe('header');
      const body = screen.getByTestId('stop-editor-body');
      const footer = screen.getByTestId('stop-editor-footer');
      expect(within(body).getByText('Add stop')).toBeTruthy();
      expect(within(footer).getByTestId('stop-editor-cancel')).toBeTruthy();
      expect(within(footer).getByTestId('stop-editor-save')).toBeTruthy();
      expect(footer.props.offset).toEqual({ closed: 0, opened: 0 });
      expect(flat('stop-editor').flex).toBe(1);
    });

    test('names the actions as before: Save stop when adding, Save dates when editing', async () => {
      await renderEditor();
      expect(screen.getByTestId('stop-editor-save').props.accessibilityLabel).toBe(
        'Save stop',
      );
      expect(screen.getByLabelText('Cancel')).toBeTruthy();
      await screen.unmount();

      await renderEditor(editMode);
      expect(screen.getByText('Edit dates').props.accessibilityRole).toBe('header');
      expect(screen.getByTestId('stop-editor-save').props.accessibilityLabel).toBe(
        'Save dates',
      );
    });

    test('shows the picker first, with Save held back, and no dates until a city is chosen', async () => {
      await renderEditor();

      expect(screen.getByTestId('pick-florence')).toBeTruthy();
      expect(screen.queryByTestId('stop-editor-arrive')).toBeNull();
      expect(screen.queryByTestId('stop-editor-place')).toBeNull();
      expect(
        screen.getByTestId('stop-editor-save').props.accessibilityState,
      ).toMatchObject({ disabled: true });
    });

    // F6 (add-stop.png): the place is the pictured cream field with the flag, "Firenze" in
    // bold and ", Italy" after it, and a ROUND clear button, not a "Change" text button; it
    // keeps its id and its name "Change city" (pinned in stop-editor-pictured.test.tsx).
    test('shows the chosen place as one field: the city, the country after it, and a clear button named "Change city"', async () => {
      await renderEditor();
      await fireEvent.press(screen.getByTestId('pick-florence'));

      expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Firenze, Italy');
      const change = screen.getByTestId('stop-editor-change-city');
      expect(change.props.accessibilityLabel).toBe('Change city');
      expect(change.props.accessibilityRole).toBe('button');
      expect(screen.queryByTestId('pick-florence')).toBeNull();
    });

    test('reads title, place, dates, nights, Cancel, Save in that order', async () => {
      await renderEditor();
      await fireEvent.press(screen.getByTestId('pick-florence'));

      const order = screen
        .getAllByText(/^(Add stop|Place|Firenze, Italy|Dates|Nights|Cancel|Save stop)$/)
        .map((node) => (node.props.accessibilityLabel ?? node.props.children).toString());
      expect(order).toEqual([
        'Add stop',
        'Place',
        'Firenze, Italy',
        'Dates',
        'Nights',
        'Cancel',
        'Save stop',
      ]);
    });

    test('editing shows the place as a card with no picker and no way to change the city', async () => {
      await renderEditor(editMode);

      expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Roma');
      expect(screen.queryByTestId('stop-editor-change-city')).toBeNull();
      expect(screen.queryByTestId('pick-florence')).toBeNull();
      expect(screen.getByTestId('stop-editor-arrive')).toBeTruthy();
      expect(screen.getByTestId('stop-editor-depart')).toBeTruthy();
    });

    test('has one primary control in every state: Save (FR-005)', async () => {
      await renderEditor();
      expect(primaries()).toEqual(['stop-editor-save']);

      await fireEvent.press(screen.getByTestId('pick-florence'));
      expect(primaries()).toEqual(['stop-editor-save']);

      await pickDate('stop-editor-depart', new Date(2026, 4, 1));
      expect(screen.getByText('Departure can’t be before arrival.')).toBeTruthy();
      expect(primaries()).toEqual(['stop-editor-save']);
    });
  });

  describe('with the keyboard up (C4-10 rule 8; the keyboard-visibility test of every form)', () => {
    beforeEach(() => setWindow(PHONE_360X640));

    test('Save is in the footer, outside the scrolling body, and the footer rides up with the keyboard', async () => {
      await renderEditor(editMode);
      await showKeyboard();

      expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
      expect(screen.getByTestId('stop-editor-body').props.keyboardShouldPersistTaps).toBe(
        'handled',
      );
    });

    test('an invalid pair of dates still says why in words, and Save stays held back above the keyboard', async () => {
      await renderEditor(editMode);
      await showKeyboard();

      await pickDate('stop-editor-depart', new Date(2026, 4, 8));
      expect(screen.getByText('Departure can’t be before arrival.')).toBeTruthy();
      expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
      expect(
        screen.getByTestId('stop-editor-save').props.accessibilityState,
      ).toMatchObject({ disabled: true });
      await fireEvent.press(screen.getByTestId('stop-editor-save'));
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test('a valid pair saves from the footer, and Cancel is there too', async () => {
      await renderEditor(addMode);
      await showKeyboard();
      await fireEvent.press(screen.getByTestId('pick-florence'));

      expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
      expect(
        within(screen.getByTestId('stop-editor-footer')).getByTestId(
          'stop-editor-cancel',
        ),
      ).toBeTruthy();
      await fireEvent.press(screen.getByTestId('stop-editor-save'));
      expect(onSubmit).toHaveBeenCalledWith({
        city_id: 101,
        arrive_date: '2026-05-12',
        depart_date: '2026-05-13',
      });
    });
  });

  test('is composed from the adapter layer only: the form-sheet pattern, no retired primitive, no kit, no colour literal', () => {
    const source = (jest.requireActual('fs') as typeof import('fs')).readFileSync(
      require.resolve('@/components/trip/stop-editor'),
      'utf8',
    );
    expect(source).toMatch(/from '@\/components\/ui\/form-sheet'/);
    expect(source).toMatch(/host="modal"/);
    expect(source).not.toMatch(
      /ThemedText|ThemedView|TextField|\bSurface\b|PressableSurface|PillGroup|SafeAreaView/,
    );
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/Colors\[|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});

describe('<NotFoundScreen> — +not-found', () => {
  test('is a designed state, not a bare default (FR-027)', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByText('This page does not exist')).toBeTruthy();
  });

  test('links back to the root', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByTestId('link:/')).toBeTruthy();
    expect(screen.getByText('Back to your globe')).toBeTruthy();
  });
});

/**
 * T460 - FR-020: a saved trip or stop gives the success haptic, a confirmed removal the
 * warning, a failed write nothing, and none of it plays when the traveller asked for
 * reduced motion. The real `useHaptics` is under these, so what is read is `expo-haptics`
 * (a global stand-in, jest.setup.ts).
 */
describe('save and destructive-confirmation haptics (T460; FR-020)', () => {
  const haptics = jest.mocked(ExpoHaptics);
  const notified = () => haptics.notificationAsync.mock.calls.map(([kind]) => kind);

  beforeEach(() => {
    haptics.notificationAsync.mockClear();
    haptics.selectionAsync.mockClear();
  });
  afterEach(() => __resetAppearanceStoreForTests());

  async function saveTrip() {
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('add-trip-save'));
  }

  test('a saved trip plays the success haptic once, before the sheet is replaced', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'new-trip' });
    await render(<AddTripScreen />);
    await saveTrip();

    expect(mockReplace).toHaveBeenCalledWith('/trip/new-trip');
    expect(notified()).toEqual(['success']);
    expect(haptics.notificationAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0],
    );
  });

  test('a trip that failed to write, or was refused, plays no success haptic', async () => {
    mockActions.createTrip.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByTestId('add-trip-save'));
    await saveTrip();

    expect(screen.getByTestId('add-trip-error')).toBeTruthy();
    expect(notified()).not.toContain('success');
  });

  test('with reduced motion on, saving a trip plays no haptic at all', async () => {
    const reduced = jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'new-trip' });
    await render(<AddTripScreen />);
    await act(async () => undefined);
    await saveTrip();

    expect(mockReplace).toHaveBeenCalledWith('/trip/new-trip');
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    reduced.mockRestore();
  });
});
