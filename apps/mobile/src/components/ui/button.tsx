/**
 * `Button` - the labelled control of Sunrise Passport (feature 005; contract C5-15;
 * FR-006, FR-019, FR-020, FR-026, FR-029, FR-063, FR-069, FR-071; research D5-14; review
 * rules 2, 5, 6 and 7). Feature 004 wrapped the kit's Button; the five Sunrise variants,
 * the primary's edge ring and the pressed fills are not the kit's, so the adapter is a
 * React Native `Pressable` painted from tokens (`button-look.ts` decides which keys).
 *
 *   <Button variant="primary" accessibilityLabel="Save trip" busy={saving} onPress={save}>
 *     Save
 *   </Button>
 *   <Button variant="text" size="sm" icon="plus" accessibilityLabel="Add stop">Add</Button>
 *   <Button variant="secondary" iconOnly icon="share" accessibilityLabel="Share" />
 *
 * Emphasis (FR-006) is the `variant`: `primary` (coral, navy label, the edge ring that
 * carries the 3:1 the coral fill lacks), `secondary` (a 1.5 dp ink outline), `tonal` (cream
 * with a hairline), `text` (no fill; the contract's `ghost`) and `destructive` (danger ink
 * on its tint, always an icon and a verb at the call site). A screen state shows at most ONE
 * primary: a review rule. `variant` defaults to `primary` so the common call stays short.
 *
 * What the adapter guarantees (inherited from C4-7, restated in C5-15):
 * - `accessibilityLabel` is required (a type error, and an error in development when it is
 *   blank). The role is `button`; `testID` reaches the pressable; the spinner and the icon
 *   get `<testID>-spinner` and `<testID>-icon`.
 * - `busy` and `disabled` are mutually exclusive (both throws in development). Either makes
 *   the button inert: the press is dropped, no haptic plays and no press shows. A busy
 *   button is announced `{ busy: true, disabled: true }`, keeps its label and swaps its icon
 *   for a spinner; it is not dimmed. A disabled one is announced unavailable and drawn flat.
 * - Touch target (FR-026): a MINIMUM height, never a fixed one: the larger of the size
 *   (`sm` 44, `md` 52, `lg` 56 dp) and the platform floor (44 iOS, 48 Android) scaled by the
 *   font scale, so a label that wraps at the largest text size grows the button. An
 *   icon-only button is a fixed square of the same floor: its icon does not scale.
 * - Pressed (FR-019, FR-063): the fill swaps at once, with no transition, and the button
 *   scales to .97 (`pressScaleOf`; the fill alone under reduced motion). Only ink text is
 *   ever placed on a pressed fill: `buttonLook` is the table, `adapter-pressed-fills` the
 *   measurement in all four themes.
 * - The focus ring is 2.5 dp, drawn 2 dp outside the control (`focus-ring.ts`).
 * - Haptics (FR-020): a `primary` press plays `selection` (the light impact of D5-14 once
 *   `useHaptics` grows `impact`; one line, `PRESS_HAPTIC`) and a `destructive` press
 *   `warning`, silent under reduced motion. Success is the caller's, once the save worked.
 * - The icon is an `IconName`, decorative, in the ink of the label it sits beside.
 * - The host node carries the emphasis, the size and the icon-only flag as marks (`EMPHASIS`),
 *   which the screen suites read to count a screen state's primaries (review rule 2).
 *
 * The font scale comes from `useFontScale` (the window's) and the two accessibility flags from
 * the shared store (`useAccessibilityFlags`), never from `useAppearance`, so a button repeated
 * down a list adds no colour-scheme subscription of its own. The colours are asked of the
 * kit once, by palette key (`useColors`). There is no literal here.
 */
import { Spinner } from 'heroui-native';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useFontScale } from '@/hooks/use-font-scale';
import { useHaptics, type Haptics } from '@/hooks/use-haptics';
import { Space, cornerOf, pressScaleOf } from '@/theme';

import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';
import {
  buttonEdgeWidth,
  buttonLook,
  type ButtonLabelKey,
  type ButtonLook,
  type ButtonVariant,
} from './button-look';
import { focusRingStyle, useFocusRing } from './focus-ring';
import { Icon, type IconName, type IconSize } from './icon';
import { Text, type TextTone } from './text';
import { useColors } from './theme-tokens';

export type { ButtonVariant } from './button-look';
export type ButtonSize = 'md' | 'lg' | 'sm';

type ButtonContent =
  | { iconOnly: true; icon: IconName; children?: undefined }
  | { iconOnly?: false; icon?: IconName; children: string };

