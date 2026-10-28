/**
 * The notes area as pictured (F9, tasks.md T551; FR-044, FR-048; UI-SPEC 9.2; pictures
 * `more/notes*.png`, `note-editor*.png`; owner answer Q-11): the header with the coming-soon
 * search, the day groups, the card's foot row and per-record sync state, no invented thumbnail,
 * the floating "New note", the states, and the editor's pictured extras. The pure rules are in
 * `test/features/note-days.test.ts`; the older behaviour (writes, filters, moves, errors) is in
 * `us2-screens.test.tsx`. The live hooks are mocked, everything else is real.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import NotesScreen from '@/app/trip/[id]/notes';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';

import { hostsWhere } from '../helpers/host-nodes';
import { glyphNamesIn } from '../helpers/icons';
import { resetKeyboard, showKeyboard } from '../helpers/keyboard';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'trip-42' }),
  useRouter: () => ({
    back: mockBack,
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockTrip = { data: { title: 'Portugal Road Trip' }, loading: false, error: null };
const mockStops = {
  data: [
    {
      id: 's1',
      trip_id: 'trip-42',
      city_id: 100,
      sort_order: 0,
      arrive_date: null,
      depart_date: null,
      city_name: 'Sintra',
      country_id: 1,
      country_name: 'Portugal',
      country_iso: 'PT',
      lat: null,
      lng: null,
    },
  ] as unknown as StopWithPlace[],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
}));

const mockNotes = {
  data: [] as NoteWithPlace[],
  loading: false,
  error: null as Error | null,
};
const mockActions = {
  createNote: jest.fn(),
  updateNote: jest.fn(),
  removeNote: jest.fn(),
};

jest.mock('@/features/notes/use-notes', () => ({
  useNotes: () => mockNotes,
  useNoteActions: () => mockActions,
}));

const local = (daysAgo: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

const note = (id: string, overrides: Partial<NoteWithPlace> = {}): NoteWithPlace => ({
  id,
  trip_id: 'trip-42',
  country_id: 1,
  city_id: 100,
  title: `Title ${id}`,
  body: `Body of ${id}`,
  is_public: false,
  created_at: local(0, 8, 15),
  updated_at: local(0, 8, 15),
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  country_name: 'Portugal',
  city_name: 'Sintra',
  country_iso: 'PT',
  ...overrides,
});

/** A flag is decorative: hidden from assistive technology, so from a default query. */
const HIDDEN = { includeHiddenElements: true } as const;

const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock };
};

function phone(fontScale = 1) {
  jest
    .spyOn(Dimensions, 'get')
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale });
}

beforeEach(() => {
  mockNotes.data = [];
  mockNotes.loading = false;
  mockNotes.error = null;
  mockToast.show.mockClear();
  mockBack.mockClear();
  Object.values(mockActions).forEach((action) => action.mockReset());
  phone();
});
afterEach(() => {
  resetKeyboard();
  jest.restoreAllMocks();
});

describe('<NotesScreen> - the header as pictured (FR-044)', () => {
  test('is Back, the title "Notes" and "<trip> · N notes" under it', async () => {
    mockNotes.data = [note('a'), note('b')];
    await render(<NotesScreen />);

    const title = screen.getByTestId('notes-header-title');
    expect(title).toHaveTextContent('Notes');
    expect(title.props.accessibilityRole).toBe('header');
    expect(screen.getByTestId('notes-subtitle')).toHaveTextContent(
      'Portugal Road Trip · 2 notes',
    );
  });

  test('has no count until the store has answered, and none after a failed read', async () => {
    mockNotes.loading = true;
    await render(<NotesScreen />);
    expect(screen.getByTestId('notes-subtitle')).toHaveTextContent(
      /^Portugal Road Trip$/,
    );

    mockNotes.loading = false;
    mockNotes.error = new Error('boom');
    await screen.rerender(<NotesScreen />);
    expect(screen.getByTestId('notes-subtitle')).toHaveTextContent(
      /^Portugal Road Trip$/,
    );
  });

  test('Back goes back through the router, and is named "Back"', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test('the pictured search is a coming-soon control: named, hinted, ONE toast and nothing else', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);

    const search = screen.getByTestId('coming-soon-notes-search');
    expect(search.props.accessibilityLabel).toBe('Search notes');
    expect(search.props.accessibilityHint).toBe('Not available yet');
    expect(search.props.accessibilityRole).toBe('button');

    await fireEvent.press(search);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show.mock.calls[0][0].id).toBe('coming-soon');
    expect(screen.queryByTestId('note-editor')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(Object.values(mockActions).every((action) => !action.mock.calls.length)).toBe(
      true,
    );
  });

  test('a note has no visibility control: private by default, nothing to share', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/public|share/i)).toBeNull();
    expect(screen.queryByTestId('coming-soon-notes-share')).toBeNull();
  });
});

