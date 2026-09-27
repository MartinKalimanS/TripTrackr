/**
 * Notes as live local queries — tasks.md T206 (Constitution II).
 *
 * Screens read the encrypted local store through Drizzle's `useLiveQuery`
 * (as `use-trips.ts` does); writes go through the repository and never touch
 * the network — the sync engine (US6) is a separate reconciler. Ids are minted
 * here with `expo-crypto`'s `randomUUID()` (research D-15).
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { useMemo } from 'react';

import { useDatabase } from '@/db/client';
import {
  notesRepository,
  type CreateNoteInput,
  type NotePatch,
  type NoteWithPlace,
  type NotesFilter,
} from '@/db/repositories/notes';
import type { NoteRow } from '@/db/schema';
import type { LiveResult } from '@/features/trips/use-trips';

/** A trip's live notes, newest first, optionally narrowed to one anchor. */
export function useNotes(
  tripId: string,
  filter: NotesFilter = {},
): LiveResult<NoteWithPlace[]> {
  const db = useDatabase();
  const result = useLiveQuery(notesRepository.forTripQuery(db, tripId, filter), [
    tripId,
    filter.country_id,
    filter.city_id,
  ]);
  return {
    data: result.data,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

export interface NoteActions {
  createNote: (input: Omit<CreateNoteInput, 'id'>) => NoteRow;
  updateNote: (noteId: string, patch: NotePatch) => NoteRow;
  removeNote: (noteId: string) => void;
}

export function useNoteActions(): NoteActions {
  const db = useDatabase();
  return useMemo(
    () => ({
      createNote: (input) => notesRepository.create(db, { id: randomUUID(), ...input }),
      updateNote: (noteId, patch) => notesRepository.update(db, noteId, patch),
      removeNote: (noteId) => notesRepository.remove(db, noteId),
    }),
    [db],
  );
}
