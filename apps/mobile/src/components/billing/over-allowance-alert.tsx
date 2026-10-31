/**
 * The notice for trips that arrived past the free allowance (spec 014; FR-022, FR-023). The
 * server kept them - sync never refuses a trip - and flagged them; this asks, once, how to
 * cover them. It reads the in-memory list the sync engine fills (`useOverAllowanceTripIds`),
 * so it is silent for a traveller with nothing flagged and while charging is off.
 *
 * "See options" opens the paywall for the first flagged trip, which covers it with what is
 * bought (or already held). "Later" only hides the notice for that trip: nothing is hidden,
 * locked or deleted either way, and the sheet's own copy says so.
 *
 * Ids: `over-allowance-alert` (and `-action`, `-dismiss`).
 *
 * Visibility posture: names no trip and no title; shows a count only, on the traveller's own device.
 */
import { useRouter } from 'expo-router';

import { ActionAlert } from '@/components/ui/action-alert';
import { PAYWALL_COPY } from '@/features/billing/paywall-copy';
import { useOverAllowanceTripIds, useSyncWarningsStore } from '@/sync/warnings';

export function OverAllowanceAlert() {
  const router = useRouter();
  const flagged = useOverAllowanceTripIds();
  const first = flagged[0];
  if (!first) return null;

  const copy = PAYWALL_COPY.flagged;
  return (
    <ActionAlert
      testID="over-allowance-alert"
      tone="info"
      title={copy.title}
      message={copy.message(flagged.length)}
      action={{
        label: copy.action,
        onPress: () =>
          router.push({ pathname: '/modal/paywall', params: { tripId: first } }),
      }}
      dismiss={{
        label: copy.later,
        onPress: () => useSyncWarningsStore.getState().acknowledgeOverAllowance(first),
      }}
    />
  );
}
