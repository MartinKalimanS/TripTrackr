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
import { useTrip, useTripStops } from '@/features/trips/use-trips';
import { Sentry } from '@/lib/sentry';

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

export default function NotesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const targets = useMemo(() => anchorTargets(stops.data), [stops.data]);
  const [filterKey, setFilterKey] = useState<string>('all');
  const activeTarget = targets.find((target) => target.key === filterKey) ?? null;
  const notes = useNotes(tripId, filterFor(activeTarget));
  const actions = useNoteActions();
  const [editor, setEditor] = useState<Editor>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  /** Runs a local write; reports and returns false when it throws. */
  const attempt = (write: () => void): boolean => {
    try {
      setWriteError(null);
      write();
      return true;
    } catch (error) {
      Sentry.captureException(error);
      setWriteError(NOTE_FORM_COPY.saveFailed);
      return false;
    }
  };

  const openEditor = (next: NonNullable<Editor>) => {
    setWriteError(null);
    setEditor(next);
  };

  const openAdd = () =>
    openEditor({
      mode: { kind: 'add', initialAnchorKey: activeTarget?.key },
      noteId: null,
    });

  const openEdit = (note: NoteWithPlace) =>
    openEditor({ mode: { kind: 'edit', note }, noteId: note.id });

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

  const confirmRemove = (note: NoteWithPlace) => {
    Alert.alert('Delete this note?', 'It is removed from this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => attempt(() => actions.removeNote(note.id)),
      },
    ]);
  };

  const renderItem = ({ item }: { item: NoteWithPlace }) => (
    <NoteCard
      note={item}
      onEdit={() => openEdit(item)}
      onRemove={() => confirmRemove(item)}
    />
  );

  const header = (
    <NotesHeader
      tripTitle={trip.data?.title ?? null}
      targets={targets}
      filterKey={filterKey}
      writeError={writeError}
      onBack={() => router.back()}
      onFilter={setFilterKey}
      onAdd={openAdd}
    />
  );

  const empty = notes.error ? (
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

  return (
    <>
      <ListScreen
        testID="notes-screen"
        data={notes.data}
        keyExtractor={(note) => note.id}
        renderItem={renderItem}
        header={header}
        empty={empty}
      />
      {editor ? (
        <NoteEditor
          visible
          mode={editor.mode}
          targets={targets}
          error={writeError}
          onCancel={() => setEditor(null)}
          onSubmit={submitEditor}
        />
      ) : null}
    </>
  );
}
