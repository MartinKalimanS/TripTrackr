/**
 * T434 - the form sheet pattern (feature 004; contract C4-8 `FormActions`, C4-10 rules 5
 * and 8; FR-005, FR-009, FR-029, FR-030): a title, a scrolling body that keeps taps with the
 * keyboard up, and a footer with Cancel and Save that is never under the keyboard.
 *
 * Jest has no layout and no keyboard. What is asserted is every instruction the code gives
 * the platform: the style a view is given (`maxHeight`, `flexShrink`), the props of the
 * library's scroll and sticky views (the library's Jest double is a plain ScrollView and
 * View that keep their props), and the safe-area context the layout reads. How far the
 * platform lifts a sheet, and whether a handle is a good drag target, are device checks
 * (tasks.md T434 note).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { Platform, StyleSheet, Text as NativeText } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import {
  KEYBOARD_HEIGHT,
  PHONE_360X640,
  expectActionAboveKeyboard,
  hideKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../../../test/helpers/keyboard';

import {
  FOOTER_GAP,
  FormSheet,
  HEADER_BIG_TEXT,
  HEADER_MIN_HEIGHT,
  SHEET_TOP_GAP,
  formSheetOptions,
  sheetMaxHeight,
  type FormSheetProps,
} from './form-sheet';

const INSETS = { top: 24, bottom: 34, left: 0, right: 0 };
const hidden = { includeHiddenElements: true };

afterEach(() => resetKeyboard());

async function renderSheet(
  props: Partial<FormSheetProps> = {},
  children: React.ReactNode = <NativeText>fields</NativeText>,
) {
  const actions = {
    testIDPrefix: 'demo',
    saveLabel: 'Save demo',
    onCancel: jest.fn(),
    onSave: jest.fn(),
  };
  const view = await render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <FormSheet testID="demo-sheet" title="New demo" actions={actions} {...props}>
        {children}
      </FormSheet>
    </SafeAreaInsetsContext.Provider>,
  );
  return { view, actions: props.actions ?? actions };
}

const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

function bodyContent() {
  return screen.getByTestId('demo-sheet-body').props.contentContainerStyle;
}

/** The opaque view inside the footer that carries its padding and its fill. */
function footerContent() {
  const content = screen.getByTestId('demo-sheet-footer').children[0];
  if (!content || typeof content === 'string') throw new Error('footer has no content');
  return content;
}

describe('formSheetOptions - how the router presents a form (contract C4-11)', () => {
  test('is a form sheet that is as tall as its contents, with the platform grabber', () => {
    expect(formSheetOptions).toEqual({
      presentation: 'formSheet',
      sheetAllowedDetents: 'fitToContents',
      sheetGrabberVisible: true,
    });
  });
});

describe('sheetMaxHeight - the room a form may take', () => {
  test('is the window below the status bar, less the gap, with no keyboard', () => {
    expect(sheetMaxHeight({ windowHeight: 640, topInset: 24, keyboardHeight: 0 })).toBe(
      640 - 24 - SHEET_TOP_GAP,
    );
  });

  test('gives up the keyboard too, so the platform can lift the whole sheet above it', () => {
    expect(
      sheetMaxHeight({
        windowHeight: 640,
        topInset: 24,
        keyboardHeight: KEYBOARD_HEIGHT,
      }),
    ).toBe(640 - 24 - SHEET_TOP_GAP - KEYBOARD_HEIGHT);
  });

  test('never goes below a floor that still holds the title and the actions', () => {
    const floor = sheetMaxHeight({
      windowHeight: 100,
      topInset: 50,
      keyboardHeight: 400,
    });
    expect(floor).toBeGreaterThan(0);
    expect(sheetMaxHeight({ windowHeight: 0, topInset: 0, keyboardHeight: 0 })).toBe(
      floor,
    );
  });
});

