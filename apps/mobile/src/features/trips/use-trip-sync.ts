/**
 * What the trip screen says about synchronisation - tasks.md T546 and T529 (spec FR-026, FR-043,
 * FR-065; data-model section 8): the one chip and the one slim banner (offline, an upload that
 * failed, a sync that failed), with the Retry each has.
 *
 * The chip is the ONE global one (`useSyncChipState`: the dirty rows of the seven synchronised
 * tables, the network and the runtime), not a count of this trip alone: a record not yet
 * uploaded is never shown as saved, wherever it belongs. `deriveTripSync` is pure over that
 * state and the number of THIS trip's photos whose upload failed (the Photos tile is ringed with
 * it). `useTripSync` binds it to the two retries: the failed uploads go back in the queue
 * (`retryUpload`, which writes locally first and then tries), a failed sync runs a cycle now
 * (`syncNow('manual')`). It reads and writes nothing and changes nothing that is
 * synchronised (FR-081).
 *
 * One banner, never two: offline wins (nothing else can be done about it), then uploads that
 * failed, then a sync that failed. The words are the spec's (FR-065): the data is safe on the
 * phone and a verb says what to do.
 */
import { useCallback, useMemo } from 'react';

import { usePhotoActions } from '@/features/photos/use-photos';
import {
  useSyncChipState,
  type SyncChipState,
} from '@/features/sync/use-sync-chip-state';
import { syncNow } from '@/sync/engine';

/** What the banner's Retry does: put the failed photos back in the queue, or sync now. */
export type BannerAction = 'photos' | 'sync' | null;

export interface TripBanner {
  tone: 'offline' | 'error';
  message: string;
  action: BannerAction;
}

export interface TripSyncInput {
  /** The global chip state. */
  chip: SyncChipState;
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

function bannerOf({ chip, failedPhotos }: TripSyncInput): TripBanner | null {
  if (chip.kind === 'offline') {
    return { tone: 'offline', message: offlineMessage(chip.count), action: null };
  }
  if (failedPhotos > 0) {
    return { tone: 'error', message: uploadsMessage(failedPhotos), action: 'photos' };
  }
  if (chip.kind === 'failed') {
    return { tone: 'error', message: syncFailedMessage(chip.count), action: 'sync' };
  }
  return null;
}

export function deriveTripSync(input: TripSyncInput): DerivedTripSync {
  return { state: input.chip, banner: bannerOf(input) };
}

export interface TripSyncSources {
  overview: { failedPhotoIds: readonly string[] };
}

export interface TripSync extends DerivedTripSync {
  /** The banner's Retry. Throws if the local write of a retried photo fails. */
  retry: () => void;
  /** The chip's Retry: a failed sync runs a cycle now. */
  retrySync: () => void;
}

export function useTripSync({ overview }: TripSyncSources): TripSync {
  const chip = useSyncChipState();
  const photos = usePhotoActions();
  const failedPhotos = overview.failedPhotoIds.length;
  const derived = useMemo(
    () => deriveTripSync({ chip, failedPhotos }),
    [chip, failedPhotos],
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
