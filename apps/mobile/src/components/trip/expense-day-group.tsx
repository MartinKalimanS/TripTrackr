/**
 * `ExpenseDayGroup` - one day of the spending list (feature 005, T550; FR-014, FR-047; prototype
 * `.dgh`, `.xrow`; pictures `more/expenses*.png`): a hairline, the day's heading ("Wed 14 Oct",
 * and "- Today" in the muted ink for today) with the day's total at the end, then the day's rows
 * with a hairline between them that starts under the icon.
 *
 *   <ExpenseDayGroup day={day} today={false} total="280.00" homeCurrency="EUR" ... />
 *
 * The heading is ONE announced header, "Wednesday 14 October 2026, today, 280 EUR" (the date
 * is read from the text of the day and never through a time zone). The total is the exact sum of
 * the day's converted expenses (`deriveSpendingView`), in whole units where it is whole; a day
 * with only unconverted expenses has none. No card: the group sits on the canvas as pictured.
 * `expense-day-<date>` is the group.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import type { ExpenseDay } from '@/features/expenses/group-by-day';
import { formatIsoDate, formatStopDay } from '@/features/trips/stop-dates';
import { formatMoney, formatMoneyTight } from '@/lib/locale';
import { Space } from '@/theme';

import { ExpenseRow } from './expense-row';

/** Past the 40 dp icon and its 12 dp gap: where the pictured hairline between rows starts. */
const SEPARATOR_INSET = 52;

export type ExpenseDayGroupProps = {
  day: ExpenseDay;
  today: boolean;
  /** Exact home-currency total of the day's converted expenses; null when it has none. */
  total: string | null;
  homeCurrency: string;
  categoryName: (categoryId: string) => string;
  categoryIcon: (categoryId: string) => string | null;
  placeOf: (cityId: number | null) => string | null;
  onRemove: (expense: ExpenseRecord) => void;
};

export function ExpenseDayGroup({
  day,
  today,
  total,
  homeCurrency,
  categoryName,
  categoryIcon,
  placeOf,
  onRemove,
}: ExpenseDayGroupProps) {
  const name = `${formatIsoDate(day.date)}${today ? ', today' : ''}`;
  return (
    <View
      testID={`expense-day-${day.date}`}
      className="border-t border-separator"
      style={{ paddingTop: Space[3] }}>
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={total ? `${name}, ${formatMoney(total, homeCurrency)}` : name}
        className="flex-row items-baseline justify-between"
        style={{ gap: Space[2], paddingBottom: Space[1] }}>
        <Text variant="callout" className="shrink">
          {formatStopDay(day.date)}
          {today ? (
            <Text variant="label" tone="muted">
              {' · Today'}
            </Text>
          ) : null}
        </Text>
        {total ? (
          <Text variant="callout" style={{ fontVariant: ['tabular-nums'] }}>
            {formatMoneyTight(total, homeCurrency)}
          </Text>
        ) : null}
      </View>
      {day.expenses.map((expense, index) => (
        <View key={expense.id}>
          {index > 0 ? (
            <View
              testID={`expense-day-${day.date}-separator-${index}`}
              className="bg-separator"
              style={{ height: 1, marginStart: SEPARATOR_INSET }}
            />
          ) : null}
          <ExpenseRow
            expense={expense}
            categoryName={categoryName(expense.category_id)}
            categoryIcon={categoryIcon(expense.category_id)}
            place={placeOf(expense.city_id)}
            homeCurrency={homeCurrency}
            onRemove={() => onRemove(expense)}
          />
        </View>
      ))}
    </View>
  );
}
