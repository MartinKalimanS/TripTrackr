/**
 * Paywall - spec 014 (S-12; FR-005 to FR-008, FR-013, FR-084).
 *
 * A form sheet shown only once the traveller holds as many ordinary trips as the free number
 * allows (never before, never while charging is off). A warm header says why it appears, then
 * the three ways forward the server names as selectable rows - this trip only, a yearly plan of
 * 10, unlimited - and one Continue button buys the selected row (the yearly plan of 10 is
 * preselected when offered). Deleting a trip is the fourth way, drawn as plain text. Each row
 * states its price and period as the STORE returns them and the terms say that a plan renews;
 * Restore Purchases is always on screen. Nothing here hides, locks or deletes a trip.
 *
 * Opened with `?tripId=` for a trip that arrived over the allowance, the sheet covers that trip
 * with what was just bought; opened without, a purchase is simply added to the account.
 *
 * Ids: `paywall-screen`, `paywall-option-<credit|tier1|unlimited>`, `paywall-save` (Continue),
 * `paywall-restore`, `paywall-status`, `paywall-cancel`.
 *
 * Visibility posture: private to the signed-in traveller; reads their own entitlement only.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { LegalLine } from '@/components/auth/legal-line';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/ui/form-sheet';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import type { PaywallOption } from '@/features/billing/paywall-model';
import { PAYWALL_COPY } from '@/features/billing/paywall-copy';
import { usePaywall, type PaywallStatus } from '@/features/billing/use-paywall';
import { cornerOf } from '@/theme';

const STATUS_COPY: Partial<Record<PaywallStatus, string>> = {
  pending: PAYWALL_COPY.pending,
  failed: PAYWALL_COPY.failed,
};

const TIER_ICON: Record<PaywallOption['tier'], IconName> = {
  credit: 'ticket',
  tier1: 'calendar',
  unlimited: 'suitcase-rolling',
};

/** The row the sheet opens on: the yearly plan of 10 when it is offered, else the first. */
function defaultOption(options: readonly PaywallOption[]): PaywallOption | undefined {
  return options.find((option) => option.tier === 'tier1') ?? options[0];
}

/** "$14.99 per year", the price as the store wrote it. */
function priceLabel(option: PaywallOption): string {
  return option.periodLabel
    ? `${option.priceString} ${option.periodLabel}`
    : option.priceString;
}

function Header({ held, allowance }: { held: number; allowance: number }) {
  return (
    <View
      testID="paywall-header"
      className="items-center gap-2 bg-accent-tint px-4 py-5"
      style={cornerOf('lg')}>
      <Icon name="map-pin" size={24} tone="accentText" />
      <Text variant="body" strong>
        {PAYWALL_COPY.title}
      </Text>
      <Text variant="label" tone="muted">
        {PAYWALL_COPY.lead(held, allowance)}
      </Text>
    </View>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: PaywallOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const copy = PAYWALL_COPY.option[option.tier];
  const price = priceLabel(option);
  return (
    <Tappable
      testID={`paywall-option-${option.tier}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${copy.name}, ${price}`}
      onPress={onSelect}
      className={`flex-row items-center gap-3 px-4 py-3 ${
        selected
          ? 'border-2 border-accent-line bg-surface-secondary'
          : 'border border-border bg-surface'
      }`}
      style={[cornerOf('md'), { minHeight: 64 }]}>
      <Icon
        name={TIER_ICON[option.tier]}
        size={20}
        tone={selected ? 'accentText' : 'ink'}
      />
      <View className="flex-1">
        <Text variant="body" strong>
          {copy.name}
        </Text>
        <Text variant="label" tone="muted">
          {copy.detail}
        </Text>
      </View>
      <Text variant="body" strong>
        {price}
      </Text>
    </Tappable>
  );
}

export default function PaywallScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const paywall = usePaywall(tripId ?? null);
  const { entitlement, options } = paywall;
  const [chosen, setChosen] = useState<string | null>(null);
  const selected =
    options.find((option) => option.productId === chosen) ?? defaultOption(options);
  const busy = paywall.status === 'buying';
  const message = paywall.productsFailed
    ? PAYWALL_COPY.unavailable
    : (STATUS_COPY[paywall.status] ?? null);
  const hasYearly = options.some((option) => option.tier !== 'credit');

  return (
    <FormSheet
      testID="paywall-screen"
      title={PAYWALL_COPY.title}
      actions={{
        testIDPrefix: 'paywall',
        saveLabel: PAYWALL_COPY.continue,
        saveVariant: 'primary',
        saveBusy: busy,
        saveDisabled: !selected,
        cancelLabel: PAYWALL_COPY.notNow,
        onCancel: () => router.back(),
        onSave: () => selected && void paywall.buy(selected.productId),
      }}>
      {entitlement ? (
        <Header held={entitlement.trips_held} allowance={entitlement.allowance} />
      ) : null}

      <View className="gap-3" accessibilityRole="radiogroup">
        {options.map((option) => (
          <OptionRow
            key={option.productId}
            option={option}
            selected={option.productId === selected?.productId}
            onSelect={() => setChosen(option.productId)}
          />
        ))}
      </View>

      {hasYearly ? (
        <View
          testID="paywall-cheaper"
          className="flex-row items-center gap-2 bg-aqua-tint px-3 py-2"
          style={cornerOf('md')}>
          <Icon name="sparkle" size={16} tone="aquaInk" />
          <Text variant="label" tone="muted" className="flex-1">
            {PAYWALL_COPY.cheaper}
          </Text>
        </View>
      ) : null}

      {paywall.status === 'confirmed' ? (
        <Text testID="paywall-status" variant="label">
          {PAYWALL_COPY.restored}
        </Text>
      ) : message ? (
        <Text testID="paywall-status" variant="label" tone="muted">
          {message}
        </Text>
      ) : null}

      <Button
        testID="paywall-restore"
        variant="text"
        size="sm"
        busy={busy}
        accessibilityLabel={PAYWALL_COPY.restore}
        onPress={() => void paywall.restore()}>
        {PAYWALL_COPY.restore}
      </Button>

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
