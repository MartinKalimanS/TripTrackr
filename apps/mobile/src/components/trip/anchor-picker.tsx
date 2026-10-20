/**
 * Where a note belongs — tasks.md T084, T085 (FR-017, FR-018); on the Atlas adapters since
 * feature 004 (T436; contract C4-8; FR-025, FR-030, FR-037).
 *
 * The three levels as chips: the whole trip (or each country of a multi-country trip),
 * then each city the trip stops in, in a `ChipGroup` that wraps, so every place is in view
 * and none waits off the edge of a sideways row. Selection is the chip's own: a filled
 * accent chip, a heavier label and a check glyph, announced `{ selected, checked }` on a
 * `radio`, never hue alone (FR-010, FR-025).
 *
 * What did not change: the props, `testID` on the container, `anchor-<key>` on each chip
 * named by the target's label, the radio group (unnamed, as before: its name would be a
 * label the guard in `scripts/testid-baseline.mjs` cannot read), the words for a trip with
 * no stop. New and additive: a refusal is words with an alert icon (`InlineError`, id
 * `<testID>-error`, or `anchor-picker-error` with no `testID`), an alert as before.
 */
import { View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import type { AnchorTarget } from '@/features/notes/use-move-note';

export type AnchorPickerProps = {
  label: string;
  targets: readonly AnchorTarget[];
  /** `AnchorTarget.key` of the current choice, or '' for none. */
  value: string;
  onChange: (key: string) => void;
  error?: string;
  testID?: string;
};

function chipOptions(targets: readonly AnchorTarget[]): ChipOption[] {
  return targets.map((target) => ({
    key: target.key,
    label: target.label,
    testID: `anchor-${target.key}`,
    accessibilityLabel: target.label,
  }));
}

export function AnchorPicker({
  label,
  targets,
  value,
  onChange,
  error,
  testID,
}: AnchorPickerProps) {
  return (
    <View className="gap-2" testID={testID}>
      <Text type="callout">{label}</Text>
      {targets.length === 0 ? (
        <Text type="callout" tone="muted">
          Add a stop to this trip first — notes are filed under its countries and cities.
        </Text>
      ) : (
        <ChipGroup
          options={chipOptions(targets)}
          selectedKey={value}
          onSelect={onChange}
        />
      )}
      <InlineError
        testID={`${testID ?? 'anchor-picker'}-error`}
        message={error ?? null}
      />
    </View>
  );
}
