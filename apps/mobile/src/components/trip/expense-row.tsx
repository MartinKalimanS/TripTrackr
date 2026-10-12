/**
 * One expense in the trip's list — tasks.md T086 (FR-020, FR-021, FR-026), 004 T441 (FR-004,
 * FR-014, FR-025, FR-029, FR-030, FR-034).
 *
 * A row of a day group (`expenses.tsx` draws the group, `ListGroup`, so the row has no
 * surface or card of its own and the group's inset separators tell the rows apart): the
 * category's icon, the category's name (a headline) with the note under it, and the
 * amounts on the right, right-aligned in tabular figures. The amount as paid is the
 * headline of the pair; the home-currency figure, or the words "Awaiting a rate", sits
 * under it whenever the currency differs, so a traveller always sees both what they handed
 * over and what it cost them. The date is the group's heading, so the row does not repeat
 * it (its accessible name still does). Under all of that: the pending marker (words and
 * icon) while the row only exists on this device, and Delete, the one destructive control,
 * an icon and a word, wrapping onto its own line at large text.
 *
 * What did not change for assistive technology (FR-030): the row is ONE element named
 * `<category>, <paid>, <home or "awaiting a rate">, <date>[. <note>]` with the one action
 * (Delete expense), and Delete keeps its id and name. The element is a plain `View`
 * because a `ListRow` has no place for a marker and a delete control.
 */
import { View, type AccessibilityActionEvent } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { formatMoney } from '@/lib/locale';

import { categoryIconName } from './category-icon';

export type ExpenseRowProps = {
  expense: ExpenseRecord;
  categoryName: string;
  /** The category's icon key (`food`, `lodging`, ...); none or an unknown one draws the generic glyph. */
  categoryIcon?: string | null;
  homeCurrency: string;
  onRemove: () => void;
};

const REMOVE: IconName = 'trash';
const ROW_ACTIONS = [{ name: 'delete', label: 'Delete expense' }];

type AmountsProps = {
  id: string;
  paid: string;
  /** The home-currency figure; null while the conversion waits for a rate. */
  home: string | null;
  showHome: boolean;
};

/** The paid amount, and under it the home figure or the words that it is still to come. */
function Amounts({ id, paid, home, showHome }: AmountsProps) {
  return (
    <View className="items-end gap-0.5">
      <Text type="numeric" className="text-right" testID={`expense-paid-${id}`}>
        {paid}
      </Text>
      {showHome && home ? (
        <Text
          type="numeric"
          context="callout"
          tone="muted"
          className="text-right"
          testID={`expense-home-${id}`}>
          {home}
        </Text>
      ) : null}
      {showHome && !home ? (
        <Text
          type="callout"
          tone="muted"
          className="text-right"
          testID={`expense-home-${id}`}>
          Awaiting a rate
        </Text>
      ) : null}
    </View>
  );
}

export function ExpenseRow({
  expense,
  categoryName,
  categoryIcon,
  homeCurrency,
  onRemove,
}: ExpenseRowProps) {
  const paid = formatMoney(expense.amount, expense.currency);
  const home =
    expense.amount_home !== null && !expense.fx_pending
      ? formatMoney(expense.amount_home, homeCurrency)
      : null;
  const when = formatIsoDate(expense.spent_at);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'delete') onRemove();
  };

  return (
    <View
      testID={`expense-row-${expense.id}`}
      accessible
      accessibilityLabel={`${categoryName}, ${paid}${home ? `, ${home}` : ', awaiting a rate'}, ${when}${expense.note ? `. ${expense.note}` : ''}`}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}
      className="gap-2 px-4 py-3">
      <View className="flex-row items-start gap-3">
        <Icon
          name={categoryIconName(categoryIcon)}
          size={24}
          testID={`expense-icon-${expense.id}`}
        />
        <View className="flex-1">
          <Text type="headline">{categoryName}</Text>
          {expense.note ? (
            <Text type="callout" tone="muted">
              {expense.note}
            </Text>
          ) : null}
        </View>
        <Amounts
          id={expense.id}
          paid={paid}
          home={home}
          showHome={expense.currency !== homeCurrency}
        />
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {expense.is_dirty ? <SyncBadge state="pending" /> : null}
        <Button
          testID={`expense-remove-${expense.id}`}
          variant="destructive"
          size="sm"
          icon={REMOVE}
          accessibilityLabel={`Delete ${categoryName} expense of ${paid}`}
          className="ml-auto"
          onPress={onRemove}>
          Delete
        </Button>
      </View>
    </View>
  );
}
