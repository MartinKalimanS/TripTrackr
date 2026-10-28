/**
 * A trip's notes - tasks.md T084, T085, 004 T440, 005 T551 (FR-017, FR-018, FR-019, FR-048;
 * 004 FR-007, FR-008, FR-015, FR-021, FR-035; Constitution II; research D-21, D-23, D-24; picture
 * `more/notes`).
 *
 * Everything here is read from and written to the encrypted local store; the list is a live
 * query so a write shows up the moment SQLite commits it. The notes are grouped by the day they
 * were written (`features/notes/note-days.ts`): a `callout` heading over that day's cards, one
 * `FlashList` item per day (D-23). The filter chips narrow to one level - the whole trip, a
 * country, a city - and the editor's anchor pills are the move control of FR-018: pick another
 * level on an existing note and it is refiled there with its body and creation date intact.
 *
 * The screen draws its own header, as the pictures do (the navigator's is hidden for this
 * route: `_layout.tsx`): the shared `AreaHeader` with the pictured search as a coming-soon
 * control, then the filters (`notes-header.tsx`), fixed above the list. "New note" is the
 * floating `AreaFab` (`notes-add`), the one primary, drawn with the notes AND with none: the
 * empty state offers the same action as a secondary (`notes-empty-add`), and the first note of
 * a trip is written from either.
 *
 * Its states are designed (C4-10 rule 2): placeholders shaped like note cards while the first
 * read is pending, an error in words, and an empty state that names the next action and offers
 * it. The error is checked before `loading`: a live read that fails can still report `loading`
 * (its first-result timestamp never arrives) and the words must win over the placeholder. There
 * is no retry: a live query has nothing to re-run (the same recorded gap as Trips).
 *
 * Visibility posture: every note is private to its owner and nothing on this screen offers to
 * change that (a note has no visibility control in 1.0; sharing is User Story 7).
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';

import { NoteDaySection } from '@/components/trip/note-day';
import {
  NoteEditor,
  type NoteEditorMode,
  type NoteEditorValues,
} from '@/components/trip/note-editor';
import { NotesHeader } from '@/components/trip/notes-header';
import { NotesSkeleton } from '@/components/trip/notes-skeleton';
import { AreaFab, areaFabClearance } from '@/components/ui/area-fab';
import { areaMargin } from '@/components/ui/area-header';
import type { IconName } from '@/components/ui/icon';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import type { NoteWithPlace, NotesFilter } from '@/db/repositories/notes';
import { groupNotesByDay, type NoteDay } from '@/features/notes/note-days';
import { NOTE_FORM_COPY } from '@/features/notes/note-form';
import { anchorTargets, type AnchorTarget } from '@/features/notes/use-move-note';
import { useNoteActions, useNotes } from '@/features/notes/use-notes';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { useFontScale } from '@/hooks/use-font-scale';
import { useWriteAttempt } from '@/hooks/use-write-attempt';
import { Space } from '@/theme';

const NO_NOTES: readonly NoteWithPlace[] = [];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type Editor = { mode: NoteEditorMode; noteId: string | null } | null;

function filterFor(target: AnchorTarget | null): NotesFilter {
  if (!target) return {};
  return target.city_id !== null
    ? { city_id: target.city_id }
    : { country_id: target.country_id ?? undefined };
}

function useNotesFilter(tripId: string) {
  const stops = useTripStops(tripId);
  const targets = useMemo(() => anchorTargets(stops.data), [stops.data]);
  const [chosenKey, setFilterKey] = useState<string>('all');
  const activeTarget = targets.find((target) => target.key === chosenKey) ?? null;
  const notes = useNotes(tripId, filterFor(activeTarget));
  const filterKey = activeTarget?.key ?? 'all';
  return { targets, filterKey, setFilterKey, activeTarget, notes };
}

function confirmDelete(onDelete: () => void) {
  Alert.alert('Delete this note?', 'It is removed from this trip.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
}

function useNoteWrites(tripId: string) {
  const actions = useNoteActions();
  const [editor, setEditor] = useState<Editor>(null);
  const { writeError, clearWriteError, attemptSave, attemptRemoval } = useWriteAttempt(
    NOTE_FORM_COPY.saveFailed,
  );

  const openEditor = (next: NonNullable<Editor>) => {
    clearWriteError();
    setEditor(next);
  };

  // The editor closes only once the write has succeeded, so a failed write
  // leaves the typed note on screen with the error beside it.
  const submitEditor = (values: NoteEditorValues) => {
    if (!editor) return;
    const { noteId } = editor;
    const saved = attemptSave(() => {
      if (noteId) {
        actions.updateNote(noteId, values);
      } else {
        actions.createNote({ trip_id: tripId, ...values });
      }
    });
    if (saved) setEditor(null);
  };

  return {
    editor,
    writeError,
    openAdd: (initialAnchorKey: string | undefined) =>
      openEditor({ mode: { kind: 'add', initialAnchorKey }, noteId: null }),
    openEdit: (note: NoteWithPlace) =>
      openEditor({ mode: { kind: 'edit', note }, noteId: note.id }),
    closeEditor: () => setEditor(null),
    submitEditor,
    confirmRemove: (note: NoteWithPlace) =>
      confirmDelete(() => attemptRemoval(() => actions.removeNote(note.id))),
  };
}

type NoteWrites = ReturnType<typeof useNoteWrites>;

type NotesEmptyProps = {
  notes: LiveResult<NoteWithPlace[]>;
  activeTarget: AnchorTarget | null;
  onAdd: () => void;
};

const NOTE_ICON: IconName = 'note';

/** What stands in for the rows: unreadable, reading, or nothing here yet. */
function NotesEmpty({ notes, activeTarget, onAdd }: NotesEmptyProps) {
  if (notes.error) {
    return (
      <ErrorState
        title="Couldn’t read the notes"
        detail="The local store did not answer."
      />
    );
  }
  if (notes.loading) return <NotesSkeleton label="Loading notes" />;
  return (
    <EmptyState
      icon={NOTE_ICON}
      title={activeTarget ? `No notes for ${activeTarget.label} yet` : 'No notes yet'}
      detail="Tap New note to write the first one — it stays on this device until it syncs."
      action={{ label: 'New note', onPress: onAdd, testID: 'notes-empty-add' }}
    />
  );
}

