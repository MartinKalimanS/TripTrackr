/**
 * The spending summary - tasks.md T087, 004 T441, restyled by 005 T550 (FR-047, FR-054, FR-025,
 * FR-026, SC-016; research D-26, D5-15; UI-SPEC 9.2; pictures `more/expenses*.png`).
 *
 * The head of the spending list, top to bottom as pictured: `SpendingHero` ("Spent so far", the
 * big amount, the pill "281 / day - Day 3 of 8"), the rate line (an info icon and the rates in
 * force), what still awaits a rate, `DayBars` ("Per day") and `CategoryBar` with its legend.
 * Everything is derived from the local rows by `deriveSpendingView` (exact `decimal.js`; pending
 * conversions counted and left out of every total); this file does no arithmetic and draws the
 * rows' totals as `Intl` formats them.
 *
 * "Summary" at the end of the first row folds all of it away and back (`expenses-toggle-summary`,
 * named "Hide summary" / "Show summary", expanded or not); the picture has no such control, it
 * is the one the app already had. There is no card: the picture lays the summary on the canvas
 * between hairlines.
 *
 * The rate line is the disclosure FR-026 asks for, in the app's words: "1 EUR = 0.888889 CHF"
 * for each rate, "Each expense keeps the rate it was recorded at." and where the rates came
 * from and when ("Rates by <source>, as of 1 May 2026."). It is drawn only when a foreign
 * currency is in play: with nothing converted there is nothing to disclose and the picture's
 * "Converted at today's rate" would be untrue (each row keeps the rate it was recorded at).
 * "Awaiting a rate" is an alert with an icon, never colour alone, and names each currency's
 * unconverted total.
 */
import type { ExpenseSummary } from '@triptrackr/contracts';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import type { SpendingView } from '@/features/expenses/spending-summary';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { describeRate, formatMoney } from '@/lib/locale';
import { Radii, Space } from '@/theme';

import { CategoryBar } from './category-bar';
import { DayBars } from './day-bars';
import { SpendingHero } from './spending-hero';

export type SpendingSummaryProps = {
  summary: ExpenseSummary;
  view: SpendingView;
  /** When the rates came from a cached snapshot, said in words beside the source. */
  ratesAsOf?: string | null;
  /** The summary is open; false folds all but the first row away. */
  expanded?: boolean;
  onToggle?: () => void;
  fontScale?: number;
};

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

function SummaryToggle({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Tappable
      testID="expenses-toggle-summary"
      accessibilityLabel={expanded ? 'Hide summary' : 'Show summary'}
      accessibilityState={{ expanded }}
      className="flex-row items-center gap-1 px-3"
      onPress={onToggle}>
      <Text tone="accent">Summary</Text>
      <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} tone="accent" />
    </Tappable>
  );
}

function RatesLine({
  summary,
  ratesAsOf,
}: {
  summary: ExpenseSummary;
  ratesAsOf: string | null;
}) {
  if (summary.rates_applied.length === 0) return null;
  const provenance = describeRatesSource(summary.rates_source, ratesAsOf);
  return (
    <View
      testID="summary-rates"
      className="flex-row items-start"
      style={{ gap: Space[1], marginTop: Space[2] }}>
      <View style={{ marginTop: 2 }}>
        <Icon name="info" size={16} tone="subtle" />
      </View>
      <View className="min-w-0 flex-1">
        {summary.rates_applied.map((row) => (
          <Text
            key={`${row.currency}-${row.rate}`}
            variant="label"
            tone="muted"
            style={{ fontVariant: ['tabular-nums'] }}>
            {`${describeRate(row.currency, row.rate, summary.home_currency)} · ${plural(row.count, 'expense')}`}
          </Text>
        ))}
        <Text variant="label" tone="muted">
          Each expense keeps the rate it was recorded at.
          {provenance ? ` ${provenance}` : ''}
        </Text>
      </View>
    </View>
  );
}

function PendingLine({ view }: { view: SpendingView }) {
  if (view.pending.count === 0) return null;
  return (
    <View
      testID="summary-pending"
      accessibilityRole="alert"
      className="flex-row items-start bg-amber-tint"
      style={{
        gap: Space[2],
        marginTop: Space[3],
        padding: Space[3],
        borderRadius: Radii.lg,
        borderCurve: 'continuous',
      }}>
      <Icon name="alert" size={20} tone="amberInk" />
      <View className="min-w-0 flex-1">
        <Text variant="callout" accessibilityRole="header">
          Awaiting a rate
        </Text>
        {view.pending.byCurrency.map((row) => (
          <Text
            key={row.currency}
            variant="label"
            style={{ fontVariant: ['tabular-nums'] }}>
            {`${formatMoney(row.total, row.currency)} · ${plural(row.count, 'expense')}`}
          </Text>
        ))}
        <Text variant="label" tone="muted">
          {`Not yet in the ${view.homeCurrency} total — they convert as soon as a rate is available.`}
        </Text>
      </View>
    </View>
  );
}

export function SpendingSummary({
  summary,
  view,
  ratesAsOf = null,
  expanded = true,
  onToggle,
  fontScale,
}: SpendingSummaryProps) {
  const folded = !expanded || (view.days.length === 0 && view.slices.length === 0);
  return (
    <View
      testID={expanded ? 'spending-summary' : undefined}
      style={{ paddingBottom: folded ? Space[5] : 0 }}>
      <SpendingHero
        view={view}
        collapsed={!expanded}
        trailing={
          onToggle ? <SummaryToggle expanded={expanded} onToggle={onToggle} /> : undefined
        }
      />
      {expanded ? (
        <>
          <RatesLine summary={summary} ratesAsOf={ratesAsOf} />
          <PendingLine view={view} />
          {view.days.length > 0 ? (
            <View className="border-t border-separator" style={{ marginTop: Space[5] }}>
              <DayBars
                days={view.days}
                todayIndex={view.todayIndex}
                homeCurrency={view.homeCurrency}
                fontScale={fontScale}
              />
            </View>
          ) : null}
          <CategoryBar slices={view.slices} homeCurrency={view.homeCurrency} />
        </>
      ) : null}
    </View>
  );
}
