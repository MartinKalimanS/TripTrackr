/** The expenses list header: back, title, actions, the toggled summary, write error. */
import type { ExpenseSummary } from '@triptrackr/contracts';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { SpendingSummary } from '@/components/trip/spending-summary';
import { InlineError } from '@/components/ui/inline-error';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

export type ExpensesHeaderProps = {
  tripTitle: string | null;
  summary: ExpenseSummary;
  summaryLoading: boolean;
  ratesAsOf: string | null;
  showSummary: boolean;
  writeError: string | null;
  onBack: () => void;
  onAdd: () => void;
  onToggleSummary: () => void;
};

export function ExpensesHeader({
  tripTitle,
  summary,
  summaryLoading,
  ratesAsOf,
  showSummary,
  writeError,
  onBack,
  onAdd,
  onToggleSummary,
}: ExpensesHeaderProps) {
  return (
    <View style={styles.header}>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={onBack}
        style={styles.back}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <ThemedText type="subtitle" testID="expenses-title">
        {tripTitle ? `Spending · ${tripTitle}` : 'Spending'}
      </ThemedText>

      <View style={styles.actions}>
        <PressableSurface
          testID="expenses-add"
          accessibilityLabel="Add expense"
          depth={2}
          onPress={onAdd}
          style={styles.action}>
          <ThemedText type="smallBold">Add expense</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="expenses-toggle-summary"
          accessibilityLabel={showSummary ? 'Hide summary' : 'Show summary'}
          accessibilityState={{ expanded: showSummary }}
          treatment={showSummary ? 'recessed' : 'raised'}
          onPress={onToggleSummary}
          style={styles.action}>
          <ThemedText type="smallBold">Summary</ThemedText>
        </PressableSurface>
      </View>

      {showSummary && !summaryLoading ? (
        <SpendingSummary summary={summary} ratesAsOf={ratesAsOf} />
      ) : null}

      <InlineError testID="expenses-write-error" message={writeError} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.three },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
