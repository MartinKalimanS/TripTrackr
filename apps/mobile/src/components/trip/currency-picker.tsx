/**
 * Home-currency picker for a trip — tasks.md T066 (FR-009); one line since feature 003
 * (FR-017); on the Atlas adapters since feature 004 (T435; contract C4-8).
 *
 * The common ISO 4217 codes sit in ONE sideways-scrolling `ChipGroup`, with an "Other"
 * chip after them that opens a free-text `Field` for any other code. The field is shown
 * on its own when it has to be: the value is an uncommon code, or there is a validation
 * message that needs a home. The free text is validated by the contracts' `CurrencyCode`
 * (three upper-case letters); the picker upper-cases as the traveller types so "eur" is
 * not an error, it is EUR.
 *
 * "Other" is the dashed "add" chip with a plus (UI-SPEC 3.3; form.png). Exactly one option
 * is selected at a time: while "Other" is open it is the selected
 * chip and no common code is. The ids and names are the ones the Maestro flows select by:
 * `currency-pills` (now the radiogroup that holds the chips), `currency-<CODE>` named by
 * the code, `currency-other-toggle` named "Other currency", and `currency-other` (the
 * free-text input; its message is `currency-other-error`).
 */
import { CurrencyCode } from '@triptrackr/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';

export const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'CZK',
  'PLN',
  'SEK',
] as const;

export type CurrencyPickerProps = {
  /** Upper-case code, or whatever the traveller has typed so far. */
  value: string;
  onChange: (code: string) => void;
  /** Conveyed by message text as well as colour (FR-010). */
  error?: string;
  /** The row's label and the group's name: "Home currency" on a trip, "Currency" on an expense. */
  label?: string;
};

export function isValidCurrency(code: string): boolean {
  return CurrencyCode.safeParse(code).success;
}

/** The key of the "Other" chip: not a code, so it cannot collide with one. */
const OTHER_KEY = 'other';

const OPTIONS: readonly ChipOption[] = [
  ...COMMON_CURRENCIES.map((code) => ({
    key: code,
    label: code,
    testID: `currency-${code}`,
    accessibilityLabel: code,
  })),
  {
    key: OTHER_KEY,
    label: 'Other',
    testID: 'currency-other-toggle',
    accessibilityLabel: 'Other currency',
    leading: 'plus',
    dashed: true,
  },
];

export function CurrencyPicker({
  value,
  onChange,
  error,
  label = 'Home currency',
}: CurrencyPickerProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const isCommon = (COMMON_CURRENCIES as readonly string[]).includes(value);
  const showOther = otherOpen || (!isCommon && value !== '') || Boolean(error);

  // A common code is cleared as the field opens, so one option is selected at a
  // time and an empty field is reported rather than silently keeping the code.
  const openOther = () => {
    setOtherOpen(true);
    if (isCommon) onChange('');
  };

  const select = (key: string) => {
    if (key === OTHER_KEY) {
      openOther();
      return;
    }
    setOtherOpen(false);
    onChange(key);
  };

  return (
    <View className="gap-2">
      <Text variant="label" strong>
        {label}
      </Text>
      <ChipGroup
        scroll
        testID="currency-pills"
        accessibilityLabel={label}
        options={OPTIONS}
        selectedKey={showOther ? OTHER_KEY : value}
        onSelect={select}
      />
      {showOther ? (
        <Field
          testID="currency-other"
          label="Other currency code"
          value={isCommon ? '' : value}
          onChangeText={(text) => onChange(text.toUpperCase().slice(0, 3))}
          placeholder="e.g. THB"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          error={error}
        />
      ) : null}
    </View>
  );
}
