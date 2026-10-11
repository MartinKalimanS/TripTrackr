/**
 * The keyboard and window helpers (`test/helpers/keyboard.ts`) that every form's
 * keyboard-visibility test is written with (feature 004, T434; contract C4-10 rule 8).
 * They are test infrastructure, so they have a test: a helper that quietly asserted
 * nothing would turn every form's rule-8 test into decoration.
 */
import { render, screen } from '@testing-library/react-native';
import { Text, View, useWindowDimensions } from 'react-native';
import { KeyboardController, useKeyboardState } from 'react-native-keyboard-controller';

import { FormSheet, type FormSheetProps } from '@/components/ui/form-sheet';

import {
  KEYBOARD_HEIGHT,
  PHONE_360X640,
  expectActionAboveKeyboard,
  hideKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from './keyboard';

afterEach(() => resetKeyboard());

function Probe() {
  const { isVisible, height } = useKeyboardState();
  const window = useWindowDimensions();
  return (
    <View testID="probe">
      <Text testID="keyboard">{isVisible ? `up ${height}` : 'down'}</Text>
      <Text testID="window">{`${window.width}x${window.height}`}</Text>
    </View>
  );
}

const actions = {
  testIDPrefix: 'demo',
  saveLabel: 'Save demo',
  onCancel: () => undefined,
  onSave: () => undefined,
};

async function renderSheet(props: Partial<FormSheetProps> = {}) {
  await render(
    <FormSheet testID="demo-sheet" title="Demo" actions={actions} {...props}>
      <Text>fields</Text>
    </FormSheet>,
  );
}

describe('showKeyboard, hideKeyboard', () => {
  test('re-render what reads the keyboard, as the real keyboard coming and going would', async () => {
    await render(<Probe />);
    expect(screen.getByTestId('keyboard')).toHaveTextContent('down');

    await showKeyboard();
    expect(screen.getByTestId('keyboard')).toHaveTextContent(`up ${KEYBOARD_HEIGHT}`);

    await showKeyboard(216);
    expect(screen.getByTestId('keyboard')).toHaveTextContent('up 216');

    await hideKeyboard();
    expect(screen.getByTestId('keyboard')).toHaveTextContent('down');
  });

  test('keep the library module in step with the hook', async () => {
    await showKeyboard();
    expect(KeyboardController.isVisible()).toBe(true);
    await hideKeyboard();
    expect(KeyboardController.isVisible()).toBe(false);
  });
});

describe('setWindow, resetKeyboard', () => {
  test('set the screen the form is laid out for, and put it back', async () => {
    setWindow(PHONE_360X640);
    await render(<Probe />);
    expect(screen.getByTestId('window')).toHaveTextContent('360x640');

    resetKeyboard();
    // A mounted hook keeps what it first read; a form rendered next reads the real window.
    await screen.unmount();
    await render(<Probe />);
    expect(screen.getByTestId('window')).not.toHaveTextContent('360x640');
  });

  test('forget a keyboard that was left up by the test before', async () => {
    await showKeyboard();
    resetKeyboard();
    await render(<Probe />);
    expect(screen.getByTestId('keyboard')).toHaveTextContent('down');
  });
});

describe('expectActionAboveKeyboard', () => {
  test('passes for a router form sheet with the keyboard up', async () => {
    setWindow(PHONE_360X640);
    await renderSheet();
    await showKeyboard();
    expectActionAboveKeyboard('demo-sheet', 'demo-save');
  });

  test('passes for an RN Modal form with the keyboard up', async () => {
    setWindow(PHONE_360X640);
    await renderSheet({ host: 'modal' });
    await showKeyboard();
    expectActionAboveKeyboard('demo-sheet', 'demo-save');
  });

  test('reads the body from `bodyTestID` when the sheet names it apart', async () => {
    setWindow(PHONE_360X640);
    await render(
      <FormSheet
        host="modal"
        testID="demo-sheet"
        bodyTestID="demo-scroll"
        title="Demo"
        actions={actions}>
        <Text testID="demo-sheet-body">a field named like the default body</Text>
      </FormSheet>,
    );
    await showKeyboard();

    expectActionAboveKeyboard('demo-sheet', 'demo-save', { bodyTestID: 'demo-scroll' });
  });

  test('looks for the action in the named body, and refuses one found there', async () => {
    setWindow(PHONE_360X640);
    await render(
      <FormSheet
        host="modal"
        testID="demo-sheet"
        bodyTestID="demo-scroll"
        title="Demo"
        actions={actions}>
        <Text testID="demo-save">an action that scrolls with the fields</Text>
      </FormSheet>,
    );
    await showKeyboard();

    expect(() =>
      expectActionAboveKeyboard('demo-sheet', 'demo-save', { bodyTestID: 'demo-scroll' }),
    ).toThrow();
  });

  test('refuses to pass with the keyboard down: there is nothing to be above', async () => {
    await renderSheet();
    expect(() => expectActionAboveKeyboard('demo-sheet', 'demo-save')).toThrow();
  });

  test('refuses an action that is not in the footer', async () => {
    await renderSheet();
    await showKeyboard();
    expect(() =>
      expectActionAboveKeyboard('demo-sheet', 'demo-cancel-missing'),
    ).toThrow();
  });

  test('refuses a sheet that is not capped to the room above the keyboard', async () => {
    setWindow(PHONE_360X640);
    await renderSheet();
    await showKeyboard();
    // The sheet was laid out for a 300 dp keyboard; claiming a taller one it did not
    // give up must fail, which is what stops the cap from being quietly removed.
    expect(() =>
      expectActionAboveKeyboard('demo-sheet', 'demo-save', { keyboardHeight: 500 }),
    ).toThrow();
  });
});
