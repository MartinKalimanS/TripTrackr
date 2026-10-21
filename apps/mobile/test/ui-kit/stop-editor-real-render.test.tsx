/**
 * 004 T437 - the stop editor and its city picker over the REAL `heroui-native` under Jest
 * (research D4-13).
 *
 * `test/app/trip-and-modal-screens.test.tsx` and `test/components/city-picker.test.tsx`
 * render them over the stand-in. This file puts the kit's own Field, ListGroup, Card and
 * Button underneath, so what the editor relies on is checked against the real components:
 * nothing throws (a raised surface inside another is a development error, and the picker
 * puts two groups and a flat card on one canvas), the ids and names land on the nodes a test
 * or a Maestro flow finds them by, and the form sheet's footer and body are where the
 * keyboard rule needs them. How a class LOOKS (the group's corner, the card's fill) is
 * Uniwind's, on a device.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import { StopEditor } from '@/components/trip/stop-editor';

import { classesOf } from '../helpers/host-nodes';
import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

const mockItaly = { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' };
const mockRome = {
  id: 100,
  country_id: 1,
  name: 'Roma',
  ascii_name: 'Roma',
  lat: 41.9,
  lng: 12.5,
  timezone: 'Europe/Rome',
  population: 2_800_000,
};
const mockForli = { ...mockRome, id: 103, name: 'Forlì', ascii_name: 'Forli' };

jest.mock('@/features/geography/use-geography', () => ({
  useCountries: () => ({
    data: { items: [mockItaly], offline: false },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCitySearch: () => ({
    data: { items: [mockRome, mockForli], offline: false },
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// editor: only that message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
const consoleError = console.error.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());
afterEach(() => resetKeyboard());

const onSubmit = jest.fn();

function renderEditor() {
  return render(
    <HeroUINativeProvider config={CONFIG}>
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: { depart_date: '2026-05-12' } }}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />
    </HeroUINativeProvider>,
  );
}

describe('the stop editor over the real kit', () => {
  test('renders the sheet with the country step: a Field, one group of rows, a footer', async () => {
    await renderEditor();

    expect(screen.getByTestId('stop-editor')).toBeTruthy();
    expect(classesOf(screen.getByTestId('stop-editor-frame'))).toContain('bg-background');
    const filter = screen.getByTestId('city-picker-country-filter');
    expect(filter.type).toBe('TextInput');
    expect(filter.props.accessibilityLabel).toBe('Country');

    const row = within(screen.getByTestId('city-picker-country-list')).getByTestId(
      'city-picker-country-IT',
    );
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Italy');
    expect(
      within(screen.getByTestId('stop-editor-footer')).getByTestId('stop-editor-save'),
    ).toBeTruthy();
  });

  test('walks the whole flow without a raised surface in another: country, city, the chosen card, the dates', async () => {
    await renderEditor();

    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    // Two groups and no card on the page: the change-country row and the results.
    const change = screen.getByTestId('city-picker-change-country');
    expect(change.props.accessibilityLabel).toBe('Country: Italy. Change country');
    expect(
      within(screen.getByTestId('city-picker-city-list')).getAllByRole('button'),
    ).toHaveLength(2);
    expect(screen.getByTestId('city-picker-city-query').props.accessibilityLabel).toBe(
      'City',
    );

    await fireEvent.press(screen.getByTestId('city-picker-city-100'));
    // One cream place field on the page ("Roma" in bold, ", Italy" after it: F6, add-stop.png),
    // and the dates under it.
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Roma, Italy');
    const changeCity = screen.getByTestId('stop-editor-change-city');
    expect(changeCity.props.accessibilityRole).toBe('button');
    expect(changeCity.props.accessibilityLabel).toBe('Change city');
    expect(screen.getByTestId('stop-editor-arrive')).toBeTruthy();
    expect(screen.getByTestId('stop-editor-depart')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('stop-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith({
      city_id: 100,
      arrive_date: '2026-05-12',
      depart_date: '2026-05-13',
    });
  });

  test('keeps Save in the footer above the keyboard with the kit underneath', async () => {
    setWindow(PHONE_360X640);
    await renderEditor();
    await showKeyboard();

    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    await fireEvent.changeText(screen.getByLabelText('City'), 'Ro');
    expectActionAboveKeyboard('stop-editor', 'stop-editor-save');
  });

  test('"Change city" returns to the country step', async () => {
    await renderEditor();
    await fireEvent.press(screen.getByTestId('city-picker-country-IT'));
    await fireEvent.press(screen.getByTestId('city-picker-city-103'));
    await fireEvent.press(screen.getByTestId('stop-editor-change-city'));

    expect(screen.getByTestId('city-picker-country-filter')).toBeTruthy();
    expect(screen.queryByTestId('stop-editor-arrive')).toBeNull();
  });
});
