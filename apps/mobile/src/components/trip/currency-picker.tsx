/**
 * Home-currency picker for a trip — tasks.md T066 (FR-009); one line since
 * feature 003 (FR-017).
 *
 * The common ISO 4217 codes sit in ONE sideways-scrolling row of pills, with an
 * "Other" pill after them that opens a free-text field for any other code. The
 * field is shown on its own when it has to be: the value is an uncommon code, or
 * there is a validation message that needs a home. The free text is validated
 * by the contracts' `CurrencyCode` (three upper-case letters); the picker
 * upper-cases as the traveller types so "eur" is not an error, it is EUR.
 *
 * The pills are flat, not raised: a raised pill's shadow would be clipped by
 * the scroller that keeps them on one line.
 */
import { CurrencyCode } from '@triptrackr/contracts';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

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
};

export function isValidCurrency(code: string): boolean {
  return CurrencyCode.safeParse(code).success;
}

export function CurrencyPicker({ value, onChange, error }: CurrencyPickerProps) {
  const [otherOpen, setOtherOpen] = useState(false);
  const isCommon = (COMMON_CURRENCIES as readonly string[]).includes(value);
  const showOther = otherOpen || (!isCommon && value !== '') || Boolean(error);

  const choose = (code: string) => {
    setOtherOpen(false);
    onChange(code);
  };

  // A common code is cleared as the field opens, so one option is selected at a
  // time and an empty field is reported rather than silently keeping the code.
  const openOther = () => {
    setOtherOpen(true);
    if (isCommon) onChange('');
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">Home currency</ThemedText>
      <ScrollView
        testID="currency-pills"
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.pills}>
        {COMMON_CURRENCIES.map((code) => {
          const selected = code === value;
          return (
            <PressableSurface
              key={code}
              testID={`currency-${code}`}
              accessibilityLabel={code}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              treatment={selected ? 'recessed' : 'flat'}
              radius="pill"
              onPress={() => choose(code)}
              style={styles.pill}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{code}</ThemedText>
            </PressableSurface>
          );
        })}
        <PressableSurface
          testID="currency-other-toggle"
          accessibilityLabel="Other currency"
          accessibilityRole="radio"
          accessibilityState={{ selected: showOther, checked: showOther }}
          treatment={showOther ? 'recessed' : 'flat'}
          radius="pill"
          onPress={openOther}
          style={styles.pill}>
          <ThemedText type={showOther ? 'smallBold' : 'small'}>Other</ThemedText>
        </PressableSurface>
      </ScrollView>
      {showOther ? (
        <TextField
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

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  pills: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
