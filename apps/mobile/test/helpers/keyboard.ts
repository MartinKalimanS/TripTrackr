/**
 * Keyboard and window simulation for form tests (feature 004, T434; contract C4-10 rule 8:
 * "a form's primary action is never under the keyboard").
 *
 *   afterEach(() => resetKeyboard());
 *   test('Save stays above the keyboard', async () => {
 *     setWindow(PHONE_360X640);
 *     await render(<AddTripScreen />);
 *     await showKeyboard();                       // 300 dp, the components re-render
 *     expectActionAboveKeyboard('add-trip-screen', 'add-trip-save');
 *   });
 *
 * Jest has no layout and no keyboard, so a form test cannot measure whether a button is
 * covered. What it CAN pin is every instruction the code gives the platform to keep it
 * clear, and that is what these helpers make easy:
 *
 * - `showKeyboard(height?)` and `hideKeyboard()` drive the library's own state hook
 *   (`useKeyboardState`, the one `FormSheet` reads) through a store the components subscribe
 *   to, so they re-render exactly as they would when the real keyboard comes up. The
 *   library's Jest double reports a keyboard that is never visible; this replaces only that
 *   one hook and leaves the rest of the double (the sticky view, the scroll view) alone.
 * - `setWindow(size)` is the screen the form is laid out for (`useWindowDimensions` reads
 *   it). `PHONE_360X640` is the smallest phone the app is held to (003 FR-017, 004 FR-009).
 * - `expectActionAboveKeyboard(sheetTestID, actionTestID)` is the rule-8 assertion for a
 *   `FormSheet`: with the keyboard up, the action is in the footer and NOT in the scrolling
 *   body (so it can neither scroll away nor sit below the fold), and the form itself has
 *   been told how to stay clear: a router form sheet is capped to the room above the
 *   keyboard (the platform lifts the sheet by the keyboard's height), an RN `Modal` form's
 *   footer is a sticky view that rides up with the keyboard. A sheet that named its body
 *   apart (`bodyTestID`, because a field owns `<id>-body`) passes the same id here.
 * - `resetKeyboard()` puts everything back; call it in `afterEach`.
 */
import { act, screen, within } from '@testing-library/react-native';
import { useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';
import * as KeyboardController from 'react-native-keyboard-controller';

import { sheetMaxHeight } from '@/components/ui/form-sheet';

export type WindowSize = {
  width: number;
  height: number;
  scale?: number;
  fontScale?: number;
};

/** The smallest phone the forms are held to, at the default text size. */
export const PHONE_360X640: WindowSize = { width: 360, height: 640 };
/** A typical software keyboard, in dp. */
export const KEYBOARD_HEIGHT = 300;

type Snapshot = ReturnType<typeof KeyboardController.KeyboardController.state> & {
  isVisible: boolean;
};

const HIDDEN: Snapshot = {
  height: 0,
  duration: 0,
  timestamp: 0,
  target: 0,
  type: 'default',
  appearance: 'light',
  isVisible: false,
};

let snapshot: Snapshot = HIDDEN;
const listeners = new Set<() => void>();
let windowSpy: jest.SpyInstance | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const read = () => snapshot;

/**
 * Swaps the double's constant `useKeyboardState` for one that follows this store. It runs
 * when this module is imported, so a component rendered before the first `showKeyboard` is
 * already subscribed to it, and again in `resetKeyboard`, so a suite that resets every mock
 * between tests does not leave the next one with a hook that answers nothing.
 */
function install() {
  jest.mocked(KeyboardController.useKeyboardState).mockImplementation(((
    selector?: (state: Snapshot) => unknown,
  ) => {
    const state = useSyncExternalStore(subscribe, read);
    return selector ? selector(state) : state;
  }) as never);
}
install();

async function publish(next: Snapshot) {
  snapshot = next;
  jest
    .mocked(KeyboardController.KeyboardController.isVisible)
    .mockReturnValue(next.isVisible);
  await act(async () => {
    listeners.forEach((listener) => listener());
  });
}

/** The keyboard comes up at `height` dp; every component that reads it re-renders. */
export function showKeyboard(height: number = KEYBOARD_HEIGHT) {
  return publish({ ...HIDDEN, height, isVisible: true });
}

/** The keyboard goes away. */
export function hideKeyboard() {
  return publish(HIDDEN);
}

/** The screen the form is laid out on (what `useWindowDimensions` reports). */
export function setWindow({ width, height, scale = 3, fontScale = 1 }: WindowSize) {
  windowSpy?.mockRestore();
  const dimensions = { width, height, scale, fontScale };
  windowSpy = jest.spyOn(Dimensions, 'get').mockReturnValue(dimensions);
}

/** Puts the window and the keyboard back as the setup file leaves them. */
export function resetKeyboard() {
  windowSpy?.mockRestore();
  windowSpy = null;
  snapshot = HIDDEN;
  listeners.clear();
  install();
  jest.mocked(KeyboardController.KeyboardController.isVisible).mockReturnValue(false);
}

type ClearanceOptions = {
  /** What the sheet is laid out for; default is the window `setWindow` last set. */
  windowHeight?: number;
  /** The top safe-area inset the test supplied to the sheet; default 0. */
  topInset?: number;
  /** The keyboard's height, when the test showed one. */
  keyboardHeight?: number;
  /** The id the sheet gave its scrolling body, when it is not `<sheetTestID>-body`. */
  bodyTestID?: string;
};

/**
 * Rule 8 for a `FormSheet` (see the file header). `sheetTestID` is the id given to the
 * sheet, `actionTestID` the primary action (the Save button). Call it with the keyboard up.
 */
export function expectActionAboveKeyboard(
  sheetTestID: string,
  actionTestID: string,
  options: ClearanceOptions = {},
) {
  const { height: windowHeight } = Dimensions.get('window');
  const {
    topInset = 0,
    keyboardHeight = snapshot.height,
    windowHeight: given = windowHeight,
    bodyTestID = `${sheetTestID}-body`,
  } = options;

  expect(snapshot.isVisible).toBe(true);

  const body = screen.getByTestId(bodyTestID);
  const footer = screen.getByTestId(`${sheetTestID}-footer`);
  expect(within(body).queryByTestId(actionTestID)).toBeNull();
  expect(within(footer).getByTestId(actionTestID)).toBeTruthy();

  const sheet = screen.getByTestId(sheetTestID);
  const style = flatten(sheet.props.style);
  if (footer.props.offset !== undefined) {
    // An RN `Modal` form: the footer rides up with the keyboard and is enabled.
    expect(footer.props.enabled).not.toBe(false);
  } else {
    // A router form sheet: the platform lifts the sheet by the keyboard's height, so the
    // form is capped to the room above the keyboard and the footer is always in it.
    const cap = sheetMaxHeight({
      windowHeight: given,
      topInset,
      keyboardHeight,
    });
    expect(style.maxHeight).toBe(cap);
    expect(style.maxHeight).toBeLessThanOrEqual(given - keyboardHeight);
  }
}

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
}