describe('<FormSheet> - the parts and their order', () => {
  test('reads Cancel, title, fields, Save; the title is a heading, in the exact words given', async () => {
    await renderSheet();

    const title = screen.getByText('New demo');
    expect(title.props.accessibilityRole).toBe('header');
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    const order = screen
      .getAllByText(/New demo|fields|Cancel|Save demo/)
      .map((node) => String(node.props.children));
    expect(order).toEqual(['Cancel', 'New demo', 'fields', 'Save demo']);
  });

  test('forwards its testID to the root and names the body and the footer from it', async () => {
    await renderSheet();

    const body = screen.getByTestId('demo-sheet-body');
    const footer = screen.getByTestId('demo-sheet-footer');
    expect(screen.getByTestId('demo-sheet')).toBeTruthy();
    expect(within(body).getByText('fields')).toBeTruthy();
    expect(within(body).queryByText('New demo')).toBeNull();
    expect(within(footer).getByTestId('demo-save')).toBeTruthy();
    expect(within(footer).queryByTestId('demo-cancel')).toBeNull();
    const header = within(screen.getByTestId('demo-sheet-header'));
    expect(header.getByTestId('demo-cancel')).toBeTruthy();
    expect(header.getByText('New demo')).toBeTruthy();
  });

  test('bodyTestID names the scrolling body when a field already owns `<testID>-body`', async () => {
    await renderSheet(
      { bodyTestID: 'demo-sheet-scroll' },
      <NativeText testID="demo-sheet-body">a field</NativeText>,
    );

    const scroll = screen.getByTestId('demo-sheet-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getAllByTestId('demo-sheet-body')).toHaveLength(1);
    expect(within(scroll).getByTestId('demo-sheet-body')).toBeTruthy();
    expect(
      within(screen.getByTestId('demo-sheet-footer')).getByTestId('demo-save'),
    ).toBeTruthy();
  });

  test('bodyTestID names the body even where the sheet itself has no id', async () => {
    await renderSheet({ testID: undefined, bodyTestID: 'demo-scroll' });
    expect(screen.getByTestId('demo-scroll')).toBeTruthy();
  });

  test('without a testID the body and the footer have none either', async () => {
    await renderSheet({ testID: undefined });
    expect(screen.queryByTestId('demo-sheet-body')).toBeNull();
    expect(screen.getByTestId('demo-save')).toBeTruthy();
  });

  test('hands the actions to FormActions unchanged: ids, names, Save disabled, callbacks', async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    await renderSheet({
      actions: {
        testIDPrefix: 'stop-editor',
        saveLabel: 'Save stop',
        saveDisabled: true,
        onCancel,
        onSave,
      },
    });

    const save = screen.getByTestId('stop-editor-save');
    expect(save.props.accessibilityLabel).toBe('Save stop');
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await fireEvent.press(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  test('the footer is opaque, so nothing scrolls into view behind it', async () => {
    await renderSheet();
    expect(String(footerContent().props.className)).toContain('bg-background');
  });

  test('has one primary control: Save (FR-005)', async () => {
    await renderSheet();
    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.props.variant === 'primary'),
    ).toHaveLength(1);
  });
});

describe('<FormSheet> - the body scrolls and the footer does not', () => {
  test('keeps taps with the keyboard up, and is as tall as its fields until it has to scroll', async () => {
    await renderSheet();

    const body = screen.getByTestId('demo-sheet-body');
    expect(body.props.keyboardShouldPersistTaps).toBe('handled');
    expect(flat(body)).toMatchObject({ flexGrow: 0, flexShrink: 1 });
  });

  test('keeps the primary action in the footer, never in the body', async () => {
    await renderSheet();
    expect(
      within(screen.getByTestId('demo-sheet-body')).queryByTestId('demo-save'),
    ).toBeNull();
    expect(flat(screen.getByTestId('demo-sheet-footer')).flexShrink).not.toBe(1);
  });

  test('asks the keyboard-aware scroll view to keep a focused field clear of the footer', async () => {
    await renderSheet();
    const before = screen.getByTestId('demo-sheet-body').props.bottomOffset as number;
    expect(before).toBeGreaterThan(0);

    await fireEvent(screen.getByTestId('demo-sheet-footer'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 96 } },
    });
    expect(
      screen.getByTestId('demo-sheet-body').props.bottomOffset,
    ).toBeGreaterThanOrEqual(96);
  });
});

describe('<FormSheet host="form-sheet"> - the router lifts the sheet', () => {
  test('is capped to the window below the status bar, and not otherwise sized', async () => {
    setWindow(PHONE_360X640);
    await renderSheet();

    expect(flat(screen.getByTestId('demo-sheet')).maxHeight).toBe(
      sheetMaxHeight({ windowHeight: 640, topInset: INSETS.top, keyboardHeight: 0 }),
    );
    expect(screen.getByTestId('demo-sheet-footer').props.offset).toBeUndefined();
  });

  test('gives up the keyboard when it is up, and takes it back when it goes', async () => {
    setWindow(PHONE_360X640);
    await renderSheet();

    await showKeyboard();
    expect(flat(screen.getByTestId('demo-sheet')).maxHeight).toBe(
      sheetMaxHeight({
        windowHeight: 640,
        topInset: INSETS.top,
        keyboardHeight: KEYBOARD_HEIGHT,
      }),
    );

    await hideKeyboard();
    expect(flat(screen.getByTestId('demo-sheet')).maxHeight).toBe(
      sheetMaxHeight({ windowHeight: 640, topInset: INSETS.top, keyboardHeight: 0 }),
    );
  });

  test('keeps Save above the keyboard on the smallest phone (C4-10 rule 8)', async () => {
    setWindow(PHONE_360X640);
    await renderSheet();
    await showKeyboard();

    expectActionAboveKeyboard('demo-sheet', 'demo-save', { topInset: INSETS.top });
  });

  test('adds no bottom inset of its own: the platform pads a sheet for the home indicator', async () => {
    await renderSheet();
    expect(flat(footerContent()).paddingBottom).toBe(FOOTER_GAP);
  });

  test('is the default host', async () => {
    await renderSheet();
    expect(screen.getByTestId('demo-sheet-footer').props.offset).toBeUndefined();
    await renderSheet({ host: 'form-sheet' });
    expect(screen.getAllByTestId('demo-sheet-footer')[1]?.props.offset).toBeUndefined();
  });
});

