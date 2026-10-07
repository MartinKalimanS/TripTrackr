/**
 * `Field` - the labelled text input of Atlas (feature 004; contract C4-8; FR-024, FR-025,
 * FR-029, FR-030; review rules 2, 3 and 7), over the kit's TextField, Label, Input,
 * FieldError and Description. It has the prop surface of the retired `TextField`
 * (`text-field.tsx`, which the unmigrated screens keep using until phase 7):
 *
 *   <Field label="Email" value={email} onChangeText={setEmail} error={errors.email}
 *     testID="login-email" keyboardType="email-address" autoComplete="email" />
 *   <Field label="Note" description="Only you see this" isRequired multiline ... />
 *
 * What the adapter guarantees on top of the kit:
 * - `testID` lands on the INPUT, the node a test or Maestro flow types into. The input is
 *   named by `accessibilityLabel`, which defaults to the visible label (and, like every
 *   control, must not be blank: an error in development). Every other `TextInput` prop
 *   (`secureTextEntry`, `textContentType`, `autoComplete`, `autoCapitalize`,
 *   `keyboardType`, `returnKeyType`, `onSubmitEditing`, `maxLength`, `multiline`, the
 *   focus and blur handlers, ...) reaches the host input unchanged: the auth screens
 *   depend on it. `style` is not accepted, as before.
 * - An error is WORDS under the field, never colour alone (FR-025): the kit's FieldError
 *   shows the message while the field is invalid, announced as an `alert`, and the input
 *   carries `aria-invalid`. The kit's FieldError is a plain View around its text, and a
 *   role is not announced unless the View is itself an accessibility element, so it is
 *   made one (`accessible`): the message is then ONE alert element. The kit also turns the border and the label danger-coloured;
 *   that is reinforcement. `${testID}-error` names the message for a flow that asserts it.
 *   An empty string is no error.
 * - A `description` is helper text that stays under the error and stays neutral: the kit
 *   would colour a description danger while the field is invalid, so it is told it is not,
 *   and the one danger line is the error itself.
 * - `isRequired` shows the kit's asterisk (a glyph as well as a colour) and, because a
 *   glyph is not announced, gives the input the hint "Required" unless the caller supplies
 *   a hint of their own.
 * - `editable={false}` is the kit's disabled state: the label and input are dimmed and the
 *   input is not editable.
 * - The boundary (FR-024): the kit draws the field border in `border-field-border` at the
 *   width of `--field-border-width` (1 dp, which the generated theme sets), but its Android
 *   classes make that border TRANSPARENT until focus (`android:border-transparent`, a
 *   shadow stands in for it there). A shadow is not a 3:1 boundary, so on Android the
 *   field asks for `android:border-field-border` again. While invalid it does not: the
 *   kit's own `android:border-danger` must stay, and a later class from here would replace
 *   it. The focus indicator (an accent border on Android, an accent outline on iOS) is
 *   the kit's own.
 * - Largest text (FR-029): the input's minimum height is the kit's 48 dp, or the platform
 *   floor if larger, scaled by the font scale, so large text grows the field instead of
 *   clipping it, and it never goes below the floor when the text is made smaller. Font
 *   scaling is never capped. A multiline field starts at the top and has the kit
 *   TextArea's vertical padding; a caller's `textAlignVertical` wins.
 * - The field fill is `surface-secondary`: a soft chip must never sit on it (review
 *   rule 7), so none is drawn inside or over a field.
 *
 * Colours come from the kit's semantic classes; there is no literal here.
 */
import { Description, FieldError, Input, Label, TextField } from 'heroui-native';
import type { TextInputProps } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

import { assertAccessibleName } from './adapter-guards';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Conveyed by message text as well as colour (FR-025). Empty is no error. */
  error?: string;
  /** Helper text under the field and its error. */
  description?: string;
  /** Shows the kit's asterisk and tells a screen reader the field is required. */
  isRequired?: boolean;
};

/** The kit's Input minimum height in dp (`min-h-12`, 4 dp per step). */
const KIT_MIN_HEIGHT = 48;
const REQUIRED_HINT = 'Required';
/** See the header: the kit's Android classes hide the border, so it is asked for again. */
const ANDROID_BORDER = 'android:border-field-border';
/** The kit TextArea's vertical padding; the Input has none of its own. */
const MULTILINE_PADDING = 'py-2';

/**
 * The input's minimum height: the larger of the kit's and the platform floor, scaled by
 * the font scale and never below the unscaled value. Exported so the arithmetic is
 * asserted directly.
 */
export function fieldMinHeight(fontScale: number): number {
  return Math.max(KIT_MIN_HEIGHT, MinTouchTarget) * Math.max(1, fontScale);
}

function inputClasses(invalid: boolean, multiline: boolean | undefined): string {
  return [invalid ? '' : ANDROID_BORDER, multiline ? MULTILINE_PADDING : '']
    .filter(Boolean)
    .join(' ');
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  description,
  isRequired = false,
  accessibilityLabel,
  accessibilityHint,
  editable,
  multiline,
  testID,
  ...rest
}: FieldProps) {
  const name = accessibilityLabel ?? label;
  assertAccessibleName('Field', name);

  const { fontScale } = useAppearance();
  const invalid = Boolean(error);

  return (
    <TextField
      isInvalid={invalid}
      isDisabled={editable === false}
      isRequired={isRequired}>
      <Label>{label}</Label>
      <Input
        testID={testID}
        accessibilityLabel={name}
        accessibilityHint={accessibilityHint ?? (isRequired ? REQUIRED_HINT : undefined)}
        aria-invalid={invalid}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : undefined}
        className={inputClasses(invalid, multiline) || undefined}
        style={{ minHeight: fieldMinHeight(fontScale) }}
        {...rest}
      />
      <FieldError
        accessible
        accessibilityRole="alert"
        testID={testID && `${testID}-error`}>
        {error}
      </FieldError>
      {description ? <Description isInvalid={false}>{description}</Description> : null}
    </TextField>
  );
}