describe('<NotesScreen> - the days (picture notes.png)', () => {
  test('groups by the day written, newest first, "Today" first, each day one announced header', async () => {
    mockNotes.data = [
      note('a', { created_at: local(0, 16, 12) }),
      note('b', { created_at: local(0, 11, 40) }),
      note('c', { created_at: local(3, 18, 5) }),
    ];
    await render(<NotesScreen />);

    const headings = screen.getAllByTestId(/^note-day-heading-/);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent('Today');
    expect(String(headings[1].props.children)).toMatch(/^\w{3} \d{1,2} \w{3}( \d{4})?$/);
    for (const heading of headings) {
      expect(heading.props.accessibilityRole).toBe('header');
    }
    expect(String(headings[0].props.accessibilityLabel)).toMatch(/^Today, /);
  });

  test('a day holds its cards in the order given', async () => {
    mockNotes.data = [note('a'), note('b')];
    await render(<NotesScreen />);
    const cards = screen.getAllByTestId(/^note-card-/).map((card) => card.props.testID);
    expect(cards).toEqual(['note-card-a', 'note-card-b']);
  });
});

describe('<NotesScreen> - a card as pictured', () => {
  test('the foot row is the time, a flag and the place, with the sync state at the end', async () => {
    mockNotes.data = [note('a', { created_at: local(0, 16, 12) })];
    await render(<NotesScreen />);

    const foot = within(screen.getByTestId('note-foot-a'));
    expect(foot.getByText(/16[:.]12/)).toBeTruthy();
    expect(screen.getByTestId('note-flag-a', HIDDEN)).toBeTruthy();
    expect(foot.getByTestId('note-anchor-a')).toHaveTextContent('Sintra');
    expect(foot.getByTestId('note-sync-a')).toBeTruthy();
  });

  test('the excerpt is clamped to three lines and the title to one (two at large text)', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);
    expect(screen.getByTestId('note-body-a').props.numberOfLines).toBe(3);
    expect(screen.getByTestId('note-title-a').props.numberOfLines).toBe(1);

    await screen.unmount();
    phone(1.5);
    await render(<NotesScreen />);
    expect(screen.getByTestId('note-title-a').props.numberOfLines).toBe(2);
    expect(screen.getByTestId('note-body-a').props.numberOfLines).toBe(3);
  });

  test('"On this device" with the upload cloud for a note not yet synced, a named tick for one that is: never colour alone', async () => {
    mockNotes.data = [note('a', { is_dirty: true }), note('b', { is_dirty: false })];
    await render(<NotesScreen />);

    const device = screen.getByTestId('note-sync-a');
    expect(within(device).getByText('On this device')).toBeTruthy();
    expect(device.props.accessibilityLabel).toBe('On this device, not yet synced');
    expect(glyphNamesIn(device)).toEqual(['cloud-upload']);

    const synced = screen.getByTestId('note-sync-b');
    expect(synced.props.accessibilityLabel).toBe('Synced');
    expect(glyphNamesIn(synced)).toEqual(['cloud-check']);
    expect(within(synced).queryByText('On this device')).toBeNull();
  });

  test('no thumbnail is ever drawn: the data model has no photograph on a note', async () => {
    mockNotes.data = [note('a'), note('b')];
    await render(<NotesScreen />);
    expect(screen.queryByTestId(/thumb/i)).toBeNull();
    expect(screen.queryByLabelText('Attached photo')).toBeNull();
    expect(hostsWhere((node) => node.type === 'Image')).toHaveLength(0);
  });

  test('is named as one element with the same two actions, and Edit and Delete keep their names', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);

    const card = screen.getByTestId('note-card-a');
    expect(card.props.accessibilityLabel).toBe(
      'Title a, filed under Sintra, Portugal. Body of a',
    );
    expect(screen.getByLabelText('Edit Title a')).toBeTruthy();
    expect(screen.getByLabelText('Delete Title a')).toBeTruthy();
  });

  test('tapping the card opens the editor on it (an edit, not a new note)', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('note-edit-a'));

    expect(screen.getByTestId('note-editor')).toBeTruthy();
    expect(screen.getByText('Edit note')).toBeTruthy();
  });
});

