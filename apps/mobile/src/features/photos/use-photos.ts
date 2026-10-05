/**
 * A trip's photos as live local queries — tasks.md T211, T117 (FR-028,
 * FR-041; Constitution II).
 *
 * Screens read the encrypted local store through Drizzle's `useLiveQuery` (as
 * `use-notes.ts` does), so a capture shows up the moment SQLite commits it.
 * Writes go through the photos repository FIRST — each dirties its row — and
 * only then reach for the network, which is allowed to fail:
 *
 *   - `refile` files a photo under another of the trip's cities, or none; an
 *     uploaded photo's new filing is then PATCHed (refile.ts);
 *   - `remove` tombstones the photo, cancels its upload if one is running, and
 *     deletes its staged files (sync-protocol.md §4);
 *   - `retryUpload` puts a failed photo back in the queue and tries it.
 *
 * Each local write throws when it fails, so the screen can report it and say
 * so (`useWriteAttempt`); the network halves never throw.
 *
 * `usePhotoUploads` asks the upload queue (sync/upload-queue.ts — T134) to look
 * for work whenever the gallery gains focus — including the app coming back to
 * the foreground on it; the queue decides when and over what (Wi-Fi at once,
 * cellular after its hold-back). A traveller's own "Try again" (`retryUpload`)
 * is not opportunistic and goes straight to the upload (upload.ts).
 * `useFocusEffect` is expo-router's (https://docs.expo.dev/versions/v57.0.0/sdk/router.md).
 *
 * Visibility posture: private. Nothing here reads or writes `is_public`.
 */
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useDatabase } from '@/db/client';
import { photosRepository, type PhotoWithPlace } from '@/db/repositories/photos';
import type { PhotoRow } from '@/db/schema';
import type { LiveResult } from '@/features/trips/use-trips';
import { useAppActive } from '@/hooks/use-app-active';
import { kickUploadQueue } from '@/sync/upload-queue';

import { deletePhotoFiles } from './photo-files';
import { syncFiling } from './refile';
import { cancelUpload, uploadPhoto } from './upload';

/** A trip's live photos, newest first by the time taken, with their filed city. */
export function usePhotos(tripId: string): LiveResult<PhotoWithPlace[]> {
  const db = useDatabase();
  const result = useLiveQuery(photosRepository.forTripQuery(db, tripId), [tripId]);
  return {
    data: result.data,
    loading: result.updatedAt === undefined,
    error: result.error ?? null,
  };
}

export interface PhotoActions {
  /** File under `cityId`, or none. Throws if the local write fails. */
  refile: (photoId: string, cityId: number | null) => PhotoRow;
  /** Tombstone, cancel the upload, delete the files. Throws if the tombstone fails. */
  remove: (photoId: string) => void;
  /** Back in the upload queue, and try now. Throws if the local write fails. */
  retryUpload: (photoId: string) => void;
}

export function usePhotoActions(): PhotoActions {
  const db = useDatabase();
  return useMemo(
    () => ({
      refile: (photoId, cityId) => {
        const row = photosRepository.refile(db, photoId, cityId);
        void syncFiling(db, row);
        return row;
      },
      remove: (photoId) => {
        const staged = photosRepository.byId(db, photoId)?.local_file_uri ?? null;
        photosRepository.remove(db, photoId);
        cancelUpload(photoId);
        deletePhotoFiles(staged);
      },
      retryUpload: (photoId) => {
        photosRepository.markPending(db, photoId);
        void uploadPhoto(db, photoId);
      },
    }),
    [db],
  );
}

/** Ask the upload queue to look for work whenever the gallery is focused in the foreground. */
export function usePhotoUploads(_tripId: string): void {
  const active = useAppActive();
  useFocusEffect(
    useCallback(() => {
      if (active) void kickUploadQueue('focus');
    }, [active]),
  );
}
