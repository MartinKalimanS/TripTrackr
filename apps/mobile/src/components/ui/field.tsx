/**
 * `Field` - the labelled text input (feature 004; contract C4-8; FR-024, FR-025, FR-029,
 * FR-030; review rules 2, 3 and 7), in the Sunrise look of feature 005 (contract C5-17;
 * FR-069, FR-071), over the kit's TextField, Label, Input, FieldError and Description:
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
 * - The label sits above the input in the `label` role (DM Sans 600, 14 / 20) in the ink,
 *   also while the field is invalid: the words below carry the error.
 * - An error is WORDS and an icon under the field, never colour alone (FR-025): the kit's
 *   FieldError shows the message while the field is invalid, announced as an `alert`, and
 *   the input carries `aria-invalid` and a 1.5 dp `danger` boundary. A FieldError whose
 *   child is an element renders it as written (the kit's `childrenToString` answers null),
 *   so the alert holds a decorative alert icon and the message. The kit's FieldError is a
 *   plain View around its content, and a role is not announced unless the View is itself an
 *   accessibility element, so it is made one (`accessible`): the message is then ONE alert
 *   element. `${testID}-error` names it for a flow that asserts it. An empty string is no
 *   error.
 * - A `description` is helper text under the error with a leading info icon, in the muted
 *   13 / 18 body: the kit would colour a description danger while the field is invalid, so
 *   it is told it is not, and the one danger line is the error itself.
 * - `isRequired` shows the kit's asterisk (a glyph as well as a colour) and, because a
 *   glyph is not announced, gives the input the hint "Required" unless the caller supplies
 *   a hint of their own.
 * - `editable={false}` is the kit's disabled state: the label and input are dimmed and the
 *   input is not editable.
 * - The boundary (FR-069): the field is the cream `surfaceSecondary` fill with a 1 dp
 *   `border` (3:1, the kit's `--field-border`, which the generated theme sets to the
 *   palette's `border` at a width of 1 dp) and a 12 dp continuous corner. The kit's Android
 *   classes make that border TRANSPARENT until focus (`android:border-transparent`, a
 *   shadow stands in for it there), and a shadow is not a 3:1 boundary, so on Android the
 *   field asks for `android:border-field-border` again. While invalid it does not: the
 *   boundary is the danger one, set in the style.
 * - Focus (FR-071): while focused the input is the `surface` fill inside a 2.5 dp `focus`
 *   ring with a 2 dp gap (`FocusRing`), drawn as an outline so it takes no layout space. The
 *   adapter keeps the focus state itself and sets the outline in the style (width 0 at
 *   rest), so the kit's own `focus:` classes, which differ by platform, are not relied on;
 *   the caller's `onFocus` and `onBlur` run beside it.
 * - Largest text (FR-029): the input's minimum height is 56 dp (above the platform floor),
 *   scaled by the font scale, so large text grows the field instead of clipping, and it
 *   never goes below that when the text is made smaller. Font scaling is never capped. A
 *   multiline field starts at the top and has 12 dp of padding above and below; a caller's
 *   `textAlignVertical` wins. A multiline field that sets `numberOfLines` is at least that
 *   many lines of body text tall (scaled the same way): the prop is Android-only in React
 *   Native, and without a floor an iOS text area would open one line high.
 * - The field fill is `surface-secondary`: a soft chip must never sit on it (review
 *   rule 7), so none is drawn inside or over a field.
 *
 * Colours come from the kit's semantic classes and `useThemeColor`; there is no literal.
 */
import {
  Description,
  FieldError,
  Input,
  Label,
  TextField,
  useThemeColor,
} from 'heroui-native';
import { useState } from 'react';
import { View, type TextInputProps, type ViewStyle } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { FocusRing, TypeRoles, cornerOf } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { ALERT_ICON } from './alert-icon';
import { Icon, type IconName } from './icon';
import { Text, typeClasses } from './text';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Conveyed by message text and an icon as well as colour (FR-025). Empty is no error. */
  error?: string;
  /** Helper text under the field and its error. */
  description?: string;
  /** Shows the kit's asterisk and tells a screen reader the field is required. */
  isRequired?: boolean;
};

/** The Sunrise input is at least 56 dp tall. */
export const FIELD_MIN_HEIGHT = 56;
const REQUIRED_HINT = 'Required';
/** See the header: the kit's Android classes hide the border, so it is asked for again. */
const ANDROID_BORDER = 'android:border-field-border';
/** The kit TextArea's vertical padding is tightened to the prototype's 12 dp. */
const MULTILINE_PADDING = 'py-3';
/** `py-3` above and below the text, in dp: what a multiline field adds to its lines. */
const MULTILINE_PADDING_DP = 24;
/** The danger boundary of an invalid field, in dp. */
const INVALID_BORDER = 1.5;

