/**
 * `syncBannerOf(state)` - the data of the sync banner (feature 005, contract C5-28 `Banner`;
 * FR-065): what a screen hands the `Banner` adapter for a `SyncChipState`, or `null` when there
 * is nothing to say.
 *
 * Offline is an ordinary state for this product (Constitution II), so its banner is calm and
 * has no action: "Offline. 3 changes will sync when you're back online." A failed sync says in
 * words that the data is safe on the phone and offers Retry: "Couldn't sync 2 changes. Your
 * trips are safe on this phone." Waiting and syncing have no banner: the chip alone speaks, so
 * one question gets one answer per screen. The words are `SYNC_BANNER_COPY`.
 *
 * Pure; the action carries its label only, a screen (or `SyncStatusBanner`) supplies what
 * pressing it does.
 */
import type { BannerTone } from '@/components/ui/banner';

import { SYNC_BANNER_COPY } from './sync-copy';
import type { SyncChipState } from './use-sync-chip-state';

export interface SyncBannerData {
  tone: BannerTone;
  message: string;
  action?: { label: string };
}

export function syncBannerOf(state: SyncChipState): SyncBannerData | null {
  switch (state.kind) {
    case 'offline':
      return { tone: 'offline', message: SYNC_BANNER_COPY.offline(state.count) };
    case 'failed':
      return {
        tone: 'error',
        message: SYNC_BANNER_COPY.failed(state.count),
        action: { label: SYNC_BANNER_COPY.retry },
      };
    default:
      return null;
  }
}