export type ButtonProps = ButtonContent & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required: what a screen reader says. Usually the visible label, or more. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** An operation is in flight: presses are ignored, announced busy. */
  busy?: boolean;
  /** Unavailable: drawn flat, announced unavailable, presses are ignored. */
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  onFocus?: PressableProps['onFocus'];
  onBlur?: PressableProps['onBlur'];
  hitSlop?: PressableProps['hitSlop'];
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
};

/** The minimum height of each size, in dp (C5-15): 52 / 56 / 44. */
const SIZE_MIN: Record<ButtonSize, number> = { sm: 44, md: 52, lg: 56 };
const ICON_SIZE: Record<ButtonSize, IconSize> = { sm: 16, md: 20, lg: 24 };

/** The `Text` ink of each label key. */
const LABEL_TONE: Record<ButtonLabelKey, TextTone> = {
  ink: 'default',
  accentInk: 'onAccent',
  danger: 'danger',
  subtle: 'subtle',
};

/**
 * The emphasis marked on the host node, under the names the kit's Button had in feature
 * 004 (`ghost` is `text`, `danger-soft` is `destructive`; `tertiary` is `tonal`). The
 * screen suites count a screen state's primaries by reading it back
 * (`button.props.variant === 'primary'`, review rule 2), and a size and the icon-only flag
 * with it; the marks keep those suites unchanged. Native ignores props a view does not know.
 */
const EMPHASIS: Record<ButtonVariant, string> = {
  primary: 'primary',
  secondary: 'secondary',
  tonal: 'tertiary',
  text: 'ghost',
  destructive: 'danger-soft',
};

const PRESS_HAPTIC: Partial<Record<ButtonVariant, keyof Haptics>> = {
  primary: 'selection',
  destructive: 'warning',
};

/** Every palette key a button can paint with, asked of the kit in one call. */
const COLOR_KEYS = [
  'accent',
  'accentPress',
  'accentInk',
  'accentLine',
  'sand',
  'surfaceSecondary',
  'pressed',
  'dangerTint',
  'danger',
  'ink',
  'subtle',
  'hairline',
  'border',
  'focus',
] as const;

/**
 * The frame: a label button has a MINIMUM height (the larger of its size and the scaled
 * platform floor, never below it when the text is made smaller) and an icon-only button is
 * a fixed square. Exported so the arithmetic is asserted directly.
 */
export function buttonFrame(
  size: ButtonSize,
  iconOnly: boolean,
  fontScale: number,
): ViewStyle {
  if (iconOnly) {
    const side = Math.max(SIZE_MIN[size], MinTouchTarget);
    return { width: side, height: side };
  }
  return {
    minHeight: Math.max(SIZE_MIN[size], MinTouchTarget * Math.max(1, fontScale)),
    minWidth: MinTouchTarget,
  };
}

function paddingOf(size: ButtonSize, variant: ButtonVariant): ViewStyle {
  if (variant === 'text') {
    return { paddingHorizontal: Space[3], paddingVertical: Space[2] };
  }
  if (size === 'sm') return { paddingHorizontal: Space[4], paddingVertical: Space[2] };
  return { paddingHorizontal: Space[6], paddingVertical: Space[3] };
}

export interface ButtonStyleInput {
  frame: ViewStyle;
  iconOnly: boolean;
  size: ButtonSize;
  variant: ButtonVariant;
  fill?: string;
  edge?: string;
  edgeWidth: number;
  /** 1 for none; `pressScaleOf` while held. */
  scale: number;
  focusColor: string;
  focused: boolean;
}

/** What the host node carries now. Exported so the mapping is asserted directly. */
export function buttonStyle(input: ButtonStyleInput): ViewStyle {
  const { frame, iconOnly, size, variant, fill, edge, edgeWidth, scale } = input;
  return {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space[2],
    ...frame,
    ...(iconOnly ? null : paddingOf(size, variant)),
    ...cornerOf('full'),
    borderWidth: edgeWidth,
    // A zero-width edge draws nothing; a coloured edge that is absent keeps its width, so
    // the disabled and pressed states move no pixel.
    borderColor: edge ?? 'transparent',
    ...(fill ? { backgroundColor: fill } : null),
    ...(scale === 1 ? null : { transform: [{ scale }] }),
    ...(input.focused ? focusRingStyle(input.focusColor) : null),
  };
}

interface LeadingProps {
  busy: boolean;
  icon?: IconName;
  look: ButtonLook;
  size: ButtonSize;
  spinnerColor: string;
  testID?: string;
}

