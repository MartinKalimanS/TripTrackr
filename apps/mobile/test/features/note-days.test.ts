/**
 * Notes grouped by day (F9, T551; UI-SPEC 9.2; picture `more/notes`): the device's calendar
 * day, newest first, "Today" and "Tue 13 Oct" as the heading, the time, the count, the excerpt
 * and the record's sync state in words. Dates are built from LOCAL parts so the suite does
 * not depend on the machine's zone.
 */
import type { NoteWithPlace } from '@/db/repositories/notes';
import {
  NOTE_EXCERPT_LENGTH,
  UNDATED_KEY,
  dayKeyOf,
  excerptOf,
  groupNotesByDay,
  noteCount,
  noteSync,
  notesSubtitle,
  placeOf,
  timeOf,
  whenOf,
} from '@/features/notes/note-days';

const local = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

function note(id: string, overrides: Partial<NoteWithPlace> = {}): NoteWithPlace {
  return {
    id,
    trip_id: 't',
    country_id: 1,
    city_id: 100,
    title: 'Title',
    body: 'Body',
    is_public: false,
    created_at: local(2026, 10, 14, 16, 12),
    updated_at: local(2026, 10, 14, 16, 12),
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    country_name: 'Portugal',
    city_name: 'Sintra',
    country_iso: 'PT',
    ...overrides,
  };
}

const NOW = new Date(2026, 9, 14, 20, 0).getTime();

describe('noteCount: no Intl.PluralRules on Hermes', () => {
  test.each([
    [0, '0 notes'],
    [1, '1 note'],
    [2, '2 notes'],
    [6, '6 notes'],
  ])('%i', (count, words) => expect(noteCount(count)).toBe(words));
});

describe('notesSubtitle', () => {
  test('names the trip and counts the notes', () => {
    expect(notesSubtitle('Portugal Road Trip', 6)).toBe('Portugal Road Trip · 6 notes');
  });
  test('says either half alone when the other is unknown, and nothing when both are', () => {
    expect(notesSubtitle(null, 1)).toBe('1 note');
    expect(notesSubtitle('Portugal Road Trip', null)).toBe('Portugal Road Trip');
    expect(notesSubtitle(null, null)).toBeNull();
  });
});

describe('dayKeyOf: the device calendar day', () => {
  test('is the local day of created_at', () => {
    expect(dayKeyOf(local(2026, 10, 14, 0, 5))).toBe('2026-10-14');
    expect(dayKeyOf(local(2026, 10, 14, 23, 55))).toBe('2026-10-14');
  });
  test('is undated for a date nobody can read', () => {
    expect(dayKeyOf('not a date')).toBe(UNDATED_KEY);
  });
});

