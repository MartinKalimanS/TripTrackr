/**
 * `SpendingHero` - "Spent so far" and the big amount (feature 005, T550; FR-047; UI-SPEC 9.2;
 * prototype `.xhero`, `.xnum`, `.xmeta`; pictures `more/expenses*.png`): the label (muted), the
 * total as a 56 / 60 numeral in the display face with its currency sign raised beside it, and
 * under it the pill "EUR 281 / day - Day 3 of 8" (a calendar, cream, a hairline).
 *
 *   <SpendingHero view={view} />
 *
 * Every figure is the exact `decimal.js` result of `deriveSpendingView` formatted by `Intl`; a
 * whole amount drops its zero fraction (the picture's "842") and nothing is ever rounded in the
 * total. The pill exists only when an average can be computed from real expenses and days gone
 * (`view.average`): never an invented figure. It reads "Day 3 of 8" while the trip is on, and
 * "8 days" once it is over or when the trip has no dates. A trip that is over says "Spent in
 * total" where the picture says "Spent so far".
 *
 * The numeral is capped at 1.3 times the text size and shrinks before it clips (`numberOfLines`,
 * `adjustsFontSizeToFit`); the pill wraps at large text (its corner is 16 dp, not a capsule,
 * as the prototype does for the long frame). The block is ONE element to a screen reader, named
 * "Spent so far, 842 EUR" (the raised sign is decoration); `summary-total` is the figure,
 * `summary-average` the pill.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { SpendingView } from '@/features/expenses/spending-summary';
import { formatMoney, formatMoneyParts, formatMoneyTight } from '@/lib/locale';
import { Radii, Space } from '@/theme';

const NUMERAL = 56;
const NUMERAL_LINE = 60;
/** -.03em of the size, in dp: React Native has no `em`. */
const TRACKING = -0.03 * NUMERAL;

export type SpendingHeroProps = {
  view: SpendingView;
  /** At the end of the label's row: the summary toggle. */
  trailing?: ReactNode;
  /** Only the label row is drawn: the figure and the pill are folded away. */
  collapsed?: boolean;
};

export function heroLabel(view: Pick<SpendingView, 'ended'>): string {
  return view.ended ? 'Spent in total' : 'Spent so far';
}

/** "EUR 281 / day - Day 3 of 8", or "... - 8 days". */
export function averageWords(
  view: Pick<SpendingView, 'average' | 'homeCurrency'>,
): string | null {
  const { average, homeCurrency } = view;
  if (!average) return null;
  const per = `${formatMoneyTight(average.amount, homeCurrency)} / day`;
  const span = average.dayOf
    ? `Day ${average.dayOf.day} of ${average.dayOf.of}`
    : `${average.days} ${average.days === 1 ? 'day' : 'days'}`;
  return `${per} · ${span}`;
}

function averageName(view: Pick<SpendingView, 'average' | 'homeCurrency'>): string {
  const { average, homeCurrency } = view;
  if (!average) return '';
  const per = `${formatMoney(average.amount, homeCurrency)} per day`;
  return average.dayOf
    ? `${per}, day ${average.dayOf.day} of ${average.dayOf.of}`
    : `${per} over ${average.days} ${average.days === 1 ? 'day' : 'days'}`;
}

function Figure({ view }: { view: SpendingView }) {
  const parts = formatMoneyParts(view.total, view.homeCurrency);
  const numeral = (text: string) =>
    text ? (
      <Text
        variant="numeral"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={{ fontSize: NUMERAL, lineHeight: NUMERAL_LINE, letterSpacing: TRACKING }}>
        {text}
      </Text>
    ) : null;
  const sign = (
    <Text variant="title" tone="muted" style={{ marginTop: Space[2] }}>
      {parts.symbol}
    </Text>
  );
  return (
    <View
      testID="summary-total"
      accessible
      accessibilityLabel={`${heroLabel(view)}, ${formatMoney(view.total, view.homeCurrency)}`}
      className="flex-row items-start"
      style={{ gap: 2, marginTop: Space[1] }}>
      {numeral(parts.before)}
      {parts.symbol ? sign : null}
      {numeral(parts.after)}
    </View>
  );
}

function AveragePill({ view }: { view: SpendingView }) {
  const words = averageWords(view);
  if (!words) return null;
  return (
    <View
      testID="summary-average"
      accessible
      accessibilityLabel={averageName(view)}
      className="flex-row items-center self-start border border-separator bg-surface-secondary"
      style={{
        marginTop: Space[2],
        gap: 6,
        paddingVertical: Space[1],
        paddingLeft: Space[2],
        paddingRight: Space[3],
        borderRadius: Radii.lg,
        borderCurve: 'continuous',
      }}>
      <Icon name="calendar" size={16} tone="muted" />
      <Text
        variant="caption"
        capped
        tone="muted"
        className="shrink"
        style={{ fontVariant: ['tabular-nums'] }}>
        {words}
      </Text>
    </View>
  );
}

export function SpendingHero({ view, trailing, collapsed = false }: SpendingHeroProps) {
  return (
    <View testID="spending-hero">
      <View className="flex-row items-center justify-between" style={{ gap: Space[2] }}>
        <Text variant="label" tone="muted" className="shrink">
          {heroLabel(view)}
        </Text>
        {trailing}
      </View>
      {collapsed ? null : <Figure view={view} />}
      {collapsed ? null : <AveragePill view={view} />}
    </View>
  );
}
