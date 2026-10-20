import { Injectable } from '@nestjs/common';
import { NotePushRecord } from '@triptrackr/contracts';
import { and, eq } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { notes } from '@/db/schema';

import type { PushTableHandler, StoredRow, WriteTimes } from './push-handler';
import {
  inOwnTrips,
  requireKnownCity,
  requireKnownCountry,
  requireOwnTrip,
} from './push-scope';

/**
 * `notes` on the push path (tasks.md T128; FR-017..FR-019, FR-053, FR-039;
 * research D-15).
 *
 * **The anchor (FR-019)** is the contracts' own refine, `noteAnchored`, which
 * the strict `NotePushRecord` carries: a note with neither country nor city
 * never reaches this handler. The same predicate guards the REST routes and the
 * device's local write, so the three cannot disagree. An unknown country or city
 * is `invalid` — checked first, because a raised foreign-key violation is a
 * database error, not a refusal.
 *
 * **Visibility is independent (FR-053).** `is_public` is stored as sent: a
 * public note on a private trip stays unreachable, because the trip is the outer
 * envelope and the policy (0005 `notes_public_read`) says so, not this handler.
 * A note created offline and marked public therefore neither leaks nor vanishes
 * when it syncs (Constitution II).
 *
 * A note's `trip_id` is fixed when it is created; moving between levels
 * (FR-018) is an edit of `country_id` and `city_id`, which leaves the body and
 * the creation date untouched.
 *
 * Visibility posture: owner-only on this path; the public read of a public note
 * in a public trip is the curated view of User Story 7.
 */

type NotePush = NotePushRecord;

interface StoredNote extends StoredRow {
  readonly tripId: string;
  readonly countryId: number | null;
  readonly cityId: number | null;
  readonly title: string | null;
  readonly body: string;
  readonly isPublic: boolean;
}

@Injectable()
export class NotesPushHandler implements PushTableHandler<NotePush, StoredNote> {
  readonly table = 'notes' as const;
  readonly schema = NotePushRecord;
  readonly creates = true;

  async lock(id: string): Promise<StoredNote | null> {
    const [row] = await rlsDb()
      .select({
        id: notes.id,
        updatedAt: notes.updatedAt,
        deletedAt: notes.deletedAt,
        tripId: notes.tripId,
        countryId: notes.countryId,
        cityId: notes.cityId,
        title: notes.title,
        body: notes.body,
        isPublic: notes.isPublic,
      })
      .from(notes)
      .where(and(eq(notes.id, id), inOwnTrips(notes.tripId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(stored: StoredNote, incoming: NotePush): NotePush {
    return { ...incoming, trip_id: stored.tripId };
  }

  samePayload(stored: StoredNote, incoming: NotePush): boolean {
    return (
      stored.countryId === incoming.country_id &&
      stored.cityId === incoming.city_id &&
      stored.title === incoming.title &&
      stored.body === incoming.body &&
      stored.isPublic === incoming.is_public
    );
  }

  async checkReferences(incoming: NotePush): Promise<void> {
    await requireOwnTrip(incoming.trip_id, { live: !incoming.deleted });
    await requireKnownCountry(incoming.country_id);
    await requireKnownCity(incoming.city_id);
  }

  async insert(incoming: NotePush, at: WriteTimes): Promise<boolean> {
    const rows = await rlsDb()
      .insert(notes)
      .values({
        id: incoming.id,
        tripId: incoming.trip_id,
        countryId: incoming.country_id,
        cityId: incoming.city_id,
        title: incoming.title,
        body: incoming.body,
        isPublic: incoming.is_public,
        updatedAt: at.updatedAt,
        deletedAt: incoming.deleted ? at.deletedAt : null,
      })
      .onConflictDoNothing()
      .returning({ id: notes.id });

    return rows.length > 0;
  }

  async update(stored: StoredNote, incoming: NotePush, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(notes)
      .set({
        countryId: incoming.country_id,
        cityId: incoming.city_id,
        title: incoming.title,
        body: incoming.body,
        isPublic: incoming.is_public,
        updatedAt: at.updatedAt,
      })
      .where(and(eq(notes.id, stored.id), inOwnTrips(notes.tripId)));
  }

  async tombstone(stored: StoredNote, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(notes)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(notes.id, stored.id), inOwnTrips(notes.tripId)));
  }
}
