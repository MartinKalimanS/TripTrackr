import { HttpStatus, Injectable } from '@nestjs/common';
import {
  noteAnchored,
  type CreateNoteRequest,
  type ListNotesQuery,
  type Note,
  type PatchNoteRequest,
} from '@triptrackr/contracts';

import { apiError, notFound } from '@/common/errors/api-error';
import { TripsService } from '@/modules/trips/trips.service';

import { NotesRepository, type NoteRow } from './notes.repository';

/** The one not-found for every `/notes/:id` route — contracts/README.md rule 1. */
export const noteNotFound = () => notFound('NOTE_NOT_FOUND', 'Note');

const VALIDATION_MESSAGE =
  'Some of the information provided is not valid. Please check it and try again.';

function validationFailed(path: string, message: string) {
  return apiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', VALIDATION_MESSAGE, {
    issues: [{ path, message }],
  });
}

/**
 * Notes (rest-api.md §4; FR-017, FR-018, FR-019). Access rule: owner, in this
 * story — the public read of a public note inside a public trip is the
 * curated view of FR-055 and arrives with the social story behind the sync
 * gate.
 *
 * Trip-scoped operations load the trip through the owner view first, so a
 * stranger is answered `TRIP_NOT_FOUND` before any note is looked at.
 * Row-scoped operations rely on the policy: a note the caller cannot see is
 * `NOTE_NOT_FOUND`, the same answer as for a note that never existed.
 *
 * FR-019 is checked on the pair the row will END UP with, using the wire's
 * own predicate `noteAnchored`, before any statement runs — the database
 * CHECK behind it must never be what answers, because a raised constraint
 * poisons the request transaction (0008's header).
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly repository: NotesRepository,
    private readonly trips: TripsService,
  ) {}

  async list(tripId: string, query: ListNotesQuery): Promise<Note[]> {
    await this.trips.loadOwned(tripId);
    const rows = await this.repository.listForTrip(tripId, query);
    return rows.map(toNote);
  }

  async create(tripId: string, request: CreateNoteRequest): Promise<Note> {
    await this.trips.loadOwned(tripId);

    // A replayed create is the same create (research D-15).
    if (request.id) {
      const existing = await this.repository.findLive(request.id);
      if (existing?.tripId === tripId) return toNote(existing);
    }

    await this.assertAnchors(request.country_id, request.city_id);

    const row = await this.repository.insert({
      id: request.id,
      tripId,
      countryId: request.country_id,
      cityId: request.city_id,
      title: request.title,
      body: request.body,
      isPublic: request.is_public,
    });
    if (!row) {
      throw apiError(
        HttpStatus.CONFLICT,
        'NOTE_ID_UNAVAILABLE',
        'That note id is already in use. Please retry with a new id.',
      );
    }

    return toNote(row);
  }

  /** Including moving between levels (FR-018): the body and creation date travel untouched. */
  async patch(noteId: string, patch: PatchNoteRequest): Promise<Note> {
    const current = await this.repository.findLive(noteId);
    if (!current) throw noteNotFound();

    const countryId =
      patch.country_id === undefined ? current.countryId : patch.country_id;
    const cityId = patch.city_id === undefined ? current.cityId : patch.city_id;
    await this.assertAnchors(countryId, cityId);

    const row = await this.repository.update(noteId, {
      countryId: patch.country_id,
      cityId: patch.city_id,
      title: patch.title,
      body: patch.body,
      isPublic: patch.is_public,
    });
    if (!row) throw noteNotFound();

    return toNote(row);
  }

  async remove(noteId: string): Promise<void> {
    const deleted = await this.repository.tombstone(noteId);
    if (!deleted) throw noteNotFound();
  }

  private async assertAnchors(
    countryId: number | null,
    cityId: number | null,
  ): Promise<void> {
    if (!noteAnchored.check({ country_id: countryId, city_id: cityId })) {
      throw validationFailed('country_id', noteAnchored.params.message);
    }
    if (countryId !== null && !(await this.repository.countryExists(countryId))) {
      throw validationFailed('country_id', 'Unknown country');
    }
    if (cityId !== null && !(await this.repository.cityExists(cityId))) {
      throw validationFailed('city_id', 'Unknown city');
    }
  }
}

/** Row → wire shape (contracts/api/notes.ts `Note`). */
export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    trip_id: row.tripId,
    country_id: row.countryId,
    city_id: row.cityId,
    title: row.title,
    body: row.body,
    is_public: row.isPublic,
  };
}
