/**
 * Spending summary — tasks.md T087 (FR-025, FR-026, SC-016), 004 T441 (FR-004, FR-014,
 * FR-025, FR-029); research D-26, D-27.
 *
 * Renders the wire's `ExpenseSummary`, whichever side computed it: totals by
 * category and by day in the home currency, the rates that were applied
 * whenever more than one currency is in play, and the rows still awaiting a
 * rate — by their own currency, never silently omitted. Every figure arrives
 * as a decimal string and is formatted by `Intl` in the device locale; no
 * arithmetic happens here.
 *
 * One raised `Card`. The total in the home currency is its most prominent figure (FR-014):
 * a `largeTitle` numeral in the display face, the only text of that size on the screen,
 * under a muted caption naming the currency. Below it the sections, each a heading:
 * the per-category summary, the days, the rates, and what still awaits a rate. Every amount,
 * and the date of a day, is a `numeric` text (tabular figures, FR-004) in the right-hand
 * cell of its row, so the digits line up down the card. The date of the exchange rates is
 * said in words ("as of 1 May 2026"). The card holds plain rows, not a `ListGroup`: a card
 * never contains another raised surface (FR-006).
 */
import type { ExpenseSummary } from '@triptrackr/contracts';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { describeRate, formatMoney } from '@/lib/locale';

export type SpendingSummaryProps = {
  summary: ExpenseSummary;
  /** When the rates came from a cached snapshot — said in words beside the source. */
  ratesAsOf?: string | null;
};

type RowProps = {
  label: string;
  value: string;
  /** How many expenses it sums, in words, muted under the label. */
  detail: string;
  /** The label is a date: tabular figures like an amount. */
  numericLabel?: boolean;
  testID?: string;
};

/** A label (and a muted detail under it) on the left, its amount on the right. */
function Row({ label, value, detail, numericLabel = false, testID }: RowProps) {
  return (
    <View testID={testID} className="flex-row items-center justify-between gap-3">
      <View className="flex-1">
        {numericLabel ? <Text type="numeric">{label}</Text> : <Text>{label}</Text>}
        <Text type="callout" tone="muted">
          {detail}
        </Text>
      </View>
      <Text type="numeric" className="text-right">
        {value}
      </Text>
    </View>
  );
}

type SectionProps = Pick<ViewProps, 'testID'> & {
  title: string;
  /** Announced on appearance, for what the traveller should not miss. */
  alert?: boolean;
  children: ReactNode;
};

/**
 * A titled group of rows; the title is a heading unless the whole section is an alert. The
 * section's `testID` is handed on with the rest of its host props, so each caller writes
 * its id out in full (the id extractor reads `testID="summary-rates"` where it is written).
 */
function Section({ title, alert = false, children, ...host }: SectionProps) {
  return (
    <View {...host} accessibilityRole={alert ? 'alert' : undefined} className="gap-2">
      <Text type="headline" accessibilityRole={alert ? undefined : 'header'}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/** "Rates by <source>, as of <date>." in words; whichever half exists, or nothing. */
function describeRatesSource(source: string | null, asOf: string | null): string | null {
  const date = asOf ? `as of ${formatIsoDate(asOf)}` : null;
  if (source && date) return `Rates by ${source}, ${date}.`;
  if (source) return `Rates by ${source}.`;
  if (date) return `Rates ${date}.`;
  return null;
}

function RatesSection({ summary, ratesAsOf }: Required<SpendingSummaryProps>) {
  const home = summary.home_currency;
  const provenance = describeRatesSource(summary.rates_source, ratesAsOf);
  return (
    <Section title="Rates applied" testID="summary-rates">
      {summary.rates_applied.map((row) => (
        <Row
          key={`${row.currency}-${row.rate}`}
          label={describeRate(row.currency, row.rate, home)}
          detail={plural(row.count, 'expense')}
          value={row.currency}
        />
      ))}
      <Text type="callout" tone="muted">
        Each expense keeps the rate it was recorded at.
        {provenance ? ` ${provenance}` : ''}
      </Text>
    </Section>
  );
}

export function SpendingSummary({ summary, ratesAsOf = null }: SpendingSummaryProps) {
  const home = summary.home_currency;

  return (
    <Card testID="spending-summary">
      <View className="gap-4">
        <View className="gap-1">
          <Text type="caption" tone="muted">
            Total in {home}
          </Text>
          <Text type="numeric" context="largeTitle" testID="summary-total">
            {formatMoney(summary.total_home, home)}
          </Text>
        </View>

        {summary.by_category.length > 0 ? (
          <Section title="By category">
            {summary.by_category.map((row) => (
              <Row
                key={row.category_id}
                testID={`summary-category-${row.category_id}`}
                label={row.name}
                detail={plural(row.count, 'expense')}
                value={formatMoney(row.total_home, home)}
              />
            ))}
          </Section>
        ) : null}

        {summary.by_day.length > 0 ? (
          <Section title="By day">
            {summary.by_day.map((row) => (
              <Row
                key={row.date}
                testID={`summary-day-${row.date}`}
                label={formatIsoDate(row.date)}
                numericLabel
                detail={plural(row.count, 'expense')}
                value={formatMoney(row.total_home, home)}
              />
            ))}
          </Section>
        ) : null}

        {summary.rates_applied.length > 0 ? (
          <RatesSection summary={summary} ratesAsOf={ratesAsOf} />
        ) : null}

        {summary.pending_conversion.count > 0 ? (
          <Section title="Awaiting a rate" testID="summary-pending" alert>
            {summary.pending_conversion.by_currency.map((row) => (
              <Row
                key={row.currency}
                label={row.currency}
                detail={plural(row.count, 'expense')}
                value={formatMoney(row.total, row.currency)}
              />
            ))}
            <Text type="callout" tone="muted">
              Not yet in the {home} total — they convert as soon as a rate is available.
            </Text>
          </Section>
        ) : null}
      </View>
    </Card>
  );
}
