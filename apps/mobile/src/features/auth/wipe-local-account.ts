/**
 * What this phone forgets when the account is deleted (feature 008, FR-005; Constitution V).
 *
 * Signing out leaves the traveller's encrypted, per-account database on disk so nothing is lost
 * (`db/client.ts`). Deleting the account is the opposite wish, and the server removes its copy: this
 * removes the phone's:
 *
 *   1. the staged photo files, their thumbnails and the sealed document files that the rows
 *      name (every row, including ones the traveller had already deleted: a tombstone still
 *      points at its file until the purge);
 *   2. the offline maps (Mapbox keeps them device-wide, so they are cleared the way a sign-out
 *      clears them, `clearOfflineMaps`);
 *   3. the database file itself, closed first.
 *
 * It never throws and never stops the sign-out that follows: whatever cannot be removed is
 * counted and reported to Sentry as a plain, content-free error (no path, no id, no title: a
 * path names a trip and a title is the traveller's own words), because an account that has been
 * deleted on the server and not signed out here would be the worse failure. The result says how
 * many files were named and how many steps failed.
 */
import { deleteDatabaseAsync } from 'expo-sqlite';

import { databaseFileName, type AppDatabase } from '@/db/client';
import { documents, photos } from '@/db/schema';
import { removeSealedFile } from '@/features/documents/document-vault';
import { photoFileOf, thumbnailFileOf } from '@/features/photos/photo-files';
import { clearOfflineMaps } from '@/lib/mapbox';
import { Sentry } from '@/lib/sentry';

/** The three native doors, so a test can stand in for them. */
export interface WipeDeps {
  closeDatabase: () => Promise<void>;
  deleteDatabase: (fileName: string) => Promise<void>;
  clearMaps: () => Promise<void>;
}

export interface WipeResult {
  /** Files the rows named (photos, thumbnails and documents each count once per row). */
  filesNamed: number;
  /** Steps and files that could not be removed; each was reported. */
  failures: number;
}

function realDeps(db: AppDatabase): WipeDeps {
  return {
    closeDatabase: () => db.$client.closeAsync(),
    deleteDatabase: (fileName) => deleteDatabaseAsync(fileName),
    clearMaps: clearOfflineMaps,
  };
}

/** One failure, reported without a path, an id or a title. */
function reportFailure(step: string): void {
  Sentry.captureException(new Error(`Account wipe: ${step} could not be removed.`));
}

/** Runs `remove`; a throw is counted and reported by `step`, never rethrown. */
function attempt(step: string, remove: () => void): number {
  try {
    remove();
    return 0;
  } catch {
    reportFailure(step);
    return 1;
  }
}

async function attemptAsync(step: string, remove: () => Promise<void>): Promise<number> {
  try {
    await remove();
    return 0;
  } catch {
    reportFailure(step);
    return 1;
  }
}

function removeFileIfPresent(file: { exists: boolean; delete: () => void } | null): void {
  if (file?.exists) file.delete();
}

export async function wipeLocalAccount(
  db: AppDatabase,
  userId: string,
  deps: WipeDeps = realDeps(db),
): Promise<WipeResult> {
  let failures = 0;

  const photoPaths = db.select({ path: photos.local_file_uri }).from(photos).all();
  const documentPaths = db
    .select({ path: documents.local_file_uri })
    .from(documents)
    .all();

  let filesNamed = 0;
  for (const { path } of photoPaths) {
    if (path === null) continue;
    filesNamed += 1;
    failures += attempt('a photo file', () => {
      removeFileIfPresent(photoFileOf(path));
      removeFileIfPresent(thumbnailFileOf(path));
    });
  }
  for (const { path } of documentPaths) {
    if (path === null) continue;
    filesNamed += 1;
    failures += attempt('a document file', () => removeSealedFile(path));
  }

  failures += await attemptAsync('the offline maps', deps.clearMaps);
  failures += await attemptAsync('the database', async () => {
    await deps.closeDatabase();
    await deps.deleteDatabase(databaseFileName(userId));
  });

  return { filesNamed, failures };
}