describe('<NotesScreen> - the floating "New note" (FR-048)', () => {
  test('is the one primary, named "New note", at the end of the screen, above the list', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);

    const add = screen.getByTestId('notes-add');
    expect(add.props.accessibilityLabel).toBe('New note');
    expect(within(add).getByText('New note')).toBeTruthy();
    expect(glyphNamesIn(add)).toEqual(['pencil']);
    await fireEvent.press(add);
    expect(screen.getByTestId('note-editor')).toBeTruthy();
  });

  test('is there with no notes (the first note of a trip is written from it), while loading and after a failed read', async () => {
    await render(<NotesScreen />);
    expect(screen.getByTestId('notes-add')).toBeTruthy();

    mockNotes.loading = true;
    await screen.rerender(<NotesScreen />);
    expect(screen.getByTestId('notes-add')).toBeTruthy();

    mockNotes.loading = false;
    mockNotes.error = new Error('boom');
    await screen.rerender(<NotesScreen />);
    expect(screen.getByTestId('notes-add')).toBeTruthy();
  });

  test('goes with the keyboard', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);
    await showKeyboard();
    expect(
      screen.queryByTestId('notes-add', { includeHiddenElements: false }),
    ).toBeNull();
  });

  test('the list leaves room under its last note for it', async () => {
    mockNotes.data = [note('a')];
    await render(<NotesScreen />);
    const content = screen.getByTestId('notes-list').props.contentContainerStyle;
    expect(content.paddingBottom).toBeGreaterThanOrEqual(52 + 16 + 16);
  });
});

describe('<NotesScreen> - the states', () => {
  test('loading is ONE named progress region shaped like the notes, never the empty state', async () => {
    mockNotes.loading = true;
    await render(<NotesScreen />);

    const region = screen.getByLabelText('Loading notes');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.queryByText('No notes yet')).toBeNull();
  });

  test('empty says "No notes yet" and offers the next step', async () => {
    await render(<NotesScreen />);
    expect(screen.getByText('No notes yet')).toBeTruthy();
    expect(screen.getByTestId('notes-empty-add')).toBeTruthy();
  });

  test('an unreadable store says so in words', async () => {
    mockNotes.error = new Error('boom');
    await render(<NotesScreen />);
    expect(screen.getByText('Couldn’t read the notes')).toBeTruthy();
    expect(screen.queryAllByTestId(/^note-card-/)).toHaveLength(0);
  });
});

describe('<NotesScreen> - the editor, as pictured and as decided (no autosave)', () => {
  test('typing writes nothing: a note is saved by Save and by nothing else', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-add'));
    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'Half a thought');
    await fireEvent.changeText(screen.getByTestId('note-editor-title'), 'Draft');

    expect(mockActions.createNote).not.toHaveBeenCalled();
    expect(mockActions.updateNote).not.toHaveBeenCalled();
    expect(screen.getByTestId('note-editor-cancel')).toBeTruthy();
    expect(screen.getByTestId('note-editor-save')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByTestId('note-editor-sync')).toBeNull();
  });

  test('an edit says the state of the record under the title and the day it was written', async () => {
    mockNotes.data = [
      note('a', { is_dirty: true, created_at: local(0, 16, 12) }),
      note('b', { is_dirty: false }),
    ];
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('note-edit-a'));

    const sync = screen.getByTestId('note-editor-sync');
    expect(within(sync).getByText('On this device')).toBeTruthy();
    expect(glyphNamesIn(sync)).toEqual(['cloud-upload']);
    expect(screen.getByTestId('note-editor-date')).toHaveTextContent(/16[:.]12/);

    await fireEvent.press(screen.getByTestId('note-editor-cancel'));
    await fireEvent.press(screen.getByTestId('note-edit-b'));
    expect(screen.getByTestId('note-editor-sync').props.accessibilityLabel).toBe(
      'Synced',
    );
  });
});
