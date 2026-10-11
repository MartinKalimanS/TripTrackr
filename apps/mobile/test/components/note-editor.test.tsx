/**
 * 004 T438 - the note editor as a form sheet (feature 004; contract C4-8 `Field`,
 * `FormActions`, C4-10 rules 5 and 8, C4-11; FR-005, FR-009, FR-025, FR-029, FR-030, FR-037;
 * research D4-06, D-24).
 *
 * The editor is not a route: the notes screen opens it as a React Native `Modal` (a page
 * sheet on iOS), so it is the `FormSheet` pattern with `host="modal"`. What its behaviour is
 * (the form, the wire shape, the move of FR-018) is pinned in `us2-components.test.tsx` and
 * `us2-screens.test.tsx`; this file pins what T438 changed and what stays: the sheet's parts
 * and their order, every id and name, the fields as `Field`s with their errors in words,
 * the one primary, and the keyboard-visibility test of the form (C4-10 rule 8): with the
 * keyboard up on the smallest phone, Save is in the footer, outside the scrolling body, and
 * the footer rides the keyboard.
 *
 * Jest has no layout and no keyboard. What is asserted is every instruction the code gives
 * the platform (see `test/helpers/keyboard.ts`); how far a page sheet lifts, and whether the
 * sticky footer lands on the keyboard on both platforms, are device checks (tasks.md T438).
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { NoteEditor, type NoteEditorProps } from '@/components/trip/note-editor';
import { fieldMinHeight } from '@/components/ui/field';
import { FOOTER_GAP } from '@/components/ui/form-sheet';
import type { AnchorTarget } from '@/features/notes/use-move-note';

import { hostsWhere } from '../helpers/host-nodes';
import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

const targets: AnchorTarget[] = [
  {
    level: 'trip',
    key: 'country:1',
    label: 'Whole trip (Italy)',
    country_id: 1,
    city_id: null,
  },
  { level: 'city', key: 'city:100', label: 'Roma, Italy', country_id: 1, city_id: 100 },
];

const INSETS = { top: 24, bottom: 34, left: 0, right: 0 };
const BODY = 'note-editor-scroll';
const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

afterEach(() => resetKeyboard());

async function renderEditor(props: Partial<NoteEditorProps> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  const view = await render(
    <SafeAreaInsetsContext.Provider value={INSETS}>
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...props}
      />
    </SafeAreaInsetsContext.Provider>,
  );
  return { view, onSubmit, onCancel };
}

const editMode: NoteEditorProps['mode'] = {
  kind: 'edit',
  note: { title: 'Cheese', body: 'Raclette.', country_id: 1, city_id: 100 },
};

describe('<NoteEditor> presentation - a page sheet over the notes screen (D4-06)', () => {
  test('is a React Native Modal: a page sheet on iOS, sliding up', async () => {
    await renderEditor();

    const [modal, ...others] = hostsWhere((node) => node.type === 'Modal');
    expect(others).toEqual([]);
    expect(modal?.props.presentationStyle).toBe('pageSheet');
    expect(modal?.props.animationType).toBe('slide');
    expect(modal?.props.visible).toBe(true);
  });

  test('the system back gesture closes it like Cancel', async () => {
    const { onCancel } = await renderEditor();

    const modal = hostsWhere((node) => node.type === 'Modal')[0];
    (modal?.props.onRequestClose as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('draws nothing while closed, and a cancelled draft does not linger when it opens again', async () => {
    const { view, onSubmit, onCancel } = await renderEditor();
    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'Never mind');

    await view.rerender(
      <NoteEditor
        visible={false}
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.queryByTestId('note-editor')).toBeNull();

    await view.rerender(
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('note-editor-body').props.value).toBe('');
  });
});

describe('<NoteEditor> is the shared form sheet - parts, ids and order (FR-009, FR-037)', () => {
  test('the root keeps `note-editor`; the scrolling body is named apart, so the Note field keeps `note-editor-body`', async () => {
    await renderEditor();

    expect(screen.getByTestId('note-editor')).toBeTruthy();
    const body = screen.getAllByTestId('note-editor-body');
    expect(body).toHaveLength(1);
    expect(body[0]?.type).toBe('TextInput');
    expect(screen.getByTestId(BODY).props.keyboardShouldPersistTaps).toBe('handled');
  });

  test('the title is a heading in the words of before, for a new note and for an edit', async () => {
    await renderEditor();
    expect(screen.getByText('New note').props.accessibilityRole).toBe('header');

    await screen.unmount();
    await renderEditor({ mode: editMode });
    expect(screen.getByText('Edit note').props.accessibilityRole).toBe('header');
    expect(screen.queryByText('New note')).toBeNull();
  });

  test('the fields scroll in the body; Cancel and Save are in the footer, outside it', async () => {
    await renderEditor();

    const body = within(screen.getByTestId(BODY));
    expect(body.getByTestId('note-editor-anchor')).toBeTruthy();
    expect(body.getByTestId('note-editor-title')).toBeTruthy();
    expect(body.getByTestId('note-editor-body')).toBeTruthy();
    expect(body.queryByTestId('note-editor-save')).toBeNull();
    expect(body.queryByTestId('note-editor-cancel')).toBeNull();

    const footer = within(screen.getByTestId('note-editor-footer'));
    expect(footer.getByTestId('note-editor-cancel')).toBeTruthy();
    expect(footer.getByTestId('note-editor-save')).toBeTruthy();
  });

  test('reads the heading, the anchor, the title, the note, Cancel and Save, in that order', async () => {
    await renderEditor();

    const words = screen
      .getAllByText(/^(New note|Filed under|Title \(optional\)|Note|Cancel|Save note)$/)
      .map((node) => String(node.props.children));
    expect(words).toEqual([
      'New note',
      'Filed under',
      'Title (optional)',
      'Note',
      'Cancel',
      'Save note',
    ]);

    const ids = screen
      .getAllByTestId(/^note-editor-(anchor|title|body|cancel|save)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'note-editor-anchor',
      'note-editor-title',
      'note-editor-body',
      'note-editor-cancel',
      'note-editor-save',
    ]);
  });

  test('an edit names the anchor control as a move, as before', async () => {
    await renderEditor({ mode: editMode });
    expect(screen.getByText('Filed under (change to move)')).toBeTruthy();
  });

  test('an edit of an untitled note starts with an empty title field', async () => {
    await renderEditor({
      mode: {
        kind: 'edit',
        note: { title: null, body: 'Raclette.', country_id: 1, city_id: null },
      },
    });
    expect(screen.getByTestId('note-editor-title').props.value).toBe('');
    expect(screen.getByTestId('anchor-country:1').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );
  });

  test('an edit of a note whose place is no longer a stop has no anchor chosen, and Save asks for one in words', async () => {
    const { onSubmit } = await renderEditor({
      mode: {
        kind: 'edit',
        note: { title: null, body: 'Raclette.', country_id: 9, city_id: 900 },
      },
    });
    for (const key of ['anchor-country:1', 'anchor-city:100']) {
      expect(screen.getByTestId(key).props.accessibilityState).toMatchObject({
        selected: false,
      });
    }

    await fireEvent.press(screen.getByTestId('note-editor-save'));

    expect(screen.getByText(/Choose where this note belongs/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('Save is the one primary control; Cancel is not (FR-005)', async () => {
    await renderEditor();

    const primaries = screen
      .getAllByRole('button')
      .filter((node) => node.props.variant === 'primary')
      .map((node) => node.props.testID);
    expect(primaries).toEqual(['note-editor-save']);
    expect(screen.getByTestId('note-editor-save').props.accessibilityLabel).toBe(
      'Save note',
    );
    expect(screen.getByTestId('note-editor-cancel').props.accessibilityLabel).toBe(
      'Cancel',
    );
  });
});

describe('<NoteEditor> fields - Field, with the behaviour of before (FR-024, FR-025)', () => {
  test('the title field is named by its label and keeps its limits and hint text', async () => {
    await renderEditor();

    const title = screen.getByTestId('note-editor-title');
    expect(title.props.accessibilityLabel).toBe('Title (optional)');
    expect(title.props.placeholder).toBe('Cheese');
    expect(title.props.maxLength).toBe(200);
    expect(title.props.autoCapitalize).toBe('sentences');
    expect(title.props.multiline).toBeUndefined();
  });

  test('the note field is a multiline input that starts at the top and asks for six lines', async () => {
    setWindow(PHONE_360X640); // Jest's own window has a font scale of 2
    await renderEditor();

    const body = screen.getByTestId('note-editor-body');
    expect(body.props.accessibilityLabel).toBe('Note');
    expect(body.props.placeholder).toBe('Try the raclette in Valais.');
    expect(body.props.multiline).toBe(true);
    expect(body.props.textAlignVertical).toBe('top');
    expect(body.props.numberOfLines).toBe(6);
    expect(body.props.autoCapitalize).toBe('sentences');
    expect(flat(body).minHeight).toBe(fieldMinHeight(1, 6));
  });

  test('at the largest text size the note field grows with the text instead of clipping (FR-029)', async () => {
    // iOS goes to about 3.1 at its largest accessibility size, Android to 2.
    setWindow({ ...PHONE_360X640, fontScale: 3 });
    await renderEditor();

    const body = flat(screen.getByTestId('note-editor-body')).minHeight as number;
    expect(body).toBe(fieldMinHeight(3, 6));
    expect(body).toBe(3 * fieldMinHeight(1, 6));
    expect(flat(screen.getByTestId('note-editor-title')).minHeight).toBe(
      fieldMinHeight(3),
    );
  });

  test('typing reaches the form, and what is submitted is the wire shape of before', async () => {
    const { onSubmit } = await renderEditor();

    await fireEvent.changeText(screen.getByTestId('note-editor-title'), ' Cheese ');
    await fireEvent.changeText(
      screen.getByTestId('note-editor-body'),
      'Try the raclette.',
    );
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    await fireEvent.press(screen.getByTestId('note-editor-save'));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Cheese',
      body: 'Try the raclette.',
      country_id: 1,
      city_id: 100,
    });
  });

  test('an empty note is refused in words under the field, as an alert, and not by colour alone', async () => {
    const { onSubmit } = await renderEditor();

    await fireEvent.press(screen.getByTestId('note-editor-save'));

    const alert = screen.getByTestId('note-editor-body-error');
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert).toHaveTextContent('Write something first.');
    expect(screen.getByTestId('note-editor-body').props['aria-invalid']).toBe(true);
    expect(screen.getByTestId('note-editor-title').props['aria-invalid']).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('with no stops the anchor says why in words, and Save refuses in words too', async () => {
    const { onSubmit } = await renderEditor({ targets: [] });
    expect(screen.getByText(/Add a stop to this trip first/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'x');
    await fireEvent.press(screen.getByTestId('note-editor-save'));

    expect(screen.getByText(/Choose where this note belongs/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('a failed save is an InlineError alert after the fields, before the footer', async () => {
    await renderEditor({ error: 'We could not save the note on this device.' });

    const alert = screen.getByTestId('note-editor-error');
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(screen.getByText('We could not save the note on this device.')).toBeTruthy();
    expect(within(screen.getByTestId(BODY)).getByTestId('note-editor-error')).toBe(alert);

    const ids = screen
      .getAllByTestId(/^note-editor-(body|error|cancel|save)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'note-editor-body',
      'note-editor-error',
      'note-editor-cancel',
      'note-editor-save',
    ]);
  });

  test('no error, no alert: a clean form announces nothing', async () => {
    await renderEditor();
    expect(screen.queryByTestId('note-editor-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('<NoteEditor> with the keyboard up (C4-10 rule 8; the keyboard-visibility test of this form)', () => {
  beforeEach(() => setWindow(PHONE_360X640));

  test('Save is in the footer, outside the scrolling body, and the footer rides the keyboard up', async () => {
    await renderEditor();
    await showKeyboard();

    expectActionAboveKeyboard('note-editor', 'note-editor-save', { bodyTestID: BODY });
    expect(screen.getByTestId('note-editor-footer').props.offset).toEqual({
      closed: 0,
      opened: INSETS.bottom,
    });
  });

  test('the last field can be filled and Save submits it, with the keyboard still up', async () => {
    const { onSubmit } = await renderEditor();
    await showKeyboard();

    await fireEvent.changeText(screen.getByLabelText('Note'), 'Gelato at Vivoli.');
    expectActionAboveKeyboard('note-editor', 'note-editor-save', { bodyTestID: BODY });
    await fireEvent.press(screen.getByTestId('note-editor-save'));

    expect(onSubmit).toHaveBeenCalledWith({
      title: null,
      body: 'Gelato at Vivoli.',
      country_id: 1,
      city_id: null,
    });
  });

  test('an invalid submit with the keyboard up still says why, and Save stays where it was', async () => {
    await renderEditor();
    await showKeyboard();

    await fireEvent.press(screen.getByTestId('note-editor-save'));

    expect(screen.getByText('Write something first.')).toBeTruthy();
    expectActionAboveKeyboard('note-editor', 'note-editor-save', { bodyTestID: BODY });
  });

  test('a failed save shows its error with the keyboard up and Save is still above it', async () => {
    await renderEditor({ error: 'We could not save the note on this device.' });
    await showKeyboard();

    expect(screen.getByTestId('note-editor-error')).toBeTruthy();
    expectActionAboveKeyboard('note-editor', 'note-editor-save', { bodyTestID: BODY });
  });

  test('an edit keeps Save above the keyboard too, with its text in the fields', async () => {
    const { onSubmit } = await renderEditor({ mode: editMode });
    await showKeyboard();

    expect(screen.getByTestId('note-editor-body').props.value).toBe('Raclette.');
    expectActionAboveKeyboard('note-editor', 'note-editor-save', { bodyTestID: BODY });
    await fireEvent.press(screen.getByTestId('note-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Cheese',
      body: 'Raclette.',
      country_id: 1,
      city_id: 100,
    });
  });

  test('the body keeps taps with the keyboard up, so an anchor is chosen by one tap', async () => {
    const { onSubmit } = await renderEditor();
    await showKeyboard();

    expect(screen.getByTestId(BODY).props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'x');
    await fireEvent.press(screen.getByTestId('note-editor-save'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ country_id: 1, city_id: 100 }),
    );
  });

  test('the footer is padded for the home indicator, which the keyboard covers anyway', async () => {
    await renderEditor();

    const footer = screen.getByTestId('note-editor-footer');
    const content = footer.children[0];
    if (!content || typeof content === 'string') throw new Error('footer has no content');
    expect(flat(content).paddingBottom).toBe(FOOTER_GAP + INSETS.bottom);
  });

  test('a focused field is scrolled clear of the footer, measured not guessed', async () => {
    await renderEditor();
    await showKeyboard();
    expect(screen.getByTestId(BODY).props.bottomOffset).toBeGreaterThan(0);

    await fireEvent(screen.getByTestId('note-editor-footer'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 96 } },
    });
    expect(screen.getByTestId(BODY).props.bottomOffset).toBeGreaterThanOrEqual(96);
  });

  test('the sheet fills the page sheet instead of capping itself: nothing lifts an RN Modal', async () => {
    await renderEditor();
    await showKeyboard();

    const sheet = flat(screen.getByTestId('note-editor'));
    expect(sheet.flex).toBe(1);
    expect(sheet.maxHeight).toBeUndefined();
  });
});

describe('<NoteEditor> - the source', () => {
  test('is composed from the adapter layer: no retired primitive, no kit, no colour literal', () => {
    const source = readFileSync(require.resolve('@/components/trip/note-editor'), 'utf8');
    expect(source).not.toMatch(
      /PressableSurface|ThemedText|ThemedView|\bSurface\b|\bTextField\b|PillGroup/,
    );
    expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|Colors\[/);
    expect(source).not.toMatch(/from '@\/constants\/theme'/);
  });
});
