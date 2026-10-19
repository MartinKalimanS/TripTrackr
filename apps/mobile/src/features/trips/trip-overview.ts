/**
 * What a trip's five areas say about themselves - tasks.md T544 (spec FR-039, FR-043; data-model
 * sections 6 and 9; research D5-17): how many photos, notes, expenses and documents, the exact
 * spending total, how many photos failed to upload, a picture of each city the traveller has
 * one of, and the trip's cover.
 *
 * `summariseTripOverview` is pure over rows the screens of those areas already read, and
 * `useTripOverview` composes their existing live reads (`usePhotos`, `useNotes`,
 * `useDocuments`, `useExpenses`): no new query, no schema, no sync field. The spending total
 * is `sumAmounts` of `@triptrackr/contracts` (`decimal.js`), converted rows only, as the
 * Spending screen totals them; a `Number` never touches an amount (SC-016).
 *
 * Visibility posture: private, local, never transmitted, nothing new stored. It reads the
 * signed-in traveller's own rows only; the expenses and documents it counts appear in no
 * view that could be shared (FR-084; Constitution I).
 */
import { sumAmounts } from '@triptrackr/contracts';
import { useMemo } from 'react';

import type { CoverCandidate } from '@/db/repositories/photos';
import type { ExpenseRow, PhotoRow, TripRow } from '@/db/schema';
import { useDocuments } from '@/features/documents/use-documents';
import { useExpenses } from '@/features/expenses/use-expenses';
import { useNotes } from '@/features/notes/use-notes';
import { thumbnailUri } from '@/features/photos/photo-files';
import { usePhotos } from '@/features/photos/use-photos';

import { resolveTripCover, type TripCover } from './trip-cover';
import type { TripStatus } from './trip-status';

type PhotoFacts = Pick<
  PhotoRow,
  | 'id'
  | 'trip_id'
  | 'city_id'
  | 'taken_at'
  | 'created_at'
  | 'upload_state'
  | 'local_file_uri'
> & { is_dirty?: boolean };

/** A row of an area, as far as this view reads it: only whether it is still on this device. */
interface DirtyFacts {
  is_dirty?: boolean;
}

export interface OverviewInput {
  trip: Pick<TripRow, 'id' | 'title' | 'cover_photo_id'>;
  status: TripStatus;
  photos: readonly PhotoFacts[];
  /** Only how many and whether each is synchronised: a note's words are not this view's business. */
  notes: readonly DirtyFacts[];
  documents: readonly DirtyFacts[];
  expenses: readonly (Pick<ExpenseRow, 'amount_home' | 'fx_pending'> & DirtyFacts)[];
}

export interface TripOverview {
  counts: { photos: number; notes: number; expenses: number; documents: number };
  /** Exact decimal string with two places, in the trip's home currency. */
  spendingTotal: string;
  /** Photos whose bytes failed to reach the object store (they are safe on the phone). */
  failedPhotos: number;
  /** Which photos, in the order given, so each can be put back in the upload queue. */
  failedPhotoIds: readonly string[];
  /** Rows of the five areas not yet synchronised (`is_dirty`): changes still on this device. */
  pending: number;
  /** City id to the thumbnail of the earliest photograph filed under it. */
  cityThumbs: ReadonlyMap<number, string>;
  cover: TripCover;
}

/**
 * `coverCandidatesQuery` order: earliest-taken first, dated before undated, then earliest
 * added, then id. `resolveTripCover` does not sort, it takes the first usable candidate, so
 * it must be handed this order. Text order is chronological because every instant is UTC
 * and ends in `Z` (`trip-cover.ts`).
 */
function inCoverOrder(photos: readonly PhotoFacts[]): PhotoFacts[] {
  return [...photos].sort((a, b) => {
    if ((a.taken_at === null) !== (b.taken_at === null))
      return a.taken_at === null ? 1 : -1;
    return (
      (a.taken_at ?? '').localeCompare(b.taken_at ?? '') ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
    );
  });
}

/** The first photograph of each city, in the order given (earliest first). */
function cityThumbnails(ordered: readonly PhotoFacts[]): Map<number, string> {
  const thumbs = new Map<number, string>();
  for (const photo of ordered) {
    if (photo.city_id === null || thumbs.has(photo.city_id)) continue;
    const uri = thumbnailUri(photo.local_file_uri);
    if (uri !== null) thumbs.set(photo.city_id, uri);
  }
  return thumbs;
}

const isPending = (row: DirtyFacts) => row.is_dirty === true;

export function summariseTripOverview(input: OverviewInput): TripOverview {
  const ordered = inCoverOrder(input.photos);
  const failed = input.photos.filter((photo) => photo.upload_state === 'failed');
  const converted = input.expenses.filter(
    (row) => !row.fx_pending && row.amount_home !== null,
  );
  return {
    counts: {
      photos: input.photos.length,
      notes: input.notes.length,
      expenses: input.expenses.length,
      documents: input.documents.length,
    },
    spendingTotal: sumAmounts(converted.map((row) => row.amount_home as string)),
    failedPhotos: failed.length,
    failedPhotoIds: failed.map((photo) => photo.id),
    pending: [
      ...input.photos,
      ...input.notes,
      ...input.documents,
      ...input.expenses,
    ].filter(isPending).length,
    cityThumbs: cityThumbnails(ordered),
    cover: resolveTripCover(input.trip, ordered as CoverCandidate[], input.status),
  };
}

export interface LiveTripOverview extends TripOverview {
  /** Some area has not answered yet; what it has is already in the figures. */
  loading: boolean;
}

export function useTripOverview(
  trip: OverviewInput['trip'],
  status: TripStatus,
): LiveTripOverview {
  const photos = usePhotos(trip.id);
  const notes = useNotes(trip.id);
  const documents = useDocuments(trip.id);
  const expenses = useExpenses(trip.id);
  const loading =
    photos.loading || notes.loading || documents.loading || expenses.loading;

  return useMemo(
    () => ({
      ...summariseTripOverview({
        trip,
        status,
        photos: photos.data,
        notes: notes.data,
        documents: documents.data,
        expenses: expenses.data,
      }),
      loading,
    }),
    [trip, status, photos.data, notes.data, documents.data, expenses.data, loading],
  );
}
