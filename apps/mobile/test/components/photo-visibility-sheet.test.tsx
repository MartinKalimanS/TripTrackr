/**
 * The "who can see these photos?" sheet — spec 006 T607 (FR-006 to FR-010, FR-014; User Story 2;
 * plan D6-07).
 *
 * A state-driven form: a `FormSheet host="modal"` inside a `FormModal`, mounted only while photos
 * wait for the answer. What these pin: the title (singular for one), Private selected by default,
 * two radios in a radio group with names and checked state, the words the owner asked for and the
 * honest line about sharing, one primary "Add N photos", the choice reaching `onChoose`, and every
 * way out (Close, the swipe, Android's Back, a tap outside: all `onRequestClose`) reaching
 * `onDismiss`, which the hook turns into private. Jest has no layout: what the sheet looks like
 * and how it swipes are device checks (quickstart.md, section 2).
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { PhotoVisibilitySheet } from '@/components/trip/photo-visibility-sheet';
import { VISIBILITY_COPY } from '@/features/photos/photo-copy';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';

import { scrollers } from '../helpers/host-nodes';
import {
  TEXT_SCALES,
  fixedHeightTextContainers,
  phoneAtFontScale,
} from '../helpers/text-scale';

const hidden = { includeHiddenElements: true };

afterEach(() => {
  jest.restoreAllMocks();
  __resetAppearanceStoreForTests();
});

async function renderSheet(count: number | null = 3) {
  const onChoose = jest.fn();
  const onDismiss = jest.fn();
  const view = await render(
    <PhotoVisibilitySheet
      prompt={count === null ? null : { count }}
      onChoose={onChoose}
      onDismiss={onDismiss}
    />,
  );
  return { view, onChoose, onDismiss };
}

const radio = (id: 'private' | 'public') =>
  screen.getByTestId(`photo-visibility-${id}`, hidden);
const checked = (id: 'private' | 'public') =>
  radio(id).props.accessibilityState?.checked === true;

describe('<PhotoVisibilitySheet> - what it asks', () => {
  test('asks "Who can see these photos?", and "this photo?" for one', async () => {
    const { view } = await renderSheet(3);
    expect(screen.getByText('Who can see these photos?')).toBeTruthy();

    await view.rerender(
      <PhotoVisibilitySheet
        prompt={{ count: 1 }}
        onChoose={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Who can see this photo?')).toBeTruthy();
    expect(screen.queryByText('Who can see these photos?')).toBeNull();
  });

  test('the title is a heading', async () => {
    await renderSheet(2);
    expect(
      screen.getByRole('header', { name: 'Who can see these photos?' }),
    ).toBeTruthy();
  });

  test('Private says "Only you"; Public says what it can do and what is not shared yet', async () => {
    await renderSheet(2);

    const priv = within(radio('private'));
    expect(priv.getByText('Private')).toBeTruthy();
    expect(priv.getByText('Only you')).toBeTruthy();
    const pub = within(radio('public'));
    expect(pub.getByText('Public')).toBeTruthy();
    expect(pub.getByText('Can appear on a trip you choose to share')).toBeTruthy();
    expect(pub.getByText('Nothing is shared until you publish a trip')).toBeTruthy();
  });

  test('says in one short line that sharing is not available yet, and what closing does', async () => {
    await renderSheet(2);

    const note = screen.getByTestId('photo-visibility-note', hidden);
    expect(note).toHaveTextContent(VISIBILITY_COPY.note);
    expect(VISIBILITY_COPY.note).toMatch(/isn’t available yet/);
    expect(VISIBILITY_COPY.note).toMatch(/only you can see a public photo/);
    expect(VISIBILITY_COPY.note).toMatch(/adds the photos as private/);
    expect(VISIBILITY_COPY.note.length).toBeLessThanOrEqual(130);
  });

  test('never promises that anyone else sees a public photo now', async () => {
    await renderSheet(2);

    const everything = JSON.stringify(screen.toJSON());
    expect(everything).not.toMatch(
      /everyone|anyone can see|visible to (all|others)|shared with/i,
    );
  });

  test('one primary: "Add N photos", and "Add 1 photo" for one', async () => {
    const { view } = await renderSheet(3);
    const confirm = screen.getByTestId('photo-visibility-confirm', hidden);
    expect(confirm.props.accessibilityLabel).toBe('Add 3 photos');
    expect(confirm.props.variant).toBe('primary');
    expect(
      screen.getAllByRole('button', hidden).filter((b) => b.props.variant === 'primary'),
    ).toHaveLength(1);

    await view.rerender(
      <PhotoVisibilitySheet
        prompt={{ count: 1 }}
        onChoose={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(
      screen.getByTestId('photo-visibility-confirm', hidden).props.accessibilityLabel,
    ).toBe('Add 1 photo');
  });
});

describe('<PhotoVisibilitySheet> - the choice', () => {
  test('Private is selected by default and Public is not', async () => {
    await renderSheet(2);

    expect(checked('private')).toBe(true);
    expect(checked('public')).toBe(false);
  });

  test('a radio group holds two radios, each named, with its checked state', async () => {
    await renderSheet(2);

    const group = screen.getByTestId('photo-visibility-options', hidden);
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Who can see these photos?');
    expect(radio('private').props).toMatchObject({
      accessibilityRole: 'radio',
      accessibilityLabel: 'Private. Only you',
      accessibilityState: expect.objectContaining({ checked: true, selected: true }),
    });
    expect(radio('public').props).toMatchObject({
      accessibilityRole: 'radio',
      accessibilityLabel:
        'Public. Can appear on a trip you choose to share. Nothing is shared until you publish a trip',
      accessibilityState: expect.objectContaining({ checked: false, selected: false }),
    });
    expect(within(group).getAllByRole('radio', hidden)).toHaveLength(2);
  });

  test('selecting Public checks it and unchecks Private, and back', async () => {
    await renderSheet(2);

    await fireEvent.press(radio('public'));
    expect([checked('private'), checked('public')]).toEqual([false, true]);

    await fireEvent.press(radio('private'));
    expect([checked('private'), checked('public')]).toEqual([true, false]);
  });

  test('"Add N photos" with the default chooses private', async () => {
    const { onChoose, onDismiss } = await renderSheet(3);

    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('private');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test('"Add N photos" after selecting Public chooses public', async () => {
    const { onChoose } = await renderSheet(3);

    await fireEvent.press(radio('public'));
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    expect(onChoose).toHaveBeenCalledWith('public');
  });

  test('a choice made and changed back is private again', async () => {
    const { onChoose } = await renderSheet(3);

    await fireEvent.press(radio('public'));
    await fireEvent.press(radio('private'));
    await fireEvent.press(screen.getByTestId('photo-visibility-confirm', hidden));

    expect(onChoose).toHaveBeenCalledWith('private');
  });

  test('every opening starts on Private, whatever the last one chose', async () => {
    const { view } = await renderSheet(2);
    await fireEvent.press(radio('public'));
    expect(checked('public')).toBe(true);

    await view.rerender(
      <PhotoVisibilitySheet prompt={null} onChoose={jest.fn()} onDismiss={jest.fn()} />,
    );
    await view.rerender(
      <PhotoVisibilitySheet
        prompt={{ count: 2 }}
        onChoose={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expect(checked('private')).toBe(true);
    expect(checked('public')).toBe(false);
  });
});

describe('<PhotoVisibilitySheet> - every way out is a dismissal', () => {
  test('Close dismisses', async () => {
    const { onDismiss, onChoose } = await renderSheet(2);

    const close = screen.getByTestId('photo-visibility-cancel', hidden);
    expect(close.props.accessibilityLabel).toBe('Close');
    await fireEvent.press(close);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  test('the swipe down on iOS, Android’s Back and a tap outside are all the Modal’s onRequestClose', async () => {
    const { onDismiss, onChoose } = await renderSheet(2);

    const modal = screen.getByTestId('photo-visibility-modal', hidden);
    expect(modal.props).toMatchObject({
      visible: true,
      presentationStyle: 'pageSheet',
      allowSwipeDismissal: true,
    });
    await act(async () => modal.props.onRequestClose());

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  test('is closed, and holds nothing, while no photos wait', async () => {
    await renderSheet(null);

    // A Modal that is not visible renders nothing under Jest, as on the device.
    expect(screen.queryByTestId('photo-visibility-modal', hidden)).toBeNull();
    expect(screen.queryByTestId('photo-visibility-sheet', hidden)).toBeNull();
    expect(screen.queryByTestId('photo-visibility-confirm', hidden)).toBeNull();
  });

  test('with reduced motion it does not slide in; otherwise it does', async () => {
    await renderSheet(2);
    expect(screen.getByTestId('photo-visibility-modal', hidden).props.animationType).toBe(
      'slide',
    );

    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    __resetAppearanceStoreForTests();
    await renderSheet(2);
    await act(async () => undefined);
    expect(
      screen
        .getAllByTestId('photo-visibility-modal', hidden)
        .every((modal) => modal.props.animationType === 'none'),
    ).toBe(true);
  });
});

describe('<PhotoVisibilitySheet> - structure and the largest text', () => {
  test('keeps the ids the flows select by', async () => {
    await renderSheet(2);

    for (const id of [
      'photo-visibility-sheet',
      'photo-visibility-private',
      'photo-visibility-public',
      'photo-visibility-confirm',
    ]) {
      expect(screen.getByTestId(id, hidden)).toBeTruthy();
    }
  });

  test('reads in order: Close, Private, Public, the note, Add N photos', async () => {
    await renderSheet(2);

    const json = JSON.stringify(screen.toJSON());
    const positions = [
      'photo-visibility-cancel',
      'photo-visibility-private',
      'photo-visibility-public',
      'photo-visibility-note',
      'photo-visibility-confirm',
    ].map((id) => json.indexOf(`"testID":"${id}"`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });

  test('the body scrolls, so the largest text size never clips a row', async () => {
    await renderSheet(2);
    expect(scrollers().length).toBeGreaterThan(0);
    expect(screen.getByTestId('photo-visibility-sheet-body', hidden)).toBeTruthy();
  });

  test.each(TEXT_SCALES)(
    'at text scale %s no node that holds text pins a height',
    async (scale) => {
      phoneAtFontScale(scale);
      await renderSheet(12);

      expect(fixedHeightTextContainers()).toEqual([]);
      expect(Dimensions.get('window').fontScale).toBe(scale);
    },
  );
});
