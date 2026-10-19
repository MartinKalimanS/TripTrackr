/**
 * What the trip screen says about synchronisation - tasks.md T546 (spec FR-026, FR-043, FR-065;
 * data-model section 8): the one chip and the one slim banner (offline, an upload that failed,
 * a sync that failed), with the Retry each has.
 *
 * `deriveTripSync` is pure over the sync runtime's existing status (`useSyncStatus`: the phase
 * and the last cycle's failure) and the counts of THIS trip (the changes still on the device,
 * the photos that failed to upload). `useTripSync` binds it to that status and to the two
 * retries: the failed uploads go back in the queue (`retryUpload`, which writes locally first
 * and then tries), a failed sync runs a cycle now (`syncNow('manual')`).
 *
 * THIS IS A LOCAL SEAM for the chrome branch's global chip state (T529: dirty rows across the
 * seven tables, the network, the runtime). Until it lands the chip counts the changes still
 * waiting on this trip (the trip, its stops and the rows of its five areas). It reads status
 * and counts and writes nothing: a record not yet uploaded is never shown as saved, and
 * nothing here changes what is synchronised (FR-081).
 *
 * One banner, never two: offline wins (nothing else can be done about it), then uploads that
 * failed (the Photos tile is ringed with it), then a sync that failed. The words are the spec's
 * (FR-065): the data is safe on the phone and a verb says what to do.
 */
import { useCallback, useMemo } from 'react';

import type { SyncChipState } from '@/components/ui/sync-chip';
import { usePhotoActions } from '@/features/photos/use-photos';
import { syncNow, useSyncStatus } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

/** What the banner's Retry does: put the failed photos back in the queue, or sync now. */
export type BannerAction = 'photos' | 'sync' | null;

export interface TripBanner {
  tone: 'offline' | 'error';
  message: string;
  action: BannerAction;
}

export interface TripSyncInput {
  status: SyncStatus;
  /** Changes still on this device that belong to this trip. */
  pending: number;
  /** Photos of this trip whose upload failed. */
  failedPhotos: number;
}

export interface DerivedTripSync {
  state: SyncChipState;
  banner: TripBanner | null;
}

const changes = (count: number) => `${count} ${count === 1 ? 'change' : 'changes'}`;

export function offlineMessage(count: number): string {
  return count > 0
    ? `Offline. ${changes(count)} will sync when you're back online.`
    : "Offline. Changes will sync when you're back online.";
}

function uploadsMessage(count: number): string {
  return count === 1
    ? "1 photo couldn't upload. It is safe on this phone."
    : `${count} photos couldn't upload. They are safe on this phone.`;
}

function syncFailedMessage(pending: number): string {
  const what = pending > 0 ? `Couldn't sync ${changes(pending)}.` : "Couldn't sync.";
  return `${what} Your trips are safe on this phone.`;
}

const isServerFailure = (status: SyncStatus) =>
  status.failure === 'server' || status.failure === 'invalid_response';

function chipStateOf({ status, pending }: TripSyncInput): SyncChipState {
  if (status.failure === 'offline') return { kind: 'offline', count: pending };
  if (isServerFailure(status)) return { kind: 'failed', count: pending };
  if (pending === 0) return { kind: 'synced' };
  return status.phase === 'idle'
    ? { kind: 'waiting', count: pending }
    : { kind: 'syncing', count: pending };
}

function bannerOf({ status, pending, failedPhotos }: TripSyncInput): TripBanner | null {
  if (status.failure === 'offline') {
    return { tone: 'offline', message: offlineMessage(pending), action: null };
  }
  if (failedPhotos > 0) {
    return { tone: 'error', message: uploadsMessage(failedPhotos), action: 'photos' };
  }
  if (isServerFailure(status)) {
    return { tone: 'error', message: syncFailedMessage(pending), action: 'sync' };
  }
  return null;
}

export function deriveTripSync(input: TripSyncInput): DerivedTripSync {
  return { state: chipStateOf(input), banner: bannerOf(input) };
}

export interface TripSyncSources {
  trip: { is_dirty: boolean };
  stops: readonly { is_dirty: boolean }[];
  overview: { pending: number; failedPhotoIds: readonly string[] };
}

export interface TripSync extends DerivedTripSync {
  /** The banner's Retry. Throws if the local write of a retried photo fails. */
  retry: () => void;
  /** The chip's Retry: a failed sync runs a cycle now. */
  retrySync: () => void;
}

export function useTripSync({ trip, stops, overview }: TripSyncSources): TripSync {
  const status = useSyncStatus();
  const photos = usePhotoActions();
  const pending =
    (trip.is_dirty ? 1 : 0) +
    stops.filter((stop) => stop.is_dirty).length +
    overview.pending;
  const derived = useMemo(
    () =>
      deriveTripSync({ status, pending, failedPhotos: overview.failedPhotoIds.length }),
    [status, pending, overview.failedPhotoIds.length],
  );

  const retrySync = useCallback(() => {
    void syncNow('manual');
  }, []);
  const retry = useCallback(() => {
    if (derived.banner?.action === 'photos') {
      for (const id of overview.failedPhotoIds) photos.retryUpload(id);
    } else {
      retrySync();
    }
  }, [derived.banner?.action, overview.failedPhotoIds, photos, retrySync]);

  return { ...derived, retry, retrySync };
}
