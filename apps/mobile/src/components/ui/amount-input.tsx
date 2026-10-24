/**
 * `AmountInput` - the amount-first figure of Add expense (feature 005, F6; UI-SPEC 9.1:
 * "the amount first (`display` ~56, tabular, decimal keypad)"; `add-expense.png`):
 *
 *   <AmountInput testID="add-expense-amount" symbol="€" value={text} onChangeText={set}
 *     placeholder="12.50" error={message} autoFocus />
 *
 * The currency symbol (title role, muted) stands before a 56 / 60 Bricolage figure with
 * tabular numerals and -.03em tracking, centred, the caret in the `focus` colour. It is a
 * real `TextInput` holding the amount AS TYPED (a string: the parse is the form's, SC-016),
 * so every keypad's separator works.
 *
 * - `testID` and the name ("Amount") are on the INPUT, the node a flow types into.
 * - The figure is held to 1.3 times the text size (the `numeral` rule, FR-074) and is one line
 *   that shrinks inside the row (a very long amount scrolls in its input), so the largest text
 *   size never pushes the symbol off the sheet; the accessible name carries the rest.
 * - An error is WORDS and an icon under the figure (`InlineError`, `<testID>-error`) and
 *   `aria-invalid` on the input: never colour alone (FR-025).
 * - The figure has no boundary of its own: it is the sheet's headline, not a field box.
 *
 * Colours are tokens (`useColors`); there is no literal.
 */
import { TextInput, View, type TextInputProps } from 'react-native';

import { CappedFontScale, fontClassOf } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { InlineError } from './inline-error';
import { Text } from './text';
import { useColors } from './theme-tokens';

export type AmountInputProps = Pick<
  TextInputProps,
  'value' | 'onChangeText' | 'onBlur' | 'placeholder' | 'autoFocus' | 'keyboardType'
> & {
  /** What stands before the figure: "€", or the code when there is no symbol. */
  symbol: string;
  testID?: string;
  /** Default "Amount". */
  accessibilityLabel?: string;
  /** Conveyed by words and an icon as well as colour (FR-025). Empty is no error. */
  error?: string;
};

export const AMOUNT_SIZE = 56;
export const AMOUNT_LINE_HEIGHT = 60;
/** -.03em of the size, in dp: React Native has no `em`. */
export const AMOUNT_TRACKING = -0.03 * AMOUNT_SIZE;

const COLOR_KEYS = ['ink', 'subtle', 'focus'] as const;
const FACE = `${fontClassOf('display', 700)} text-foreground`;

export function AmountInput({
  symbol,
  testID,
  accessibilityLabel = 'Amount',
  error,
  keyboardType = 'decimal-pad',
  ...input
}: AmountInputProps) {
  assertAccessibleName('AmountInput', accessibilityLabel);
  const colors = useColors(COLOR_KEYS);
  const invalid = Boolean(error);

  return (
    <View className="gap-2">
      <View
        testID={testID && `${testID}-row`}
        className="flex-row items-baseline justify-center gap-1 pb-1 pt-3">
        {symbol ? (
          <Text variant="title" tone="muted" accessibilityElementsHidden>
            {symbol}
          </Text>
        ) : null}
        <TextInput
          {...input}
          testID={testID}
          accessibilityLabel={accessibilityLabel}
          aria-invalid={invalid}
          keyboardType={keyboardType}
          maxFontSizeMultiplier={CappedFontScale}
          numberOfLines={1}
          selectionColor={colors.focus}
          cursorColor={colors.focus}
          placeholderTextColor={colors.subtle}
          className={FACE}
          style={{
            fontSize: AMOUNT_SIZE,
            lineHeight: AMOUNT_LINE_HEIGHT,
            letterSpacing: AMOUNT_TRACKING,
            fontVariant: ['tabular-nums'],
            padding: 0,
            minWidth: AMOUNT_SIZE,
            flexShrink: 1,
            textAlign: 'center',
          }}
        />
      </View>
      <InlineError testID={`${testID ?? 'amount-input'}-error`} message={error || null} />
    </View>
  );
}
