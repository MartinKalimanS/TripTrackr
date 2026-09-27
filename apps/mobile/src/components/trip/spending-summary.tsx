/**
 * Spending summary — tasks.md T087 (FR-025, FR-026, SC-016); research D-26, D-27.
 *
 * Renders the wire's `ExpenseSummary`, whichever side computed it: totals by
 * category and by day in the home currency, the rates that were applied
 * whenever more than one currency is in play, and the rows still awaiting a
 * rate — by their own currency, never silently omitted. Every figure arrives
 * as a decimal string and is formatted by `Intl` in the device locale; no
 * arithmetic happens here.
 */
import type { ExpenseSummary } from '@triptrackr/contracts';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { describeRate, formatMoney } from '@/lib/locale';

export type SpendingSummaryProps = {
  summary: ExpenseSummary;
  /** When the rates came from a cached snapshot — shown beside the source. */
  ratesAsOf?: string | null;
};

type RowProps = { label: string; value: string; detail?: string; testID?: string };

function Row({ label, value, detail, testID }: RowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.rowText}>
        <ThemedText>{label}</ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted">
            {detail}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

export function SpendingSummary({ summary, ratesAsOf }: SpendingSummaryProps) {
  const home = summary.home_currency;
  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

  return (
    <Surface
      treatment="recessed"
      radius="lg"
      style={styles.card}
      testID="spending-summary">
      <View style={styles.total}>
        <ThemedText type="small" themeColor="textMuted">
          Total in {home}
        </ThemedText>
        <ThemedText type="title" testID="summary-total">
          {formatMoney(summary.total_home, home)}
        </ThemedText>
      </View>

      {summary.by_category.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="smallBold">By category</ThemedText>
          {summary.by_category.map((row) => (
            <Row
              key={row.category_id}
              testID={`summary-category-${row.category_id}`}
              label={row.name}
              detail={plural(row.count, 'expense')}
              value={formatMoney(row.total_home, home)}
            />
          ))}
        </View>
      ) : null}

      {summary.by_day.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="smallBold">By day</ThemedText>
          {summary.by_day.map((row) => (
            <Row
              key={row.date}
              testID={`summary-day-${row.date}`}
              label={formatIsoDate(row.date)}
              detail={plural(row.count, 'expense')}
              value={formatMoney(row.total_home, home)}
            />
          ))}
        </View>
      ) : null}

      {summary.rates_applied.length > 0 ? (
        <View style={styles.section} testID="summary-rates">
          <ThemedText type="smallBold">Rates applied</ThemedText>
          {summary.rates_applied.map((row) => (
            <Row
              key={`${row.currency}-${row.rate}`}
              label={describeRate(row.currency, row.rate, home)}
              detail={plural(row.count, 'expense')}
              value={row.currency}
            />
          ))}
          <ThemedText type="small" themeColor="textMuted">
            Each expense keeps the rate it was recorded at.
            {summary.rates_source ? ` Rates by ${summary.rates_source}` : ''}
            {ratesAsOf ? ` (as of ${formatIsoDate(ratesAsOf)})` : ''}.
          </ThemedText>
        </View>
      ) : null}

      {summary.pending_conversion.count > 0 ? (
        <View style={styles.section} testID="summary-pending" accessibilityRole="alert">
          <ThemedText type="smallBold">Awaiting a rate</ThemedText>
          {summary.pending_conversion.by_currency.map((row) => (
            <Row
              key={row.currency}
              label={row.currency}
              detail={plural(row.count, 'expense')}
              value={formatMoney(row.total, row.currency)}
            />
          ))}
          <ThemedText type="small" themeColor="textMuted">
            Not yet in the {home} total — they convert as soon as a rate is available.
          </ThemedText>
        </View>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.three },
  total: { gap: Spacing.half },
  section: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