/** The spinner while busy, else the icon, else nothing. */
function Leading({ busy, icon, look, size, spinnerColor, testID }: LeadingProps) {
  if (busy) {
    return (
      <Spinner
        size="sm"
        color={spinnerColor}
        testID={testID ? `${testID}-spinner` : undefined}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  if (!icon) return null;
  return (
    <Icon
      name={icon}
      size={ICON_SIZE[size]}
      tone={look.label}
      testID={testID ? `${testID}-icon` : undefined}
    />
  );
}

/** The marks of `EMPHASIS`: spread onto the pressable. */
function emphasisMarks(
  variant: ButtonVariant,
  size: ButtonSize,
  iconOnly: boolean,
): object {
  return { variant: EMPHASIS[variant], size, isIconOnly: iconOnly };
}

interface Surface {
  lookFor: (pressed: boolean) => ButtonLook;
  styleFor: (pressed: boolean) => ViewStyle;
  colors: Record<(typeof COLOR_KEYS)[number], string>;
}

interface SurfaceInput {
  variant: ButtonVariant;
  size: ButtonSize;
  iconOnly: boolean;
  busy: boolean;
  disabled: boolean;
  focused: boolean;
}

/** Look and style of a button for a held or resting press, from the active theme. */
function useButtonSurface(input: SurfaceInput): Surface {
  const { variant, size, iconOnly, busy, disabled, focused } = input;
  const fontScale = useFontScale();
  const { prefersMoreContrast, prefersLessMotion } = useAccessibilityFlags();
  const colors = useColors(COLOR_KEYS);
  const inert = busy || disabled;

  const lookFor = (pressed: boolean) =>
    buttonLook(variant, { pressed: pressed && !inert, busy, disabled });
  const styleFor = (pressed: boolean): ViewStyle => {
    const look = lookFor(pressed);
    return buttonStyle({
      frame: buttonFrame(size, iconOnly, fontScale),
      iconOnly,
      size,
      variant,
      fill: look.fill ? colors[look.fill as keyof typeof colors] : undefined,
      edge: look.edge ? colors[look.edge as keyof typeof colors] : undefined,
      edgeWidth: buttonEdgeWidth(variant, prefersMoreContrast),
      scale: pressed && !inert ? pressScaleOf(prefersLessMotion) : 1,
      focusColor: colors.focus,
      focused,
    });
  };
  return { lookFor, styleFor, colors };
}

/** The press of a button: its haptic first (by variant), then the caller's handler. */
function usePressHandler(variant: ButtonVariant, onPress: ButtonProps['onPress']) {
  const haptics = useHaptics();
  return (event: GestureResponderEvent) => {
    const kind = PRESS_HAPTIC[variant];
    if (kind) haptics[kind]();
    onPress?.(event);
  };
}

export function Button(props: ButtonProps) {
  assertAccessibleName('Button', props.accessibilityLabel);
  assertNotBusyAndDisabled('Button', props.busy, props.disabled);
  return <ButtonControl {...props} />;
}

function ButtonControl({
  variant = 'primary',
  size = 'md',
  busy = false,
  disabled = false,
  icon,
  iconOnly = false,
  onPress,
  onFocus,
  onBlur,
  children,
  style,
  testID,
  ...rest
}: ButtonProps) {
  const press = usePressHandler(variant, onPress);
  const focus = useFocusRing(onFocus, onBlur);
  const shape = { variant, size, iconOnly, busy, disabled };
  const surface = useButtonSurface({ ...shape, focused: focus.focused });
  const inert = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: inert }}
      disabled={inert}
      onPress={inert ? undefined : press}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      testID={testID}
      style={({ pressed }) => [surface.styleFor(pressed), style]}
      {...emphasisMarks(variant, size, iconOnly)}
      {...rest}>
      {({ pressed }) => (
        <ButtonBody
          surface={surface}
          pressed={pressed}
          busy={busy}
          icon={icon}
          iconOnly={iconOnly}
          size={size}
          testID={testID}>
          {children}
        </ButtonBody>
      )}
    </Pressable>
  );
}

interface BodyProps {
  surface: Surface;
  pressed: boolean;
  busy: boolean;
  icon?: IconName;
  iconOnly: boolean;
  size: ButtonSize;
  testID?: string;
  children?: string;
}

function ButtonBody({ surface, pressed, iconOnly, size, children, ...rest }: BodyProps) {
  const look = surface.lookFor(pressed);
  return (
    <>
      <Leading
        size={size}
        look={look}
        spinnerColor={surface.colors[look.label]}
        {...rest}
      />
      {iconOnly ? null : (
        <Text
          variant={size === 'sm' ? 'label' : 'callout'}
          strong={size === 'sm'}
          tone={LABEL_TONE[look.label]}
          className="shrink text-center">
          {children}
        </Text>
      )}
    </>
  );
}
