/**
 * Plan and credits - spec 014 (S-12; FR-013, FR-084).
 *
 * A form sheet that says what the traveller holds: the plan and when it renews or ends, the new
 * trips left this year and the trip credits. The server is the authority (`GET /me/entitlement`);
 * this only reads and words it. "Manage in store" opens the store's own subscription settings,
 * where a plan is cancelled or changed (the app cannot do that for the store); "See plans" opens
 * the paywall. Nothing here hides, locks or deletes a trip, and the sheet says so.
 *
 * Ids: `manage-subscription-screen`, `manage-plan`, `manage-period`, `manage-uses`,
 * `manage-credits`, `manage-empty`, `manage-see-plans`, `manage-subscription-save` (the store
 * button), `manage-subscription-cancel` (Close).
 *
 * Visibility posture: private to the signed-in traveller; reads their own entitlement only.
 */
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/ui/form-sheet';
import { Text } from '@/components/ui/text';
import { MANAGE_COPY } from '@/features/billing/manage-copy';
import { summarisePlan } from '@/features/billing/plan-summary';
import { useEntitlement } from '@/features/billing/use-entitlement';
import { cornerOf } from '@/theme';

const STORE_SUBSCRIPTIONS = Platform.select({
  ios: 'https://apps.apple.com/account/subscriptions',
  default: 'https://play.google.com/store/account/subscriptions',
});

export default function ManageSubscriptionScreen() {
  const router = useRouter();
  const { entitlement } = useEntitlement();
  const summary = entitlement ? summarisePlan(entitlement) : null;
  const unlimited = entitlement?.tier === 'unlimited' && entitlement.is_active;

  return (
    <FormSheet
      testID="manage-subscription-screen"
      title={MANAGE_COPY.title}
      actions={{
        testIDPrefix: 'manage-subscription',
        saveLabel: MANAGE_COPY.store,
        saveVariant: 'primary',
        cancelLabel: MANAGE_COPY.close,
        onCancel: () => router.back(),
        onSave: () => void WebBrowser.openBrowserAsync(STORE_SUBSCRIPTIONS),
      }}>
      {summary ? (
        <View className="gap-1 bg-surface-secondary p-4" style={cornerOf('lg')}>
          <Text testID="manage-plan" variant="body" strong>
            {summary.plan}
          </Text>
          {summary.period ? (
            <Text testID="manage-period" variant="label" tone="muted">
              {summary.period}
            </Text>
          ) : null}
          {summary.usesLeft ? (
            <Text testID="manage-uses" variant="label" tone="muted">
              {summary.usesLeft}
            </Text>
          ) : null}
          {summary.credits ? (
            <Text testID="manage-credits" variant="label" tone="muted">
              {summary.credits}
            </Text>
          ) : null}
          {summary.empty ? (
            <Text testID="manage-empty" variant="label" tone="muted">
              {MANAGE_COPY.empty}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text variant="label" tone="muted">
          {MANAGE_COPY.loading}
        </Text>
      )}

      {unlimited ? null : (
        <Button
          testID="manage-see-plans"
          variant="secondary"
          accessibilityLabel={MANAGE_COPY.seePlans}
          onPress={() => router.replace('/modal/paywall')}>
          {MANAGE_COPY.seePlans}
        </Button>
      )}

      <Text variant="label" tone="muted">
        {MANAGE_COPY.cancelHow}
      </Text>
      <Text variant="label" tone="muted">
        {MANAGE_COPY.keepsTrips}
      </Text>
    </FormSheet>
  );
}
