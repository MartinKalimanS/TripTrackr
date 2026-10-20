/**
 * `SyncStatusChip` and `SyncStatusBanner` - the global sync chip and the offline or failed
 * banner, wired for a screen to drop in (feature 005, contracts C5-16 and C5-28; FR-026,
 * FR-065, research D5-17):
 *
 *   <SyncStatusChip />                          Home, Trips and a trip: ONE per screen
 *   <SyncStatusBanner />                        id `sync-banner`, ONE per screen
 *
 * Both read the one derived state (`useSyncChipState`: the dirty rows of the local store, the
 * network, the runtime's status) and hand it to the adapters, which draw it. They add no
 * request and write nothing. Nothing is drawn when everything is synchronised, and the banner
 * speaks only for offline and for a failed sync: a waiting or a running sync is the chip's
 * alone. The one thing they do is Retry, which asks the sync engine for a manual cycle (the
 * existing runtime, `syncNow('manual')`: push, then pull; it never rejects).
 *
 * The adapters stay ignorant of data (`SyncChip` and `Banner` read the props they are given),
 * which is why the wiring lives here and not in `components/ui/`.
 */
import { Banner } from '@/components/ui/banner';
import { SyncChip } from '@/components/ui/sync-chip';
import { syncBannerOf } from '@/features/sync/sync-banner';
import { useSyncChipState } from '@/features/sync/use-sync-chip-state';
import { syncNow } from '@/sync/engine';

function retry(): void {
  void syncNow('manual');
}

export function SyncStatusChip() {
  const state = useSyncChipState();
  return <SyncChip state={state} onRetry={retry} />;
}

export function SyncStatusBanner() {
  const banner = syncBannerOf(useSyncChipState());
  if (banner === null) return null;
  return (
    <Banner
      tone={banner.tone}
      message={banner.message}
      action={banner.action ? { label: banner.action.label, onPress: retry } : undefined}
      testID="sync-banner"
    />
  );
}
