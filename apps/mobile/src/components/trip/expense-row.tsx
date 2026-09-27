/**
 * One expense in the trip's list — tasks.md T086 (FR-020, FR-021, FR-026).
 *
 * The amount as paid is the headline; the home-currency figure — or "awaiting
 * a rate" — sits beside it, so a traveller always sees both what they handed
 * over and what it cost them. Remove is an explicit control and an
 * `accessibilityAction`.
 */
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import type { ExpenseRow as ExpenseRecord } from '@/db/schema';
import { formatIsoDate } from '@/features/trips/stop-dates';
import { formatMoney } from '@/lib/locale';

export type ExpenseRowProps = {
  expense: ExpenseRecord;
  categoryName: string;
  homeCurrency: string;
  onRemove: () => void;
};

export function ExpenseRow({
  expense,
  categoryName,
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
    <Surface
      treatment="raised"
      depth={1}
      radius="lg"
      testID={`expense-row-${expense.id}`}
      accessible
      accessibilityLabel={`${categoryName}, ${paid}${home ? `, ${home}` : ', awaiting a rate'}, ${when}${expense.note ? `. ${expense.note}` : ''}`}
      accessibilityActions={[{ name: 'delete', label: 'Delete expense' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.card}>
      <View style={styles.main}>
        <View style={styles.text}>
          <ThemedText type="smallBold">{categoryName}</ThemedText>
          <ThemedText type="small" themeColor="textMuted">
            {when}
            {expense.note ? ` · ${expense.note}` : ''}
          </ThemedText>
        </View>
        <View style={styles.amounts}>
          <ThemedText type="smallBold" testID={`expense-paid-${expense.id}`}>
            {paid}
          </ThemedText>
          {expense.currency !== homeCurrency ? (
            <ThemedText
              type="small"
              themeColor="textMuted"
              testID={`expense-home-${expense.id}`}>
              {home ?? 'Awaiting a rate'}
            </ThemedText>
          ) : null}
        </View>
      </View>
      <View style={styles.footer}>
        {expense.is_dirty ? <SyncBadge state="pending" /> : <View />}
        <PressableSurface
          testID={`expense-remove-${expense.id}`}
          accessibilityLabel={`Delete ${categoryName} expense of ${paid}`}
          treatment="flat"
          radius="sm"
          onPress={onRemove}
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="danger">
            Delete
          </ThemedText>
        </PressableSurface>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  main: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  text: { flex: 1, gap: Spacing.half },
  amounts: { alignItems: 'flex-end', gap: Spacing.half },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
