/**
 * Where the gallery's bytes are, in one line — tasks.md T549 (FR-045; Constitution II;
 * UI-SPEC section 9.2 "Uploading 2 of 5 · 1 failed · Retry").
 *
 * Pure. The store knows three states for a photograph (`pending`, `failed`, `uploaded`) and
 * no progress, so the line says what is TRUE and no more: how many photographs are still
 * waiting to upload (queued or being sent, the store cannot tell which) and how many failed.
 * It never says "uploading N of M" for a share it does not have. The ring beside it is the
 * share of the trip's photographs whose bytes have arrived. Nothing is unfinished, nothing
 * is drawn (`null`).
 *
 * `isJustSynced` is the tick on a thumbnail: an uploaded photograph that has a file on this
 * device (so it was uploaded from here, not downloaded) and whose upload landed in the last
 * five minutes. Older photographs carry nothing: a tile with no mark is a photograph that
 * is safe.
 */
import type { PhotoWithPlace } from '@/db/repositories/photos';

export interface UploadSummary {
  waiting: number;
  failed: number;
  /** Photographs whose bytes are on the server. */
  uploaded: number;
  total: number;
  /** The failed photographs, for "Retry". */
  failedIds: string[];
  /** "2 waiting to upload", "1 failed": the visible parts, in order. */
  parts: string[];
  /** What a screen reader says for the whole line. */
  label: string;
}

/** The unfinished uploads of `photos`, or null when every photograph's bytes have arrived. */
export function summarizeUploads(
  photos: readonly Pick<PhotoWithPlace, 'id' | 'upload_state'>[],
): UploadSummary | null {
  const failedIds = photos.filter((p) => p.upload_state === 'failed').map((p) => p.id);
  const waiting = photos.filter((p) => p.upload_state === 'pending').length;
  const failed = failedIds.length;
  if (waiting === 0 && failed === 0) return null;

  const parts = [
    ...(waiting > 0 ? [`${waiting} waiting to upload`] : []),
    ...(failed > 0 ? [`${failed} failed`] : []),
  ];
  return {
    waiting,
    failed,
    uploaded: photos.length - waiting - failed,
    total: photos.length,
    failedIds,
    parts,
    label: `Photos: ${parts.join(', ')}`,
  };
}

/** How long after its upload a photograph still shows the tick. */
export const JUST_SYNCED_MS = 5 * 60 * 1000;

export function isJustSynced(
  photo: Pick<PhotoWithPlace, 'upload_state' | 'synced_at' | 'local_file_uri'>,
  now: number,
): boolean {
  if (photo.upload_state !== 'uploaded' || !photo.synced_at || !photo.local_file_uri) {
    return false;
  }
  const since = now - Date.parse(photo.synced_at);
  return Number.isFinite(since) && since >= 0 && since <= JUST_SYNCED_MS;
}
