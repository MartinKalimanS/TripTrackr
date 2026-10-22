/**
 * User Story 2's components in isolation: the note editor's form behaviour
 * (T084/T085), the category and anchor pickers, and the `ListScreen` scaffold (research D-23).
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AnchorPicker } from '@/components/trip/anchor-picker';
import { CategoryPicker } from '@/components/trip/category-picker';
import { NoteCard, describeAnchor } from '@/components/trip/note-card';
import { NoteEditor } from '@/components/trip/note-editor';
import { ListScreen } from '@/components/ui/list-screen';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { AnchorTarget } from '@/features/notes/use-move-note';

import { classesOf } from '../helpers/host-nodes';
import { glyphNamesIn } from '../helpers/icons';

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

describe('<NoteEditor>', () => {
  test('add mode pre-selects the first anchor, refuses an empty body, and submits the wire shape', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('anchor-country:1').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() => expect(screen.getByText('Write something first.')).toBeTruthy());
    expect(onSubmit).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByTestId('note-editor-body'),
      'Gelato at Vivoli.',
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: null,
        body: 'Gelato at Vivoli.',
        country_id: 1,
        city_id: null,
      }),
    );
  });

  test('add mode honours an initial anchor and reports when nothing is chosen', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add', initialAnchorKey: 'city:100' }}
        targets={targets}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('anchor-city:100').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  test('with no stops there is nothing to file under, and save says so', async () => {
    const onSubmit = jest.fn();
    await render(
      <NoteEditor
        visible
        mode={{ kind: 'add' }}
        targets={[]}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/Add a stop to this trip first/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'x');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() =>
      expect(screen.getByText(/Choose where this note belongs/)).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('edit mode starts from the note and a cancelled draft does not linger', async () => {
    const onCancel = jest.fn();
    const view = await render(
      <NoteEditor
        visible
        mode={{
          kind: 'edit',
          note: { title: 'Cheese', body: 'Raclette.', country_id: 1, city_id: 100 },
        }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.getByTestId('note-editor-title').props.value).toBe('Cheese');
    expect(screen.getByTestId('note-editor-body').props.value).toBe('Raclette.');
    expect(screen.getByTestId('anchor-city:100').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('note-editor-cancel'));
    expect(onCancel).toHaveBeenCalled();

    await view.rerender(
      <NoteEditor
        visible={false}
        mode={{ kind: 'add' }}
        targets={targets}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('note-editor-save')).toBeNull();
  });
});

describe('describeAnchor', () => {
  const base: NoteWithPlace = {
    id: 'n',
    trip_id: 't',
    country_id: 1,
    city_id: null,
    title: null,
    body: 'x',
    is_public: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: null,
    country_name: 'Italy',
    city_name: null,
  };

  test('names the level in words, falling back to ids for uncached places', () => {
    expect(describeAnchor(base)).toBe('Italy');
    expect(describeAnchor({ ...base, city_id: 100, city_name: 'Roma' })).toBe(
      'Roma, Italy',
    );
    expect(
      describeAnchor({ ...base, city_id: 100, city_name: null, country_name: null }),
    ).toBe('City #100');
    expect(describeAnchor({ ...base, country_name: null })).toBe('Country #1');
    expect(describeAnchor({ ...base, country_id: null, country_name: null })).toBe(
      'Trip',
    );
  });
});

describe('<NoteCard> - a note in the list (T440; FR-006, FR-013, FR-030, FR-034)', () => {
  const saved: NoteWithPlace = {
    id: 'n1',
    trip_id: 't',
    country_id: 1,
    city_id: 100,
    title: 'Cheese',
    body: 'Try the raclette.',
    is_public: false,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    country_name: 'Italy',
    city_name: 'Roma',
  };
  async function renderCard(
    note: Partial<NoteWithPlace> = {},
    handlers: { onEdit?: () => void; onRemove?: () => void } = {},
  ) {
    return render(
      <NoteCard
        note={{ ...saved, ...note }}
        onEdit={handlers.onEdit ?? jest.fn()}
        onRemove={handlers.onRemove ?? jest.fn()}
      />,
    );
  }

  test('is ONE element for assistive technology, named as before, with the same two actions', async () => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    await renderCard({}, { onEdit, onRemove });

    const card = screen.getByTestId('note-card-n1');
    expect(card.props.accessible).toBe(true);
    expect(card.props.accessibilityLabel).toBe(
      'Cheese, filed under Roma, Italy. Try the raclette.',
    );
    expect(card.props.accessibilityActions).toEqual([
      { name: 'edit', label: 'Edit note' },
      { name: 'delete', label: 'Delete note' },
    ]);

    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } });
    await fireEvent(card, 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    await fireEvent(card, 'accessibilityAction', {
      nativeEvent: { actionName: 'magnify' },
    });
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a note with no title is announced as "Note"', async () => {
    await renderCard({ title: null });
    expect(screen.getByTestId('note-card-n1').props.accessibilityLabel).toBe(
      'Note, filed under Roma, Italy. Try the raclette.',
    );
  });

  test('is a cream tile with a hairline and no dashed edge, saved or not (T551: the state is a glyph and words)', async () => {
    await renderCard();

    const classes = classesOf(screen.getByTestId('note-surface-n1'));
    expect(classes).toContain('bg-surface-secondary');
    expect(classes).toContain('border-separator');
    expect(classes).not.toContain('border-dashed');
    expect(screen.queryByText('On this device')).toBeNull();
    expect(screen.getByLabelText('Synced')).toBeTruthy();
  });

  test('a note only on this device says "On this device" with the upload cloud, in words and a glyph (FR-034, FR-025)', async () => {
    await renderCard({ is_dirty: true });

    expect(classesOf(screen.getByTestId('note-surface-n1'))).not.toContain(
      'border-dashed',
    );
    expect(screen.getByText('On this device')).toBeTruthy();
    expect(screen.getByLabelText('On this device, not yet synced')).toBeTruthy();
    expect(glyphNamesIn(screen.getByTestId('note-sync-n1'))).toEqual(['cloud-upload']);
  });

  test('says the place in the foot row (muted), then the title and the body', async () => {
    await renderCard();

    expect(screen.getByTestId('note-anchor-n1')).toHaveTextContent('Roma');
    expect(classesOf(screen.getByTestId('note-anchor-n1'))).toContain('text-muted');
    expect(screen.getByText('Cheese')).toBeTruthy();
    expect(screen.getByTestId('note-body-n1')).toHaveTextContent('Try the raclette.');
  });

  test('carries at most 240 characters of a long body and says it is cut; the announced name keeps 160', async () => {
    await renderCard({ body: 'x'.repeat(300) });

    expect(screen.getByTestId('note-body-n1')).toHaveTextContent(`${'x'.repeat(240)}…`);
    expect(screen.getByTestId('note-card-n1').props.accessibilityLabel).toBe(
      `Cheese, filed under Roma, Italy. ${'x'.repeat(160)}…`,
    );
  });

  test('Edit is the card’s body and Delete the trash, each with its id, name and handler (FR-005, FR-037)', async () => {
    const onEdit = jest.fn();
    const onRemove = jest.fn();
    await renderCard({}, { onEdit, onRemove });

    const edit = screen.getByTestId('note-edit-n1');
    const remove = screen.getByTestId('note-remove-n1');
    expect(edit.props.accessibilityLabel).toBe('Edit Cheese');
    expect(remove.props.accessibilityLabel).toBe('Delete Cheese');
    expect(edit.props.accessibilityRole).toBe('button');
    expect(remove.props.accessibilityRole).toBe('button');
    expect(glyphNamesIn(remove)).toEqual(['trash']);

    await fireEvent.press(edit);
    await fireEvent.press(remove);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('controls of an untitled note are named after "note"', async () => {
    await renderCard({ title: null });

    expect(screen.getByTestId('note-edit-n1').props.accessibilityLabel).toBe('Edit note');
    expect(screen.getByTestId('note-remove-n1').props.accessibilityLabel).toBe(
      'Delete note',
    );
  });
});

describe('<AnchorPicker> and <CategoryPicker>', () => {
  test('the anchor picker reports the chosen key and shows an error in words', async () => {
    const onChange = jest.fn();
    await render(
      <AnchorPicker
        label="Filed under"
        targets={targets}
        value=""
        onChange={onChange}
        error="Choose one."
      />,
    );
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    expect(onChange).toHaveBeenCalledWith('city:100');
    expect(screen.getByText('Choose one.')).toBeTruthy();
  });

  test('the category picker lists system rows then custom, creates on demand, and disables an empty add', async () => {
    const onChange = jest.fn();
    const onCreate = jest.fn(() => 'new-id');
    const options = [
      ...SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
      { id: 'custom-1', name: 'Coffee', icon: null, system: false },
    ];
    await render(
      <CategoryPicker
        options={options}
        value={SYSTEM_EXPENSE_CATEGORIES[1].id}
        onChange={onChange}
        onCreate={onCreate}
      />,
    );

    expect(
      screen.getByTestId(`category-${SYSTEM_EXPENSE_CATEGORIES[1].id}`).props
        .accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('category-custom-1'));
    expect(onChange).toHaveBeenCalledWith('custom-1');

    await fireEvent.press(screen.getByTestId('category-new-toggle'));
    expect(screen.getByTestId('category-new-add').props.accessibilityState).toMatchObject(
      {
        disabled: true,
      },
    );
    await fireEvent.press(screen.getByTestId('category-new-add'));
    expect(onCreate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('category-new-name'), '  Museums ');
    await fireEvent(screen.getByTestId('category-new-name'), 'submitEditing');
    expect(onCreate).toHaveBeenCalledWith('Museums');
    expect(onChange).toHaveBeenLastCalledWith('new-id');
    expect(screen.queryByTestId('category-new-name')).toBeNull();
    await fireEvent.press(screen.getByTestId('category-new-toggle'));
    expect(screen.getByTestId('category-new-name').props.value).toBe('');
  });
});

describe('<ListScreen> (research D-23)', () => {
  test('renders header, rows in order, and footer; the empty slot only when there are no rows', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const view = await render(
      <ListScreen
        testID="list"
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => <Text testID={`row-${item.id}`}>{item.id}</Text>}
        header={<Text>Header</Text>}
        footer={<Text>Footer</Text>}
        empty={<Text>Nothing</Text>}
        edges={['bottom']}
      />,
    );
    expect(screen.getByText('Header')).toBeTruthy();
    expect(screen.getByTestId('row-a')).toBeTruthy();
    expect(screen.getByTestId('row-b')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
    expect(screen.queryByText('Nothing')).toBeNull();

    await view.rerender(
      <ListScreen
        testID="list"
        data={[]}
        keyExtractor={(row: { id: string }) => row.id}
        renderItem={({ item }) => <Text>{item.id}</Text>}
        empty={<Text>Nothing</Text>}
      />,
    );
    expect(screen.getByText('Nothing')).toBeTruthy();
  });
});
