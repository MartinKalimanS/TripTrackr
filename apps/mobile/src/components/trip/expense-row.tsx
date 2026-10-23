/**
 * One expense in the trip's list - tasks.md T086 (FR-020, FR-021, FR-026), 004 T441 (FR-004,
 * FR-014, FR-025, FR-029, FR-030, FR-034), restyled by 005 T550 (FR-047; prototype `.xrow`,
 * `.xic`; pictures `more/expenses*.png`).
 *
 * As pictured: a 40 dp round icon of the category on the category's tint, the title (the note,
 * or the category's name when there is none; two lines at the most) over "Category · place"
 * (muted, one line), and the amounts at the end, right-aligned in tabular figures. The figure
 * on top is what the expense cost in the trip's home currency, which is what the day's total
 * adds up; for another currency the amount as paid sits under it, muted ("$36.12"), and while
 * the conversion waits for a rate the amount as paid is the top figure and the words
 * "Awaiting a rate" sit under it. The place is the city's name where this device knows it.
 * A row that only exists on this device carries the pending marker (words and icon) beside
 * the category line. There are no rules between days and no card: the group (`expenses.tsx`)
 * draws the hairlines.
 *
 * Delete is the one destructive control and the picture draws none: a tap on the row shows it
 * under the row (an icon and a word, `expense-remove-<id>`), another tap hides it, and the row
 * also offers it as an accessibility action ("Delete expense") for a screen reader's actions
 * menu. The row is ONE element named `<category>, <paid>, <home or "awaiting a rate">,
 * <date>[. <note>]` (FR-030), unchanged by the restyle; it says it is expanded when the
 * Delete is showing.
 */
import { useState } from 'react';
import { View, type AccessibilityActionEvent, type TextStyle } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Tappable } from '@/components/ui/tappable';
import { metaLines } from '@/components/ui/reflow';
import { Text } from '@/components/ui/text';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { categoryTone } from '@/features/expenses/spending-summary';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { useFontScale } from '@/hooks/use-font-scale';
import { formatMoney } from '@/lib/locale';
import { Space } from '@/theme';

import { categoryIconName } from './category-icon';
import { CATEGORY_LOOKS, useCategoryColors } from './category-look';

export type ExpenseRowProps = {
  expense: ExpenseRecord;
  categoryName: string;
  /** The category's icon key (`food`, `lodging`, ...); none or an unknown one draws the generic glyph. */
  categoryIcon?: string | null;
  /** The name of the city the expense was in, where this device knows it. */
  place?: string | null;
  homeCurrency: string;
  onRemove: () => void;
};

const REMOVE: IconName = 'trash';
const ROW_ACTIONS = [{ name: 'delete', label: 'Delete expense' }];
const ICON_DISC = 40;

type AmountsProps = {
  id: string;
  /** The amount as paid. */
  paid: string;
  /** The home-currency figure; null while the conversion waits for a rate. */
  home: string | null;
  foreign: boolean;
};

const AMOUNT_STYLE: TextStyle = { fontVariant: ['tabular-nums'], textAlign: 'right' };

/**
 * The figure on top and the line under it. Another currency, converted: the home figure on top
 * (what the day adds up) and the amount as paid under it. Another currency, waiting: the amount
 * as paid, and "Awaiting a rate". The trip's own currency: the amount alone.
 */
function Amounts({ id, paid, home, foreign }: AmountsProps) {
  const paidText = (
    <Text variant="callout" style={AMOUNT_STYLE} testID={`expense-paid-${id}`}>
      {paid}
    </Text>
  );
  if (!foreign) return <View className="items-end">{paidText}</View>;
  if (home) {
    return (
      <View className="items-end">
        <Text variant="callout" style={AMOUNT_STYLE} testID={`expense-home-${id}`}>
          {home}
        </Text>
        <Text variant="label" tone="muted" style={AMOUNT_STYLE}>
          {paid}
        </Text>
      </View>
    );
  }
  return (
    <View className="items-end">
      {paidText}
      <Text
        variant="label"
        tone="muted"
        style={{ textAlign: 'right' }}
        testID={`expense-home-${id}`}>
        Awaiting a rate
      </Text>
    </View>
  );
}

function CategoryDisc({
  expense,
  icon,
}: {
  expense: ExpenseRecord;
  icon?: string | null;
}) {
  const colors = useCategoryColors();
  const look = CATEGORY_LOOKS[categoryTone(expense.category_id)];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center"
      style={{
        width: ICON_DISC,
        height: ICON_DISC,
        borderRadius: ICON_DISC / 2,
        backgroundColor: colors[look.tint],
      }}>
      <Icon
        name={categoryIconName(icon)}
        size={20}
        testID={`expense-icon-${expense.id}`}
      />
    </View>
  );
}

export function ExpenseRow({
  expense,
  categoryName,
  categoryIcon,
  place,
  homeCurrency,
  onRemove,
}: ExpenseRowProps) {
  const [open, setOpen] = useState(false);
  const fontScale = useFontScale();
  const paid = formatMoney(expense.amount, expense.currency);
  const home =
    expense.amount_home !== null && !expense.fx_pending
      ? formatMoney(expense.amount_home, homeCurrency)
      : null;
  const foreign = expense.currency !== homeCurrency;
  const when = formatIsoDate(expense.spent_at);

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'delete') onRemove();
  };

  const title = expense.note ?? categoryName;
  const meta = [expense.note ? categoryName : null, place ?? null]
    .filter((part): part is string => !!part)
    .join(' · ');

  return (
    <View testID={`expense-entry-${expense.id}`}>
      <Tappable
        testID={`expense-row-${expense.id}`}
        accessibilityLabel={`${categoryName}, ${paid}${home ? `, ${home}` : ', awaiting a rate'}, ${when}${expense.note ? `. ${expense.note}` : ''}`}
        accessibilityHint={open ? 'Hides the delete button' : 'Shows the delete button'}
        accessibilityActions={ROW_ACTIONS}
        onAccessibilityAction={onAccessibilityAction}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        className="flex-row items-center"
        style={{ gap: Space[3], minHeight: 64, paddingVertical: Space[2] }}>
        <CategoryDisc expense={expense} icon={categoryIcon} />
        <View className="min-w-0 flex-1">
          <Text variant="callout" numberOfLines={2}>
            {title}
          </Text>
          <View
            className="flex-row flex-wrap items-center"
            style={{ columnGap: Space[2] }}>
            {meta ? (
              <Text
                variant="label"
                tone="muted"
                numberOfLines={metaLines(fontScale)}
                className="shrink">
                {meta}
              </Text>
            ) : null}
            {expense.is_dirty ? <SyncBadge state="pending" /> : null}
          </View>
        </View>
        <Amounts id={expense.id} paid={paid} home={home} foreign={foreign} />
      </Tappable>
      {open ? (
        <View className="flex-row" style={{ paddingBottom: Space[2], paddingStart: 52 }}>
          <Button
            testID={`expense-remove-${expense.id}`}
            variant="destructive"
            size="sm"
            icon={REMOVE}
            accessibilityLabel={`Delete ${categoryName} expense of ${paid}`}
            onPress={onRemove}>
            Delete
          </Button>
        </View>
      ) : null}
    </View>
  );
}