describe('groupNotesByDay', () => {
  const days = (notes: NoteWithPlace[], now = NOW) =>
    groupNotesByDay(notes, now, 'en-GB');

  test('today is "Today", another day is "Tue 13 Oct"; newest day first, order inside kept', () => {
    const groups = days([
      note('a', { created_at: local(2026, 10, 14, 16, 12) }),
      note('b', { created_at: local(2026, 10, 14, 11, 40) }),
      note('c', { created_at: local(2026, 10, 13, 18, 5) }),
    ]);

    expect(groups.map((group) => group.label)).toEqual(['Today', 'Tue 13 Oct']);
    expect(groups[0].notes.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(groups[1].notes.map((entry) => entry.id)).toEqual(['c']);
  });

  test('sorts the days newest first whatever the order it was given', () => {
    const groups = days([
      note('old', { created_at: local(2026, 10, 12) }),
      note('new', { created_at: local(2026, 10, 14) }),
      note('mid', { created_at: local(2026, 10, 13) }),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      '2026-10-14',
      '2026-10-13',
      '2026-10-12',
    ]);
  });

  test('yesterday has no special word: the picture says "Tue 13 Oct"', () => {
    const [group] = days([note('c', { created_at: local(2026, 10, 13) })]);
    expect(group.label).toBe('Tue 13 Oct');
  });

  test('a day of another year says the year', () => {
    const [group] = days([note('c', { created_at: local(2025, 10, 13) })]);
    expect(group.label).toBe('Mon 13 Oct 2025');
  });

  test('is read aloud as a whole date, and "Today" says so', () => {
    const [today, past] = days([
      note('a', { created_at: local(2026, 10, 14) }),
      note('c', { created_at: local(2026, 10, 13) }),
    ]);
    // ICU versions differ on a comma after the weekday.
    const plain = (text: string) => text.replace(/day, (?=\d)/, 'day ');
    expect(plain(today.spoken)).toBe('Today, Wednesday 14 October 2026');
    expect(plain(past.spoken)).toBe('Tuesday 13 October 2026');
  });

  test('a note with an unreadable date forms ONE group at the end', () => {
    const groups = days([
      note('x', { created_at: 'nope' }),
      note('a', { created_at: local(2026, 10, 14) }),
      note('y', { created_at: 'also nope' }),
    ]);
    expect(groups.map((group) => group.key)).toEqual(['2026-10-14', UNDATED_KEY]);
    expect(groups[1].label).toBe('Date unknown');
    expect(groups[1].notes.map((entry) => entry.id)).toEqual(['x', 'y']);
  });

  test('has no group for no notes', () => {
    expect(days([])).toEqual([]);
  });
});

describe('timeOf', () => {
  test('is the local time of the note, as the device writes it', () => {
    expect(timeOf(local(2026, 10, 14, 16, 12), 'en-GB')).toBe('16:12');
    expect(timeOf('nope', 'en-GB')).toBeNull();
  });
});

describe('whenOf: the editor’s date chip', () => {
  test('is the weekday, day, month and time of the note', () => {
    expect(whenOf(local(2026, 10, 14, 16, 12), 'en-GB')).toBe('Wed 14 Oct, 16:12');
  });
  test('is nothing for a date nobody can read', () => {
    expect(whenOf('nope', 'en-GB')).toBeNull();
  });
});

describe('placeOf: the place in the foot row', () => {
  test('is the city, else the country, else the trip', () => {
    expect(placeOf(note('a'))).toBe('Sintra');
    expect(placeOf(note('a', { city_id: null, city_name: null }))).toBe('Portugal');
    expect(placeOf(note('a', { city_name: null }))).toBe('City #100');
    expect(
      placeOf(note('a', { city_id: null, city_name: null, country_name: null })),
    ).toBe('Country #1');
    expect(
      placeOf(
        note('a', {
          city_id: null,
          city_name: null,
          country_name: null,
          country_id: null,
        }),
      ),
    ).toBe('Trip');
  });
});

describe('excerptOf', () => {
  test('keeps a short body whole, collapsing nothing', () => {
    expect(excerptOf('Try the raclette.')).toBe('Try the raclette.');
  });
  test('cuts a long body at the cap and says so, without a trailing space', () => {
    const body = `${'x'.repeat(NOTE_EXCERPT_LENGTH - 1)} ${'y'.repeat(50)}`;
    expect(excerptOf(body)).toBe(`${'x'.repeat(NOTE_EXCERPT_LENGTH - 1)}…`);
  });
});

describe('noteSync: the record’s own state, in words and a glyph', () => {
  test('a note with changes only on this device says so', () => {
    expect(noteSync(note('a', { is_dirty: true }))).toEqual({
      state: 'device',
      icon: 'cloud-upload',
      words: 'On this device',
      name: 'On this device, not yet synced',
    });
  });
  test('a note that has been sent is synced: a tick, named', () => {
    expect(noteSync(note('a'))).toEqual({
      state: 'synced',
      icon: 'cloud-check',
      words: null,
      name: 'Synced',
    });
  });
});
