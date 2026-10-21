/**
 * `DayBars` - the "Per day" chart of the spending screen (feature 005, T550; FR-047; research
 * D5-15; UI-SPEC 9.2; prototype `.bars`, `.bh`, `.chart`, `.bcol`; pictures `more/expenses*.png`):
 * a title, the pictured "Budget" control, and one column per day of the trip. A past day is a cream
 * bar with a 1.5 dp outline, today is solid navy with a bold label, and a day still to come is a row
 * of dots with a dash under it; the day of the month and the amount, in whole units, sit under
 * each bar.
 *
 *   <DayBars days={view.days} todayIndex={view.todayIndex} homeCurrency="EUR" />
 *
 * Heights are shares of the tallest day (`DayBar.height`, 0 to 1) over a 96 dp plot, with a 4 dp
 * stub for a day with nothing or a refund so every day has a bar. Nothing here does arithmetic on
 * an amount. The labels are capped at 1.3 times the text size (chart chrome, FR-074) and the
 * columns widen with them; when the days do not fit, the chart scrolls sideways and opens on today.
 *
 * "Budget" is drawn as pictured but is a coming-soon control without an amount (owner answer
 * Q-11): no figure, no dashed line across the chart, because nothing is behind it. The whole
 * chart is ONE image to a screen reader, named by a sentence with every day; each column keeps its
 * id (`summary-day-<date>`) and its text for tests and for sighted users.
 */
import { useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { useComingSoon, COMING_SOON_HINT } from '@/components/ui/coming-soon-button';
import { Tappable } from '@/components/ui/tappable';
import { useColors } from '@/components/ui/theme-tokens';
import { Text } from '@/components/ui/text';
import type { DayBar } from '@/features/expenses/spending-summary';
import { formatStopDay } from '@/features/trips/stop-dates';
import { formatMoney, formatWholeUnits } from '@/lib/locale';
import { Radii, Space } from '@/theme';

export const PLOT_HEIGHT = 96;
const MIN_COLUMN = 32;
const STUB = 4;
const GAP = Space[2];
const LABEL_CAP = 1.3;
/** A tabular digit of the 13 dp label, in dp, with a little room. */
const DIGIT = 8;
const CHART_KEYS = ['ink', 'sand', 'border', 'subtle', 'muted'] as const;
const FUTURE_DOTS = [0, 1, 2, 3, 4];

export type DayBarsProps = {
  days: readonly DayBar[];
  todayIndex: number;
  homeCurrency: string;
  fontScale?: number;
};

/** The column width: 32 dp, or what the longest amount needs at the (capped) text size. */
export function columnWidth(days: readonly DayBar[], fontScale: number): number {
  const chars = days.reduce(
    (most, day) => Math.max(most, day.dayLabel.length, (day.whole ?? '–').length),
    1,
  );
  return Math.max(MIN_COLUMN, Math.ceil(chars * DIGIT * Math.min(fontScale, LABEL_CAP)));
}

/** "Thu 15 Oct, today: 280 CHF" / "Fri 16 Oct: nothing yet". */
function describeDay(day: DayBar, homeCurrency: string): string {
  const name = `${formatStopDay(day.date)}${day.kind === 'today' ? ', today' : ''}`;
  return `${name}: ${day.total === null ? 'nothing yet' : formatMoney(day.total, homeCurrency)}`;
}

export function describeChart(days: readonly DayBar[], homeCurrency: string): string {
  return `Spending per day. ${days.map((day) => describeDay(day, homeCurrency)).join('. ')}.`;
}

function BudgetControl() {
  const onPress = useComingSoon('Budget');
  const colors = useColors(CHART_KEYS);
  return (
    <Tappable
      testID="coming-soon-budget"
      accessibilityLabel="Budget"
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      className="flex-row items-center"
      style={{ gap: Space[1], paddingStart: Space[2] }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="flex-row"
        style={{ gap: 2, width: 16 }}>
        {[0, 1, 2].map((dash) => (
          <View
            key={dash}
            style={{ width: 4, height: 2, backgroundColor: colors.muted }}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted" capped>
        Budget
      </Text>
    </Tappable>
  );
}

type ColumnProps = { day: DayBar; width: number; today: boolean };

function Bar({ day }: { day: DayBar }) {
  const colors = useColors(CHART_KEYS);
  if (day.kind === 'future') {
    return (
      <View
        className="flex-row justify-between"
        style={{ height: STUB, width: '100%', alignItems: 'flex-start' }}>
        {FUTURE_DOTS.map((dot) => (
          <View
            key={dot}
            style={{
              width: 2,
              height: 2,
              borderRadius: 1,
              backgroundColor: colors.subtle,
            }}
          />
        ))}
      </View>
    );
  }
  const height = Math.max(STUB, Math.round(day.height * PLOT_HEIGHT));
  const solid = day.kind === 'today';
  return (
    <View
      testID={`day-bar-${day.date}`}
      style={{
        width: '100%',
        height,
        borderTopLeftRadius: Radii.sm,
        borderTopRightRadius: Radii.sm,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 4,
        backgroundColor: solid ? colors.ink : colors.sand,
        borderWidth: solid ? 0 : 1.5,
        borderColor: colors.border,
      }}
    />
  );
}

function Column({ day, width, today }: ColumnProps) {
  return (
    <View
      testID={`summary-day-${day.date}`}
      className="items-center justify-end"
      style={{ width }}>
      <Bar day={day} />
      <Text
        variant="caption"
        capped
        tone={today ? 'default' : 'muted'}
        numberOfLines={1}
        style={{ marginTop: Space[1], fontVariant: ['tabular-nums'] }}>
        {day.dayLabel}
      </Text>
      <Text
        variant="label"
        strong={today}
        capped
        tone={today ? 'default' : 'muted'}
        numberOfLines={1}
        style={{ fontVariant: ['tabular-nums'] }}>
        {day.whole === null ? '–' : formatWholeUnits(day.whole)}
      </Text>
    </View>
  );
}

export function DayBars({ days, todayIndex, homeCurrency, fontScale = 1 }: DayBarsProps) {
  const scroller = useRef<ScrollView>(null);
  const width = columnWidth(days, fontScale);
  if (days.length === 0) return null;

  const openOnToday = (viewport: number) => {
    const step = width + GAP;
    if (todayIndex < 0 || days.length * step - GAP <= viewport) return;
    scroller.current?.scrollTo?.({
      x: Math.max(0, todayIndex * step - viewport / 2 + width / 2),
      animated: false,
    });
  };

  return (
    <View testID="day-bars" style={{ paddingTop: Space[3], paddingBottom: Space[5] }}>
      <View
        className="flex-row items-baseline justify-between"
        style={{ marginBottom: Space[2] }}>
        <Text variant="callout" accessibilityRole="header">
          Per day
        </Text>
        <BudgetControl />
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={describeChart(days, homeCurrency)}
        style={{ height: PLOT_HEIGHT + 38 + Space[2], paddingTop: Space[2] }}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          onLayout={(event) => openOnToday(event.nativeEvent.layout.width)}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'space-between',
            columnGap: GAP,
          }}>
          {days.map((day, index) => (
            <Column key={day.date} day={day} width={width} today={index === todayIndex} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