/** The body role's line height (the accent role is the only one without a number). */
const BODY_LINE_HEIGHT = TypeRoles.body.lineHeight ?? 24;
const LABEL_CLASSES = typeClasses('label', 'default', true);
const HELPER_CLASSES = 'flex-1 text-[13px] leading-[18px] font-body text-muted';
const INFO: IconName = { ios: 'info.circle', android: 'info' };

/**
 * The input's minimum height: 56 dp, scaled by the font scale and never below the
 * unscaled value. A multiline field that asks for `lines` is at least that many lines of
 * body text (and its padding) tall, so it opens as a text area on iOS too, where
 * `numberOfLines` is not honoured. Exported so the arithmetic is asserted directly.
 */
export function fieldMinHeight(fontScale: number, lines?: number): number {
  const floor = Math.max(FIELD_MIN_HEIGHT, MinTouchTarget);
  const wanted = lines ? lines * BODY_LINE_HEIGHT + MULTILINE_PADDING_DP : 0;
  return Math.max(floor, wanted) * Math.max(1, fontScale);
}

function inputClasses(invalid: boolean, multiline: boolean | undefined): string {
  return [invalid ? '' : ANDROID_BORDER, multiline ? MULTILINE_PADDING : '']
    .filter(Boolean)
    .join(' ');
}

interface FieldColours {
  focus: string;
  surface: string;
  danger: string;
}

/** The ring (and its fill) while focused, no ring at rest, the danger boundary while invalid. */
function inputStyle(
  state: { focused: boolean; invalid: boolean; minHeight: number },
  { focus, surface, danger }: FieldColours,
): ViewStyle[] {
  const ring: ViewStyle = state.focused
    ? {
        backgroundColor: surface,
        outlineWidth: FocusRing.width,
        outlineOffset: FocusRing.offset,
        outlineColor: focus,
        outlineStyle: 'solid',
      }
    : { outlineWidth: 0 };
  const boundary: ViewStyle = state.invalid
    ? { borderColor: danger, borderWidth: INVALID_BORDER }
    : {};
  return [cornerOf('md'), { minHeight: state.minHeight }, ring, boundary];
}

function ErrorLine({ message }: { message?: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name={ALERT_ICON} size={16} tone="danger" />
      <Text variant="label" strong tone="danger" className="shrink">
        {message}
      </Text>
    </View>
  );
}

function HelperLine({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-1.5">
      <Icon name={INFO} size={16} tone="muted" />
      <Description isInvalid={false} className={HELPER_CLASSES}>
        {text}
      </Description>
    </View>
  );
}

type FieldInputProps = Omit<
  FieldProps,
  'label' | 'error' | 'description' | 'accessibilityLabel' | 'editable'
> & { name: string; invalid: boolean };

/** The input: the focus ring, the boundary and the size, around the caller's own props. */
function FieldInput({
  name,
  invalid,
  isRequired = false,
  accessibilityHint,
  multiline,
  numberOfLines,
  onFocus,
  onBlur,
  ...rest
}: FieldInputProps) {
  const { fontScale } = useAppearance();
  const [focused, setFocused] = useState(false);
  const colours = {
    focus: useThemeColor('focus'),
    surface: useThemeColor('surface'),
    danger: useThemeColor('danger'),
  };
  const minHeight = fieldMinHeight(fontScale, multiline ? numberOfLines : 0);

  return (
    <Input
      accessibilityLabel={name}
      accessibilityHint={accessibilityHint ?? (isRequired ? REQUIRED_HINT : undefined)}
      aria-invalid={invalid}
      multiline={multiline}
      numberOfLines={numberOfLines}
      textAlignVertical={multiline ? 'top' : undefined}
      className={inputClasses(invalid, multiline) || undefined}
      style={inputStyle({ focused, invalid, minHeight }, colours)}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...rest}
    />
  );
}

export function Field({
  label,
  error,
  description,
  accessibilityLabel,
  editable,
  ...input
}: FieldProps) {
  const name = accessibilityLabel ?? label;
  assertAccessibleName('Field', name);
  const invalid = Boolean(error);
  const { testID } = input;

  return (
    <TextField
      isInvalid={invalid}
      isDisabled={editable === false}
      isRequired={input.isRequired ?? false}>
      <Label>
        <Label.Text className={LABEL_CLASSES}>{label}</Label.Text>
      </Label>
      <FieldInput {...input} name={name} invalid={invalid} />
      <FieldError
        accessible
        accessibilityRole="alert"
        testID={testID && `${testID}-error`}>
        <ErrorLine message={error} />
      </FieldError>
      {description ? <HelperLine text={description} /> : null}
    </TextField>
  );
}
