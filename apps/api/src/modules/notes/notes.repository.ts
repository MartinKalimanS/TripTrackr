import { Injectable } from '@nestjs/common';
import type { ListNotesQuery } from '@triptrackr/contracts';
import { asc, desc, eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { liveOnly } from '@/common/db/soft-delete.scope';
import { cities, countries, notes } from '@/db/schema';

/** The note columns the owner view serialises; `deleted_at` has no slot in the contract. */
const NOTE_COLUMNS = {
  id: notes.id,
  tripId: notes.tripId,
  countryId: notes.countryId,
  cityId: notes.cityId,
  title: notes.title,
  body: notes.body,
  isPublic: notes.isPublic,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
};

export type NoteRow = Pick<typeof notes.$inferSelect, keyof typeof NOTE_COLUMNS>;

export interface NewNote {
  readonly id?: string;
  readonly tripId: string;
  readonly countryId: number | null;
  readonly cityId: number | null;
  readonly title: string | null;
  readonly body: string;
  readonly isPublic: boolean;
}

export interface NotePatch {
  readonly countryId?: number | null;
  readonly cityId?: number | null;
  readonly title?: string | null;
  readonly body?: string;
  readonly isPublic?: boolean;
}

/**
 * Every query against `notes`, on the request's RLS transaction (rls-db.ts).
 *
 * `notes_owner_all` (0005) decides what exists for the caller; the trip
 * ownership check in the service runs first so a stranger's request reads as
 * `TRIP_NOT_FOUND`. `notes_public_read` also exists, for the curated public
 * view of the social story — these owner routes never serve it, and a public
 * note reached through them by a non-owner would be a defect, which is why
 * every write below is additionally scoped by the owner view's trip check.
 *
 * No statement here can raise on a caller's mistake: anchors are checked for
 * existence and for FR-019 in the service before any write, and client-chosen
 * ids use `ON CONFLICT DO NOTHING` (0008's header).
 */
@Injectable()
export class NotesRepository {
  listForTrip(tripId: string, query: ListNotesQuery): Promise<NoteRow[]> {
    return rlsDb()
      .select(NOTE_COLUMNS)
      .from(notes)
      .where(
        liveOnly(
          notes,
          eq(notes.tripId, tripId),
          query.city_id !== undefined ? eq(notes.cityId, query.city_id) : undefined,
          query.country_id !== undefined
            ? eq(notes.countryId, query.country_id)
            : undefined,
        ),
      )
      .orderBy(desc(notes.createdAt), asc(notes.id));
  }

  async findLive(noteId: string): Promise<NoteRow | null> {
    const [row] = await rlsDb()
      .select(NOTE_COLUMNS)
      .from(notes)
      .where(liveOnly(notes, eq(notes.id, noteId)))
      .limit(1);

    return row ?? null;
  }

  /** Null when the id is already taken — the caller decides what that means. */
  async insert(note: NewNote): Promise<NoteRow | null> {
    const [row] = await rlsDb()
      .insert(notes)
      .values({
        ...(note.id !== undefined && { id: note.id }),
        tripId: note.tripId,
        countryId: note.countryId,
        cityId: note.cityId,
        title: note.title,
        body: note.body,
        isPublic: note.isPublic,
      })
      .onConflictDoNothing()
      .returning(NOTE_COLUMNS);

    return row ?? null;
  }

  async update(noteId: string, patch: NotePatch): Promise<NoteRow | null> {
    const [row] = await rlsDb()
      .update(notes)
      .set({
        ...(patch.countryId !== undefined && { countryId: patch.countryId }),
        ...(patch.cityId !== undefined && { cityId: patch.cityId }),
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.body !== undefined && { body: patch.body }),
        ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
        updatedAt: sql`now()`,
      })
      .where(liveOnly(notes, eq(notes.id, noteId)))
      .returning(NOTE_COLUMNS);

    return row ?? null;
  }

  async tombstone(noteId: string): Promise<boolean> {
    const now = sql`now()`;
    const rows = await rlsDb()
      .update(notes)
      .set({ deletedAt: now, updatedAt: now })
      .where(liveOnly(notes, eq(notes.id, noteId)))
      .returning({ id: notes.id });

    return rows.length > 0;
  }

  async cityExists(cityId: number): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: cities.id })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);
    return rows.length > 0;
  }

  async countryExists(countryId: number): Promise<boolean> {
    const rows = await rlsDb()
      .select({ id: countries.id })
      .from(countries)
      .where(eq(countries.id, countryId))
      .limit(1);
    return rows.length > 0;
  }
}
