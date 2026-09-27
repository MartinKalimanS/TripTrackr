/**
 * Expense category picker — tasks.md T086 (FR-023, FR-024; research D-29).
 *
 * The six system categories first, then the traveller's own, as pills; a
 * "New category" field creates a custom one on the spot — reusable across
 * every trip, because it is scoped to the traveller. Selection is conveyed
 * by treatment and `accessibilityState`, never by hue alone (FR-010).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import type { CategoryOption } from '@/db/repositories/expenses';

export type CategoryPickerProps = {
  options: readonly CategoryOption[];
  /** Category id, or '' for none. */
  value: string;
  onChange: (categoryId: string) => void;
  /** Creates a custom category and returns its id; the picker selects it. */
  onCreate?: (name: string) => string;
  error?: string;
};

export function CategoryPicker({
  options,
  value,
  onChange,
  onCreate,
  error,
}: CategoryPickerProps) {
  const [draft, setDraft] = useState('');

  const create = () => {
    const name = draft.trim();
    if (!onCreate || name.length === 0) return;
    onChange(onCreate(name));
    setDraft('');
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">Category</ThemedText>
      <View style={styles.pills} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <PressableSurface
              key={option.id}
              testID={`category-${option.id}`}
              accessibilityLabel={option.name}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              treatment={selected ? 'recessed' : 'raised'}
              radius="pill"
              onPress={() => onChange(option.id)}
              style={styles.pill}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>
                {option.name}
              </ThemedText>
            </PressableSurface>
          );
        })}
      </View>
      {onCreate ? (
        <View style={styles.create}>
          <View style={styles.createField}>
            <TextField
              testID="category-new-name"
              label="New category"
              value={draft}
              onChangeText={setDraft}
              placeholder="Coffee"
              autoCapitalize="words"
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={create}
            />
          </View>
          <PressableSurface
            testID="category-new-add"
            accessibilityLabel="Add category"
            treatment="raised"
            radius="sm"
            disabled={draft.trim().length === 0}
            onPress={create}
            style={styles.createButton}>
            <ThemedText type="smallBold">Add</ThemedText>
          </PressableSurface>
        </View>
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  create: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  createField: { flex: 1 },
  createButton: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
});
