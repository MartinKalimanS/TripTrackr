/**
 * Telling the server where a photo is filed — tasks.md T117 (FR-028;
 * rest-api.md §5 `PATCH /photos/:id`).
 *
 * A refile is a LOCAL write first (`photosRepository.refile` — the row is
 * dirty the moment the traveller chooses). This is the online half, attempted
 * straight after:
 *
 *   - a photo whose bytes are still pending is not patched: the server has no
 *     row for it yet, and its registration will carry the filing as it stands;
 *   - an uploaded photo is patched with `{ city_id }` (`PatchPhotoRequest`),
 *     and on success the row is cleaned — compare-and-set on the `updated_at`
 *     the patch was built from, so a second refile made while the first was in
 *     flight is not marked synced by the first one's answer;
 *   - offline, or any waiting failure (upload.ts `isWaitingError`), the row
 *     simply stays dirty for the sync engine (User Story 6); anything else is
 *     reported as well.
 *
 * Visibility posture: the patch carries the filing only — never `is_public`,
 * which no control in this story sets (User Story 7).
 */
import { PhotoResponse, type PatchPhotoRequest } from '@triptrackr/contracts';

import type { AppDatabase } from '@/db/client';
import { photosRepository } from '@/db/repositories/photos';
import { nowIso } from '@/db/repositories/shared';
import type { PhotoRow } from '@/db/schema';
import { apiFetch } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

import { isWaitingError } from './upload';

export type FilingOutcome =
  /** The server holds the filing and the row is clean. */
  | 'synced'
  /** Not now; the row stays dirty for the sync engine. */
  | 'waiting'
  /** Nothing to patch yet: the registration will carry it. */
  | 'skipped';

/** Patch the filing of `row` — the row as the refile left it. Never rejects. */
export async function syncFiling(db: AppDatabase, row: PhotoRow): Promise<FilingOutcome> {
  if (row.upload_state !== 'uploaded') return 'skipped';
  const body: PatchPhotoRequest = { city_id: row.city_id };
  try {
    const { photo } = await apiFetch(PhotoResponse, `/photos/${row.id}`, {
      method: 'PATCH',
      body,
    });
    photosRepository.markSynced(db, row.id, {
      sentUpdatedAt: row.updated_at,
      syncedAt: nowIso(),
      server: {
        moderation_state: photo.moderation_state,
        has_thumbnail: photo.has_thumbnail,
      },
    });
    return 'synced';
  } catch (error) {
    if (!isWaitingError(error)) Sentry.captureException(error);
    return 'waiting';
  }
}
