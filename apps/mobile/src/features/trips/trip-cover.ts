/**
 * A trip's cover — tasks.md T429 (FR-011, FR-012; data-model.md §4; research
 * D4-09). Derived on every read from local rows, never stored, never sent.
 *
 * First match wins:
 *   1. `trips.cover_photo_id` names a candidate photo of THIS trip whose
 *      `thumbnailUri(local_file_uri)` is non-null;
 *   2. otherwise the trip's earliest such candidate: `taken_at` (undated last),
 *      then `created_at`, then `id`;
 *   3. otherwise a typographic cover: the title's initial and the derived status.
 *
 * Candidates come from `photosRepository.coverCandidatesQuery` (live photos
 * that still name a file). They may span every trip: a photo of another trip is
 * never returned, even when `cover_photo_id` names it.
 *
 * Visibility posture: private. Reads the signed-in traveller's own local rows
 * and builds a path to a thumbnail on the device; nothing is fetched, stored or
 * transmitted. The card draws the thumbnail and, if it will not draw, falls back
 * to `typographicCover` (data-model.md §4, failure handling).
 */
import type { CoverCandidate } from '@/db/repositories/photos';
import type { TripRow } from '@/db/schema';
import { thumbnailUri } from '@/features/photos/photo-files';

import type { TripStatus } from './trip-status';

export type TripCover =
  | { kind: 'photo'; photoId: string; thumbnailUri: string } // cover_photo_id, else earliest photo
  | { kind: 'typographic'; initial: string; status: TripStatus }; // no usable photo

type CoverTrip = Pick<TripRow, 'id' | 'title' | 'cover_photo_id'>;
type PhotoCover = Extract<TripCover, { kind: 'photo' }>;

/** What shows when a trip has no usable photo, or its thumbnail will not draw. */
export function typographicCover(
  trip: Pick<TripRow, 'title'>,
  status: TripStatus,
): Extract<TripCover, { kind: 'typographic' }> {
  return { kind: 'typographic', initial: initialOf(trip.title), status };
}

/** The first letter as one code point (never half an emoji), uppercased; `?` if none. */
function initialOf(title: string): string {
  const first = Array.from(title.trim())[0];
  if (first === undefined) return '?';
  // `ß` uppercases to `SS`: keep one code point so the mark stays a single glyph.
  return Array.from(first.toUpperCase())[0] ?? '?';
}

function photoCover(photo: CoverCandidate): PhotoCover | null {
  const uri = thumbnailUri(photo.local_file_uri);
  return uri === null ? null : { kind: 'photo', photoId: photo.id, thumbnailUri: uri };
}

/** Earliest first: dated before undated, then `created_at`, then `id`. */
function compareCandidates(a: CoverCandidate, b: CoverCandidate): number {
  if (a.taken_at !== b.taken_at) {
    if (a.taken_at === null) return 1;
    if (b.taken_at === null) return -1;
    return a.taken_at < b.taken_at ? -1 : 1;
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** The trip's earliest candidate that has a thumbnail, or null. One pass, no copy. */
function earliestCover(candidates: readonly CoverCandidate[]): PhotoCover | null {
  let earliest: CoverCandidate | null = null;
  for (const candidate of candidates) {
    if (thumbnailUri(candidate.local_file_uri) === null) continue;
    if (earliest === null || compareCandidates(candidate, earliest) < 0) {
      earliest = candidate;
    }
  }
  return earliest && photoCover(earliest);
}

export function resolveTripCover(
  trip: CoverTrip,
  candidates: readonly CoverCandidate[],
  status: TripStatus,
): TripCover {
  const own = candidates.filter((candidate) => candidate.trip_id === trip.id);

  const designated = own.find((candidate) => candidate.id === trip.cover_photo_id);
  const cover = (designated && photoCover(designated)) ?? earliestCover(own);
  return cover ?? typographicCover(trip, status);
}
