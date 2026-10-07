/**
 * A trip's cover — tasks.md T429 (FR-011, FR-012; data-model.md §4; research
 * D4-09). Derived on every read from local rows, never stored, never sent.
 *
 * First match wins:
 *   1. `trips.cover_photo_id` names a candidate photo of THIS trip whose
 *      `thumbnailUri(local_file_uri)` is non-null;
 *   2. otherwise the trip's earliest such candidate;
 *   3. otherwise a typographic cover: the title's initial and the derived status.
 *
 * "Earliest" is not decided here. `photosRepository.coverCandidatesQuery` returns
 * each trip's photos earliest-taken first (undated last, then `created_at`, then
 * `id`), so the first usable candidate of a trip is its earliest. The rule
 * therefore does not sort: its precondition is that `candidates` are in
 * `coverCandidatesQuery` order, or a subsequence of it (a trip's group, or every
 * trip's rows, which the trip filter below narrows without reordering).
 *
 * That order is textual, and textual order is chronological because every
 * `taken_at` / `created_at` is a UTC instant ending in `Z`: the contract's
 * `IsoDateTime` (`packages/contracts/src/scalars.ts`, "Always UTC"; the photo's
 * `taken_at` is `IsoDateTime.nullable()`) admits offsets in syntax, but the device
 * writes `toISOString()` and the server answers in UTC (`INSTANT_FORMAT`), so none
 * is ever stored. They differ in precision (milliseconds on the device,
 * microseconds from the server), below what a cover needs.
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

/**
 * One pass over `candidates` (precondition: `coverCandidatesQuery` order), one
 * `thumbnailUri` per candidate, no sort and no copy. The first usable candidate of
 * the trip is its earliest photo; the designated one, wherever it sits, beats it.
 */
export function resolveTripCover(
  trip: CoverTrip,
  candidates: readonly CoverCandidate[],
  status: TripStatus,
): TripCover {
  const designatedId = trip.cover_photo_id;
  let earliest: PhotoCover | null = null;

  for (const candidate of candidates) {
    if (candidate.trip_id !== trip.id) continue; // never another trip's photo
    const isDesignated = candidate.id === designatedId;
    // Once the earliest is known, only the designated photo can still win.
    if (earliest !== null && !isDesignated) continue;

    const cover = photoCover(candidate);
    if (cover === null) continue;
    if (isDesignated) return cover;

    earliest = cover;
    if (designatedId === null) break; // nothing designated: the first usable is final
  }
  return earliest ?? typographicCover(trip, status);
}