type NoteEditorSheetProps = { writes: NoteWrites; targets: readonly AnchorTarget[] };

function NoteEditorSheet({ writes, targets }: NoteEditorSheetProps) {
  if (!writes.editor) return null;
  return (
    <NoteEditor
      visible
      mode={writes.editor.mode}
      targets={targets}
      error={writes.writeError}
      onCancel={writes.closeEditor}
      onSubmit={writes.submitEditor}
    />
  );
}

export default function NotesScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const filter = useNotesFilter(tripId);
  const writes = useNoteWrites(tripId);
  const fontScale = useFontScale();
  const { tokens } = useAppearance();
  const addNote = () => writes.openAdd(filter.activeTarget?.key);

  // A failed read, or one still waiting for its first answer, shows its own state and never
  // days left over; the count is not drawn until the store has answered.
  const answered = !filter.notes.error && !filter.notes.loading;
  const shown = answered ? filter.notes.data : NO_NOTES;
  const days = useMemo(() => groupNotesByDay(shown), [shown]);

  const renderItem = ({ item }: { item: NoteDay }) => (
    <NoteDaySection day={item} onEdit={writes.openEdit} onRemove={writes.confirmRemove} />
  );

  return (
    <View
      testID="notes-screen"
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}>
      <NotesHeader
        tripTitle={trip.data?.title ?? null}
        count={answered ? filter.notes.data.length : null}
        targets={filter.targets}
        filterKey={filter.filterKey}
        writeError={writes.writeError}
        onFilter={filter.setFilterKey}
      />
      <ListScreen
        listTestID="notes-list"
        edges={['bottom']}
        itemGap={Space[5]}
        horizontalInset={areaMargin()}
        bottomInset={areaFabClearance(Platform.OS, fontScale)}
        data={days}
        keyExtractor={(day) => day.key}
        renderItem={renderItem}
        empty={
          <NotesEmpty
            notes={filter.notes}
            activeTarget={filter.activeTarget}
            onAdd={addNote}
          />
        }
      />
      <AreaFab
        label="New note"
        accessibilityLabel="New note"
        icon="pencil"
        testID="notes-add"
        onPress={addNote}
      />
      <NoteEditorSheet writes={writes} targets={filter.targets} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});
