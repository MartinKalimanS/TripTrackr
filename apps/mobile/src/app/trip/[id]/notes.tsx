/**
 * A trip's notes — tasks.md T084, T085 (FR-017, FR-018, FR-019; Constitution II);
 * research D-21, D-23, D-24.
 *
 * Everything here is read from and written to the encrypted local store; the
 * list is a live query so a write shows up the moment SQLite commits it. The
 * list is a `FlashList` through `ListScreen` (D-23) because a trip's notes
 * are unbounded. The filter pills narrow to one level — the whole trip, a
 * country, a city — and the editor's anchor pills are the move control of
 * FR-018: pick another level on an existing note and it is refiled there
 * with its body and creation date intact.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { NoteCard } from '@/components/trip/note-card';
import {
  NoteEditor,
  type NoteEditorMode,
  type NoteEditorValues,
} from '@/components/trip/note-editor';
import { NotesHeader } from '@/components/trip/notes-header';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import type { NoteWithPlace, NotesFilter } from '@/db/repositories/notes';
import { NOTE_FORM_COPY } from '@/features/notes/note-form';
import { anchorTargets, type AnchorTarget } from '@/features/notes/use-move-note';
import { useNoteActions, useNotes } from '@/features/notes/use-notes';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

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
  const { writeError, clearWriteError, attempt } = useWriteAttempt(
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
    const saved = attempt(() => {
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
      confirmDelete(() => attempt(() => actions.removeNote(note.id))),
  };
}

type NoteWrites = ReturnType<typeof useNoteWrites>;

type NotesEmptyProps = {
  notes: LiveResult<NoteWithPlace[]>;
  activeTarget: AnchorTarget | null;
};

function NotesEmpty({ notes, activeTarget }: NotesEmptyProps) {
  return notes.error ? (
    <ErrorState
      title="Couldn’t read the notes"
      detail="The local store did not answer."
    />
  ) : notes.loading ? (
    <LoadingState title="Loading notes" />
  ) : (
    <EmptyState
      title={activeTarget ? `No notes for ${activeTarget.label} yet` : 'No notes yet'}
      detail="Write the first one — it stays on this device until it syncs."
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
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const filter = useNotesFilter(tripId);
  const writes = useNoteWrites(tripId);

  const renderItem = ({ item }: { item: NoteWithPlace }) => (
    <NoteCard
      note={item}
      onEdit={() => writes.openEdit(item)}
      onRemove={() => writes.confirmRemove(item)}
    />
  );

  const header = (
    <NotesHeader
      tripTitle={trip.data?.title ?? null}
      targets={filter.targets}
      filterKey={filter.filterKey}
      writeError={writes.writeError}
      onBack={() => router.back()}
      onFilter={filter.setFilterKey}
      onAdd={() => writes.openAdd(filter.activeTarget?.key)}
    />
  );

  return (
    <>
      <ListScreen
        testID="notes-screen"
        data={filter.notes.data}
        keyExtractor={(note) => note.id}
        renderItem={renderItem}
        header={header}
        empty={<NotesEmpty notes={filter.notes} activeTarget={filter.activeTarget} />}
      />
      <NoteEditorSheet writes={writes} targets={filter.targets} />
    </>
  );
}
