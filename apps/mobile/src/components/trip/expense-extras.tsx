/**
 * `ExpenseExtras` - the collapsed "Add note, date or place" row of Add expense (feature 005,
 * F6; `add-expense.png`, the prototype's `.disc`): a cream 56 dp row with a 36 dp pen disc,
 * the callout "Add note, date or place" over a one-line summary of what is already set
 * ("Today, 14 Oct · Lisbon"), and a chevron. It is a real disclosure: role button, announced
 * `expanded`, and tapping it shows the day, the city and the note that the form has always had
 * (`add-expense-date`, `add-expense-city-*`, `add-expense-note`) in the same place. Nothing is
 * dropped by closing it, and the summary says what is inside.
 *
 *   <ExpenseExtras summary="Today, 14 Oct" expanded={open} onToggle={flip}>
 *     <DateField ... /> <NoteField ... />
 *   </ExpenseExtras>
 *
 * The caller opens it by itself when a field inside has a refusal to show (a hidden error is a
 * silent failure): `expanded` is the caller's.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';

export const EXTRAS_LABEL = 'Add note, date or place';

export type ExpenseExtrasProps = {
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

const ROW =
  'flex-row items-center gap-3 border border-separator bg-surface-secondary py-2 pl-3 pr-4';
const DISC =
  'h-9 w-9 items-center justify-center rounded-full border border-separator bg-surface';

export function ExpenseExtras({
  summary,
  expanded,
  onToggle,
  children,
}: ExpenseExtrasProps) {
  return (
    <View className="gap-4">
      <Tappable
        testID="add-expense-more"
        accessibilityLabel={EXTRAS_LABEL}
        accessibilityHint={summary}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        className={ROW}
        style={{ minHeight: 56 }}>
        <View className={DISC} accessibilityElementsHidden>
          <Icon name="pencil" size={20} tone="ink" />
        </View>
        <View className="flex-1">
          <Text variant="callout">{EXTRAS_LABEL}</Text>
          <Text
            testID="add-expense-more-summary"
            variant="label"
            tone="muted"
            numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} tone="subtle" />
      </Tappable>
      {expanded ? (
        <View testID="add-expense-extras" className="gap-4">
          {children}
        </View>
      ) : null}
    </View>
  );
}
