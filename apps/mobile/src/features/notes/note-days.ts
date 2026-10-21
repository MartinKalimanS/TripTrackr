/**
 * The notes list as days - tasks.md T551 (feature 005 UI-SPEC 9.2; picture `more/notes`).
 *
 * Pure. Notes are grouped by the calendar day they were WRITTEN (`created_at`) in the device's
 * own zone (a note has no zone of its own: "Today" is the traveller's today). The input keeps
 * the repository's order (newest first); the days come out newest first with the notes of a
 * day in the order they came in, and the notes whose date cannot be read form ONE group at
 * the end. A day's heading is "Today" or "Tue 13 Oct" (and the year when it is not this
 * year); there is no "Yesterday": the picture shows the date. Hermes has no
 * `Intl.PluralRules`: "1 note" and "N notes" are a plain comparison.
 *
 * This file also holds the small view-model rules of one card: the time, the place in the foot
 * row, the excerpt and the record's sync state (never colour alone: a glyph and a name).
 * Nothing here stores or sends anything.
 */
import type { IconName } from '@/components/ui/icon';
import type { NoteWithPlace } from '@/db/repositories/notes';
import { deviceLocale } from '@/lib/locale';

export const UNDATED_KEY = 'undated';

/** The characters of a body a card carries; the card's three-line clamp does the rest. */
export const NOTE_EXCERPT_LENGTH = 240;

export interface NoteDay {
  /** `YYYY-MM-DD` (the device's day), or `undated`. */
  key: string;
  /** "Today", "Tue 13 Oct", "Mon 13 Oct 2025", "Date unknown". */
  label: string;
  /** The heading for a screen reader: "Today, Wednesday 14 October 2026". */
  spoken: string;
  notes: readonly NoteWithPlace[];
}

/** "1 note", "6 notes". */
export function noteCount(count: number): string {
  return `${count} ${count === 1 ? 'note' : 'notes'}`;
}

/** "Portugal Road Trip · 6 notes"; either half alone when the other is unknown. */
export function notesSubtitle(tripTitle: string | null, count: number | null) {
  const parts = [tripTitle, count === null ? null : noteCount(count)];
  return parts.filter((part): part is string => !!part).join(' · ') || null;
}

const pad = (value: number) => String(value).padStart(2, '0');

function keyOfDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The device's calendar day of an ISO timestamp as `YYYY-MM-DD`, or `undated`. */
export function dayKeyOf(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? UNDATED_KEY : keyOfDate(date);
}

/** The local time of a note as the device writes it ("16:12"); null when unreadable. */
export function timeOf(
  createdAt: string,
  languageTag: string = deviceLocale().languageTag,
): string | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(languageTag, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "Wed 14 Oct, 16:12": the note's date and time for the editor's date chip; null if unreadable. */
export function whenOf(
  createdAt: string,
  languageTag: string = deviceLocale().languageTag,
): string | null {
  const date = new Date(createdAt);
  const time = timeOf(createdAt, languageTag);
  if (Number.isNaN(date.getTime()) || time === null) return null;
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(languageTag, options).format(date);
  const day = [
    format({ weekday: 'short' }),
    format({ day: 'numeric' }),
    format({ month: 'short' }),
  ].join(' ');
  return `${day}, ${time}`;
}

function describeDay(
  key: string,
  notes: readonly NoteWithPlace[],
  now: number,
  languageTag: string,
): NoteDay {
  if (key === UNDATED_KEY) {
    return { key, label: 'Date unknown', spoken: 'Date unknown', notes };
  }
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(languageTag, options).format(date);
  const spoken = format({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const today = new Date(now);
  if (key === keyOfDate(today)) {
    return { key, label: 'Today', spoken: `Today, ${spoken}`, notes };
  }
  const words = [
    format({ weekday: 'short' }),
    format({ day: 'numeric' }),
    format({ month: 'short' }),
  ];
  if (year !== today.getFullYear()) words.push(String(year));
  return { key, label: words.join(' '), spoken, notes };
}

/** The notes as days, newest day first, the notes with no readable date last. */
export function groupNotesByDay(
  notes: readonly NoteWithPlace[],
  now: number = Date.now(),
  languageTag: string = deviceLocale().languageTag,
): NoteDay[] {
  const byDay = new Map<string, NoteWithPlace[]>();
  for (const note of notes) {
    const key = dayKeyOf(note.created_at);
    const day = byDay.get(key);
    if (day) day.push(note);
    else byDay.set(key, [note]);
  }
  const keys = [...byDay.keys()].sort((a, b) => {
    if (a === UNDATED_KEY) return b === UNDATED_KEY ? 0 : 1;
    if (b === UNDATED_KEY) return -1;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  return keys.map((key) => describeDay(key, byDay.get(key) ?? [], now, languageTag));
}

/** The place in a card's foot row: the city, else the country, else "Trip". */
export function placeOf(note: NoteWithPlace): string {
  if (note.city_id !== null) return note.city_name ?? `City #${note.city_id}`;
  if (note.country_id !== null) return note.country_name ?? `Country #${note.country_id}`;
  return 'Trip';
}

/** The start of a body for a card, cut at the cap with an ellipsis when it is longer. */
export function excerptOf(body: string): string {
  return body.length > NOTE_EXCERPT_LENGTH
    ? `${body.slice(0, NOTE_EXCERPT_LENGTH).trimEnd()}…`
    : body;
}

export interface NoteSync {
  state: 'device' | 'synced';
  icon: IconName;
  /** The visible words; the synced tick of the picture has none. */
  words: string | null;
  /** The accessible name (contains the visible words). */
  name: string;
}

/** What the record can honestly say: changes not yet uploaded ("On this device"), or synced. */
export function noteSync(note: Pick<NoteWithPlace, 'is_dirty'>): NoteSync {
  return note.is_dirty
    ? {
        state: 'device',
        icon: 'cloud-upload',
        words: 'On this device',
        name: 'On this device, not yet synced',
      }
    : { state: 'synced', icon: 'cloud-check', words: null, name: 'Synced' };
}
