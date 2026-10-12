/**
 * The expenses list header: "Add expense", the summary toggle, the toggled summary and the
 * write error — 004 T441 (FR-005, FR-007, FR-008, FR-014, FR-030).
 *
 * The title and Back are the native header's (`app/trip/[id]/_layout.tsx`), so this draws
 * neither; the old `expenses-title` line ("Spending · <trip>") went with them. What stays
 * keeps its reading order (the action, the toggle, the summary, the error) and its ids and
 * names. "Add expense" is the screen's one primary control (FR-005); the summary toggle is
 * a quiet text-weight control, a word and a chevron in the accent, announced as before:
 * named for what it will do ("Hide summary" / "Show summary") and `expanded` or not (the
 * `Button` adapter announces no `expanded` state, so it is a `Tappable`). When the list is
 * empty the empty state offers "Add expense" again as a secondary under another id
 * (`expenses-empty-add`), as the Trips screen does.
 */
import type { ExpenseSummary } from '@triptrackr/contracts';
import { View } from 'react-native';

import { SpendingSummary } from '@/components/trip/spending-summary';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';

export type ExpensesHeaderProps = {
  summary: ExpenseSummary;
  summaryLoading: boolean;
  ratesAsOf: string | null;
  showSummary: boolean;
  writeError: string | null;
  onAdd: () => void;
  onToggleSummary: () => void;
};

const ADD: IconName = 'plus';
const COLLAPSE: IconName = 'chevron-up';
const EXPAND: IconName = 'chevron-down';

function SummaryToggle({
  showSummary,
  onToggle,
}: {
  showSummary: boolean;
  onToggle: () => void;
}) {
  return (
    <Tappable
      testID="expenses-toggle-summary"
      accessibilityLabel={showSummary ? 'Hide summary' : 'Show summary'}
      accessibilityState={{ expanded: showSummary }}
      className="flex-row items-center gap-1 px-3"
      onPress={onToggle}>
      <Text tone="accent">Summary</Text>
      <Icon name={showSummary ? COLLAPSE : EXPAND} size={16} tone="accent" />
    </Tappable>
  );
}

export function ExpensesHeader({
  summary,
  summaryLoading,
  ratesAsOf,
  showSummary,
  writeError,
  onAdd,
  onToggleSummary,
}: ExpensesHeaderProps) {
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          testID="expenses-add"
          variant="primary"
          icon={ADD}
          accessibilityLabel="Add expense"
          onPress={onAdd}>
          Add expense
        </Button>
        <SummaryToggle showSummary={showSummary} onToggle={onToggleSummary} />
      </View>

      {showSummary && !summaryLoading ? (
        <SpendingSummary summary={summary} ratesAsOf={ratesAsOf} />
      ) : null}

      <InlineError testID="expenses-write-error" message={writeError} />
    </View>
  );
}
