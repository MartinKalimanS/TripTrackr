/**
 * Notes — local-first repository (tasks.md T206; FR-017, FR-018, FR-019;
 * Constitution II).
 *
 * Same rules as `trips.ts`: every write stamps `updated_at` and sets
 * `is_dirty`, deletes are tombstones, reads filter tombstones out. The one
 * invariant enforced here is FR-019 — at least a country anchor — checked
 * with the SAME predicate the wire schema uses, `noteAnchored`, so a row this
 * repository accepts is a row the server accepts at sync time.
 *
 * FR-017's three levels are one shape: trip-level is `city_id` null with the
 * trip's country, country-level is `country_id` set, city-level is both.
 * Moving a note (FR-018) is therefore `update()` with new anchors; the body
 * and `created_at` never change.
 */
import { noteAnchored } from '@triptrackr/contracts';
import { and, desc, eq, getTableColumns, isNull } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { cities, countries, notes, type NoteRow } from '@/db/schema';

import { nowIso } from './shared';

export interface NoteAnchor {
  country_id: number | null;
  city_id: number | null;
}

export interface CreateNoteInput extends NoteAnchor {
  /** Client-generated UUID (D-15). */
  id: string;
  trip_id: string;
  title: string | null;
  body: string;
  is_public?: boolean;
}

export interface NotePatch extends Partial<NoteAnchor> {
  title?: string | null;
  body?: string;
  is_public?: boolean;
}

export interface NotesFilter {
  country_id?: number;
  city_id?: number;
}

/** A note with the cached names of its anchors — null when never cached. */
export type NoteWithPlace = NoteRow & {
  country_name: string | null;
  city_name: string | null;
  /** The country's ISO alpha-2 code, for its flag; optional so a row built by hand need not carry it. */
  country_iso?: string | null;
};

export class NoteAnchorError extends Error {
  constructor() {
    super(noteAnchored.params.message);
    this.name = 'NoteAnchorError';
  }
}

function assertAnchored(anchor: NoteAnchor): void {
  if (!noteAnchored.check(anchor)) throw new NoteAnchorError();
}

/** Live notes of a trip, newest first, optionally narrowed to a country or city. Live-queryable. */
function forTripQuery(db: AppDatabase, tripId: string, filter: NotesFilter = {}) {
  return db
    .select({
      ...getTableColumns(notes),
      country_name: countries.name,
      country_iso: countries.iso_code,
      city_name: cities.name,
    })
    .from(notes)
    .leftJoin(countries, eq(countries.id, notes.country_id))
    .leftJoin(cities, eq(cities.id, notes.city_id))
    .where(
      and(
        eq(notes.trip_id, tripId),
        isNull(notes.deleted_at),
        filter.country_id !== undefined
          ? eq(notes.country_id, filter.country_id)
          : undefined,
        filter.city_id !== undefined ? eq(notes.city_id, filter.city_id) : undefined,
      ),
    )
    .orderBy(desc(notes.created_at), desc(notes.id));
}

function byId(db: AppDatabase, id: string): NoteRow | null {
  const [row] = db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deleted_at)))
    .all();
  return row ?? null;
}

function create(db: AppDatabase, input: CreateNoteInput): NoteRow {
  assertAnchored(input);
  const now = nowIso();
  const [row] = db
    .insert(notes)
    .values({
      id: input.id,
      trip_id: input.trip_id,
      country_id: input.country_id,
      city_id: input.city_id,
      title: input.title,
      body: input.body,
      is_public: input.is_public ?? false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
    })
    .returning()
    .all();
  if (!row) throw new Error('Note insert returned no row.');
  return row;
}

/**
 * Edit or move (FR-018). The anchor rule is checked on the pair the row ends
 * up with, so clearing one anchor while the other is already null is refused
 * before anything is written.
 */
function update(db: AppDatabase, id: string, patch: NotePatch): NoteRow {
  const current = byId(db, id);
  if (!current) throw new Error('Note not found.');

  assertAnchored({
    country_id: patch.country_id === undefined ? current.country_id : patch.country_id,
    city_id: patch.city_id === undefined ? current.city_id : patch.city_id,
  });

  const [row] = db
    .update(notes)
    .set({ ...patch, updated_at: nowIso(), is_dirty: true })
    .where(and(eq(notes.id, id), isNull(notes.deleted_at)))
    .returning()
    .all();
  if (!row) throw new Error('Note update returned no row.');
  return row;
}

/** Tombstone. The row stays until the server has been told (FR-039). */
function remove(db: AppDatabase, id: string): void {
  const now = nowIso();
  db.update(notes)
    .set({ deleted_at: now, updated_at: now, is_dirty: true })
    .where(and(eq(notes.id, id), isNull(notes.deleted_at)))
    .run();
}

export const notesRepository = { forTripQuery, byId, create, update, remove };
