/**
 * The sync chip and the banner of the Trips screen - feature 005, T541 and T529 (FR-026, FR-065;
 * data-model section 8). The chip is the ONE global one every screen shows (`useSyncChipState`:
 * the dirty rows of the seven synchronised tables, the network and the runtime), so a record
 * that is not uploaded is never shown as saved; the banner is `syncBannerOf` of it, with the
 * Retry that runs a manual cycle (`syncNow('manual')`: push, then pull; it never rejects).
 *
 * It READS and writes nothing (Constitution I and II; D5-17: private, local, never transmitted).
 * Waiting and syncing have no banner: the chip alone speaks, so one question gets one answer.
 * Offline is an ordinary state and has no action; a failed sync says in words that the trips
 * are safe on the phone and offers Retry.
 */
import { useMemo } from 'react';

import type { BannerTone } from '@/components/ui/banner';
import { syncBannerOf } from '@/features/sync/sync-banner';
import {
  useSyncChipState,
  type SyncChipState,
} from '@/features/sync/use-sync-chip-state';
import { syncNow } from '@/sync/engine';

export interface TripsBanner {
  tone: BannerTone;
  message: string;
  /** Only a failure has one: "Retry". */
  action?: { label: string; onPress: () => void };
}

export interface TripsSync {
  chip: SyncChipState;
  /** One slim notice under the filter, or `null`. */
  banner: TripsBanner | null;
  /** Runs a manual cycle: what the chip's and the banner's Retry do. */
  retry: () => void;
}

function retry(): void {
  void syncNow('manual');
}

function bannerOf(chip: SyncChipState): TripsBanner | null {
  const data = syncBannerOf(chip);
  if (data === null) return null;
  const { tone, message, action } = data;
  return {
    tone,
    message,
    ...(action ? { action: { ...action, onPress: retry } } : null),
  };
}

export function useTripsSync(): TripsSync {
  const chip = useSyncChipState();
  return useMemo(() => ({ chip, banner: bannerOf(chip), retry }), [chip]);
}
