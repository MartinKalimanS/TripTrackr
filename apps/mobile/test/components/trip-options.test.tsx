/**
 * Trip options (spec 015, User Story 1; FR-001 to FR-003). One rule per test:
 *
 * - the sheet opens on the trip's own name and currency and saves what was changed;
 * - an empty name is refused in words and nothing is saved;
 * - Delete asks first, in words that name the trip and what goes with it;
 * - only the confirmation deletes; "Keep trip" returns to the options;
 * - Save stays above the keyboard (contract C4-10 rule 8).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TripOptions } from '@/components/trip/trip-options';

import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

const trip = { id: 't1', title: 'Portugal Road Trip', home_currency: 'EUR' };

async function open(overrides: Partial<Parameters<typeof TripOptions>[0]> = {}) {
  const onSave = jest.fn();
  const onDelete = jest.fn();
  const onClose = jest.fn();
  await render(
    <TripOptions
      visible
      trip={trip}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onDelete, onClose };
}

afterEach(() => resetKeyboard());

describe('TripOptions', () => {
  test('opens on the trip and saves a new name', async () => {
    const { onSave } = await open();
    expect(screen.getByTestId('trip-options-title').props.value).toBe(trip.title);

    await fireEvent.changeText(
      screen.getByTestId('trip-options-title'),
      '  Portugal 2026 ',
    );
    await fireEvent.press(screen.getByTestId('trip-options-save'));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: 'Portugal 2026',
        home_currency: 'EUR',
      }),
    );
  });

  test('an empty name is refused in words and nothing is saved', async () => {
    const { onSave } = await open();

    await fireEvent.changeText(screen.getByTestId('trip-options-title'), '   ');
    await fireEvent.press(screen.getByTestId('trip-options-save'));

    expect(await screen.findByText('Give your trip a name.')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('Delete asks first, naming the trip and what goes with it', async () => {
    const { onDelete } = await open();

    await fireEvent.press(screen.getByTestId('trip-options-delete'));

    expect(screen.getByText('Delete “Portugal Road Trip”?')).toBeTruthy();
    expect(
      screen.getByText(
        'Its stops, photos, notes, expenses and documents are deleted with it. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('only the confirmation deletes; Keep trip goes back to the options', async () => {
    const { onDelete } = await open();

    await fireEvent.press(screen.getByTestId('trip-options-delete'));
    await fireEvent.press(screen.getByTestId('trip-options-delete-keep'));
    expect(screen.getByTestId('trip-options-title')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('trip-options-delete'));
    await fireEvent.press(screen.getByTestId('trip-options-delete-confirm'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test('renders nothing while closed', async () => {
    await open({ visible: false });

    expect(screen.queryByTestId('trip-options-title')).toBeNull();
  });

  test('Save stays above the keyboard', async () => {
    setWindow(PHONE_360X640);
    await open();

    await showKeyboard();

    expectActionAboveKeyboard('trip-options', 'trip-options-save');
  });
});
