import { z } from 'zod';

import { CityId, CountryId, Uuid } from '../scalars';
import { NotePullShape, noteAnchored } from '../sync/records';

/**
 * Notes (rest-api.md §4; FR-017, FR-018, FR-019).
 *
 * FR-017's three levels are one shape, not three: trip-level is `city_id`
 * null with the trip's sole country; country-level is `country_id` set and
 * `city_id` null; city-level is both set. Moving a note between levels
 * (FR-018) is therefore a patch of two nullable anchors, and the body and
 * creation date travel untouched. FR-019 — at least a country anchor — is the
 * same predicate the sync record enforces, `noteAnchored`.
 */

const nonEmptyPatch = (patch: object) => Object.keys(patch).length > 0;

/**
 * `id` is optional and client-chosen (research D-15). `is_public` defaults to
 * private: a note is never public by omission (Constitution I, FR-052).
 */
export const CreateNoteRequest = z
  .strictObject({
    id: Uuid.optional(),
    title: z.string().trim().max(200).nullable().default(null),
    body: z.string().min(1).max(20_000),
    country_id: CountryId.nullable().default(null),
    city_id: CityId.nullable().default(null),
    is_public: z.boolean().default(false),
  })
  .refine(noteAnchored.check, noteAnchored.params);
export type CreateNoteRequest = z.infer<typeof CreateNoteRequest>;
export type CreateNoteInput = z.input<typeof CreateNoteRequest>;

/**
 * Either anchor may change alone; the server validates the pair the row ends
 * up with, because a client patching one side cannot see the other in the
 * same request (the same reasoning as `PatchStopRequest`).
 */
export const PatchNoteRequest = z
  .strictObject({
    title: z.string().trim().max(200).nullable().optional(),
    body: z.string().min(1).max(20_000).optional(),
    country_id: CountryId.nullable().optional(),
    city_id: CityId.nullable().optional(),
    is_public: z.boolean().optional(),
  })
  .refine(nonEmptyPatch, { message: 'A patch must change at least one field' });
export type PatchNoteRequest = z.infer<typeof PatchNoteRequest>;

/** `GET /trips/:tripId/notes?city_id=&country_id=` — either narrows the list. */
export const ListNotesQuery = z.strictObject({
  city_id: z.coerce.number().int().positive().optional(),
  country_id: z.coerce.number().int().positive().optional(),
});
export type ListNotesQuery = z.infer<typeof ListNotesQuery>;

/** A REST read never returns a deleted row; `deleted_at` is absent and refused. */
export const Note = NotePullShape.omit({ deleted_at: true }).refine(
  noteAnchored.check,
  noteAnchored.params,
);
export type Note = z.infer<typeof Note>;

export const NoteResponse = z.strictObject({ note: Note });
export type NoteResponse = z.infer<typeof NoteResponse>;

export const NotesResponse = z.strictObject({ notes: z.array(Note) });
export type NotesResponse = z.infer<typeof NotesResponse>;
