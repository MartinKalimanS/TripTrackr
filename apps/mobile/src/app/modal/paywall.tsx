/**
 * Paywall - spec 014 (S-12; FR-005 to FR-008, FR-013, FR-084).
 *
 * A form sheet shown only once the traveller holds as many ordinary trips as the free number
 * allows (never before, never while charging is off). It offers the three ways forward the server
 * names: this trip only, a yearly plan of 10, or unlimited; deleting a trip is the fourth, drawn as
 * plain text. Each option states its price and period as the STORE returns them and says that a
 * plan renews; Restore Purchases is always on screen. Nothing here hides, locks or deletes a trip.
 *
 * Opened with `?tripId=` for a trip that arrived over the allowance, the sheet covers that trip
 * with what was just bought; opened without, a purchase is simply added to the account.
 *
 * Ids: `paywall-screen`, `paywall-option-<credit|tier1|unlimited>`, `paywall-restore`,
 * `paywall-status`, `paywall-cancel`.
 *
 * Visibility posture: private to the signed-in traveller; reads their own entitlement only.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { LegalLine } from '@/components/auth/legal-line';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/ui/form-sheet';
import { Text } from '@/components/ui/text';
import type { PaywallOption } from '@/features/billing/paywall-model';
import { PAYWALL_COPY } from '@/features/billing/paywall-copy';
import { usePaywall, type PaywallStatus } from '@/features/billing/use-paywall';

const STATUS_COPY: Partial<Record<PaywallStatus, string>> = {
  pending: PAYWALL_COPY.pending,
  failed: PAYWALL_COPY.failed,
};

/** "This trip only  $3.99" or "Yearly: 10 trips  $14.99 per year", the price as the store wrote it. */
function optionLabel(option: PaywallOption): string {
  const period = option.periodLabel ? ` ${option.periodLabel}` : '';
  return `${PAYWALL_COPY.option[option.tier].name}  ${option.priceString}${period}`;
}

export default function PaywallScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const paywall = usePaywall(tripId ?? null);
  const { entitlement } = paywall;
  const busy = paywall.status === 'buying';
  const message = paywall.productsFailed
    ? PAYWALL_COPY.unavailable
    : (STATUS_COPY[paywall.status] ?? null);

  return (
    <FormSheet
      testID="paywall-screen"
      title={PAYWALL_COPY.title}
      actions={{
        testIDPrefix: 'paywall',
        saveLabel: PAYWALL_COPY.restore,
        saveVariant: 'primary',
        saveBusy: busy,
        cancelLabel: PAYWALL_COPY.notNow,
        onCancel: () => router.back(),
        onSave: () => void paywall.restore(),
      }}>
      {entitlement ? (
        <Text>{PAYWALL_COPY.lead(entitlement.trips_held, entitlement.allowance)}</Text>
      ) : null}

      <View className="gap-3">
        {paywall.options.map((option) => {
          const label = optionLabel(option);
          return (
            <Button
              key={option.productId}
              testID={`paywall-option-${option.tier}`}
              variant="secondary"
              busy={busy}
              accessibilityLabel={label}
              onPress={() => void paywall.buy(option.productId)}>
              {label}
            </Button>
          );
        })}
      </View>

      {paywall.status === 'confirmed' ? (
        <Text testID="paywall-status" variant="label">
          {PAYWALL_COPY.restored}
        </Text>
      ) : message ? (
        <Text testID="paywall-status" variant="label" tone="muted">
          {message}
        </Text>
      ) : null}

      <Text variant="label" tone="muted">
        {PAYWALL_COPY.renewal}
      </Text>
      <Text variant="label" tone="muted">
        {PAYWALL_COPY.keepsTrips}
      </Text>
      <Text variant="label" tone="muted">
        {PAYWALL_COPY.deleteRoute}
      </Text>
      <LegalLine lead="Purchases are covered by the" size="callout" />
    </FormSheet>
  );
}