describe('<FormSheet host="modal"> - an RN Modal does not move for the keyboard', () => {
  test('rides the footer up with the keyboard, handing back the bottom inset the keyboard covers', async () => {
    await renderSheet({ host: 'modal' });

    const footer = screen.getByTestId('demo-sheet-footer');
    expect(footer.props.offset).toEqual({ closed: 0, opened: INSETS.bottom });
    expect(footer.props.enabled).not.toBe(false);
  });

  test('pads the footer by the bottom inset itself, and fills the modal instead of capping itself', async () => {
    await renderSheet({ host: 'modal' });

    expect(flat(footerContent()).paddingBottom).toBe(FOOTER_GAP + INSETS.bottom);
    expect(flat(screen.getByTestId('demo-sheet')).maxHeight).toBeUndefined();
    expect(flat(screen.getByTestId('demo-sheet')).flex).toBe(1);
    expect(flat(screen.getByTestId('demo-sheet-body')).flexGrow).toBe(1);
  });

  test('keeps Save above the keyboard on the smallest phone (C4-10 rule 8)', async () => {
    setWindow(PHONE_360X640);
    await renderSheet({ host: 'modal' });
    await showKeyboard();

    expectActionAboveKeyboard('demo-sheet', 'demo-save');
  });

  test('works with no safe-area provider above it (a bare test render): the inset is zero', async () => {
    await render(
      <FormSheet
        host="modal"
        testID="bare"
        title="Bare"
        actions={{
          testIDPrefix: 'bare',
          saveLabel: 'Save bare',
          onCancel: jest.fn(),
          onSave: jest.fn(),
        }}>
        <NativeText>x</NativeText>
      </FormSheet>,
    );
    expect(screen.getByTestId('bare-footer').props.offset).toEqual({
      closed: 0,
      opened: 0,
    });
  });
});

describe('<FormSheet> - the handle (FR-009)', () => {
  test('on Android a router sheet draws its own handle, as the stack draws none there', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderSheet();
    os.restore();

    expect(screen.getByTestId('demo-sheet-handle', hidden)).toBeTruthy();
  });

  test('the handle is decoration: hidden from assistive technology and not a control', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderSheet();
    os.restore();

    const handle = screen.getByTestId('demo-sheet-handle', hidden);
    expect(handle.props.accessibilityElementsHidden).toBe(true);
    expect(handle.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(handle.props.accessible).not.toBe(true);
  });

  test('on iOS the sheet draws none: the native grabber is switched on in the options', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await renderSheet();
    os.restore();

    expect(screen.queryByTestId('demo-sheet-handle', hidden)).toBeNull();
  });

  test('an RN Modal draws none on either platform: a page sheet has its own', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderSheet({ host: 'modal' });
    os.restore();

    expect(screen.queryByTestId('demo-sheet-handle', hidden)).toBeNull();
  });
});

