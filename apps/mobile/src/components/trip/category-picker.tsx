/**
 * Expense category picker — tasks.md T086 (FR-023, FR-024; research D-29); on the Atlas
 * adapters since feature 004 (T435; contract C4-8, C4-11).
 *
 * The six system categories first, then the traveller's own, as a `ChipGroup`; a "New
 * category" `Field` creates a custom one on the spot — reusable across every trip, because
 * it is scoped to the traveller. Selection is the chip's own (a fill, a heavier label and
 * a check glyph, announced selected and checked), never hue alone (FR-010, FR-025).
 *
 * The chips are one sideways row by default (contract C4-11: "category chips one row"),
 * so a growing list of the traveller's own categories never pushes the form down; pass
 * `scroll={false}` for a screen that would rather wrap them. The ids are unchanged:
 * `category-<id>` named by the category, `category-new-name` (the field) and
 * `category-new-add` ("Add category", a secondary button, held while the draft is blank).
 * The error is words with an alert icon (`category-error`).
 */
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import type { CategoryOption } from '@/db/repositories/expenses';

export type CategoryPickerProps = {
  options: readonly CategoryOption[];
  /** Category id, or '' for none. */
  value: string;
  onChange: (categoryId: string) => void;
  /** Creates a custom category and returns its id; the picker selects it. */
  onCreate?: (name: string) => string;
  error?: string;
  /** One sideways row (default) or wrapping onto further lines. */
  scroll?: boolean;
};

function chipOptions(options: readonly CategoryOption[]): ChipOption[] {
  return options.map((option) => ({
    key: option.id,
    label: option.name,
    testID: `category-${option.id}`,
    accessibilityLabel: option.name,
  }));
}

export function CategoryPicker({
  options,
  value,
  onChange,
  onCreate,
  error,
  scroll = true,
}: CategoryPickerProps) {
  const [draft, setDraft] = useState('');

  const create = () => {
    const name = draft.trim();
    if (!onCreate || name.length === 0) return;
    onChange(onCreate(name));
    setDraft('');
  };

  return (
    <View className="gap-2">
      <Text type="callout">Category</Text>
      <ChipGroup
        scroll={scroll}
        accessibilityLabel="Category"
        options={chipOptions(options)}
        selectedKey={value}
        onSelect={onChange}
      />
      {onCreate ? (
        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <Field
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
          <Button
            testID="category-new-add"
            variant="secondary"
            accessibilityLabel="Add category"
            disabled={draft.trim().length === 0}
            onPress={create}>
            Add
          </Button>
        </View>
      ) : null}
      <InlineError testID="category-error" message={error ?? null} />
    </View>
  );
}
