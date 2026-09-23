/**
 * Home-currency picker for a trip — tasks.md T066 (FR-009).
 *
 * A short row of common ISO 4217 codes as pills, plus a free-text field for
 * any other code. The free text is validated by the contracts' `CurrencyCode`
 * (three upper-case letters); the picker upper-cases as the traveller types
 * so "eur" is not an error, it is EUR.
 */
import { CurrencyCode } from '@triptrackr/contracts';
import { StyleSheet, View } from 'react-native';

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
  const isCommon = (COMMON_CURRENCIES as readonly string[]).includes(value);

  return (
    <View style={styles.container}>
      <ThemedText type="small">Home currency</ThemedText>
      <View style={styles.pills} accessibilityRole="radiogroup">
        {COMMON_CURRENCIES.map((code) => {
          const selected = code === value;
          return (
            <PressableSurface
              key={code}
              testID={`currency-${code}`}
              accessibilityLabel={code}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              treatment={selected ? 'recessed' : 'raised'}
              radius="pill"
              onPress={() => onChange(code)}
              style={styles.pill}>
              <ThemedText type={selected ? 'smallBold' : 'small'}>{code}</ThemedText>
            </PressableSurface>
          );
        })}
      </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