describe('<FormSheet> - the Sunrise form sheet (F6; UI-SPEC 3.6, form.png, add-expense.png)', () => {
  test('the header is Cancel at the left, the title centred, the trailing chip at the right', async () => {
    setWindow({ width: 390, height: 844 });
    await renderSheet({
      headerTrailing: <NativeText testID="chip">Only you</NativeText>,
    });

    const header = within(screen.getByTestId('demo-sheet-header'));
    const kids = header
      .getAllByText(/Cancel|New demo|Only you/)
      .map((n) => n.props.children);
    expect(kids).toEqual(['Cancel', 'New demo', 'Only you']);
    expect(flat(screen.getByTestId('demo-sheet-header')).minHeight).toBe(
      HEADER_MIN_HEIGHT,
    );
    expect(HEADER_MIN_HEIGHT).toBe(56);
    expect(String(screen.getByText('New demo').props.className)).toContain('text-center');
  });

  test('Cancel is a text button in the header; Save is the one primary, full width and 56 dp', async () => {
    await renderSheet();

    const cancel = screen.getByTestId('demo-cancel');
    expect(cancel.props.variant).toBe('ghost');
    const save = screen.getByTestId('demo-save');
    expect(save.props.variant).toBe('primary');
    expect(save.props.size).toBe('lg');
    expect(String(save.props.className)).toContain('self-stretch');
  });

  test('a subtitle stands under the title and stays at large text (F9: the note editor’s state line)', async () => {
    setWindow({ width: 390, height: 844 });
    await renderSheet({ headerSubtitle: <NativeText>On this device</NativeText> });
    const header = within(screen.getByTestId('demo-sheet-header'));
    expect(
      header.getAllByText(/Cancel|New demo|On this device/).map((n) => n.props.children),
    ).toEqual(['Cancel', 'New demo', 'On this device']);

    await screen.unmount();
    setWindow({ width: 390, height: 844, fontScale: HEADER_BIG_TEXT });
    await renderSheet({ headerSubtitle: <NativeText>On this device</NativeText> });
    expect(screen.getByText('On this device')).toBeTruthy();
  });

  test('a footer accessory is in the footer, above Save, outside the scrolling body', async () => {
    await renderSheet({
      footerAccessory: <NativeText testID="strip">strip</NativeText>,
    });
    const footer = within(screen.getByTestId('demo-sheet-footer'));
    expect(footer.getByTestId('strip')).toBeTruthy();
    expect(footer.getByTestId('demo-save')).toBeTruthy();
    expect(
      within(screen.getByTestId('demo-sheet-body')).queryByTestId('strip'),
    ).toBeNull();
  });

  test('without a subtitle or an accessory nothing extra is drawn', async () => {
    await renderSheet();
    expect(screen.queryByTestId('strip')).toBeNull();
  });

  test('from text scale 1.5 the trailing chip is dropped and the title keeps its room', async () => {
    setWindow({ width: 390, height: 844, fontScale: HEADER_BIG_TEXT });
    await renderSheet({ headerTrailing: <NativeText>Only you</NativeText> });

    expect(screen.queryByText('Only you')).toBeNull();
    expect(screen.getByText('New demo')).toBeTruthy();
    expect(screen.getByTestId('demo-cancel')).toBeTruthy();
  });

  test('below that scale the chip stays', async () => {
    setWindow({ width: 390, height: 844, fontScale: 1.49 });
    await renderSheet({ headerTrailing: <NativeText>Only you</NativeText> });
    expect(screen.getByText('Only you')).toBeTruthy();
  });

  test('the body and the footer are padded 20 dp at the sides, the body 8 dp at the top', async () => {
    await renderSheet();

    expect(flat({ props: { style: bodyContent() } })).toMatchObject({
      paddingHorizontal: 20,
      paddingTop: 8,
      gap: 16,
    });
    expect(flat(footerContent())).toMatchObject({
      paddingHorizontal: 20,
      paddingTop: 12,
    });
  });

  test('gap sets the space between the fields', async () => {
    await renderSheet({ gap: 24 });
    expect(flat({ props: { style: bodyContent() } }).gap).toBe(24);
  });

  test('there is no hairline above the footer by default', async () => {
    await renderSheet();
    expect(String(footerContent().props.className)).not.toContain('border-t');
  });

  test('footerRule draws a hairline above the footer', async () => {
    await renderSheet({ footerRule: true });
    expect(String(footerContent().props.className)).toContain(
      'border-t border-separator',
    );
  });

  test('the Android handle is 32 x 4 in the grab colour', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    await renderSheet();
    os.restore();

    const handle = screen.getByTestId('demo-sheet-handle', hidden);
    expect(flat(handle)).toMatchObject({ width: 32, height: 4 });
    expect(String(handle.props.className)).toContain('bg-grab');
  });

  test('Cancel in the header still reaches the caller, and stays reachable with the keyboard up', async () => {
    setWindow(PHONE_360X640);
    const { actions } = await renderSheet();
    await showKeyboard();

    await fireEvent.press(screen.getByTestId('demo-cancel'));
    expect(actions.onCancel).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByTestId('demo-sheet-body')).queryByTestId('demo-cancel'),
    ).toBeNull();
  });
});

describe('<FormSheet> - the source', () => {
  test('is composed from the adapter layer: no retired primitive, no kit, no colour literal', () => {
    const source = readFileSync(require.resolve('./form-sheet'), 'utf8');
    expect(source).not.toMatch(/ThemedText|ThemedView|\bSurface\b/);
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(source).not.toMatch(/use-appearance|Colors\[/);
  });
});
