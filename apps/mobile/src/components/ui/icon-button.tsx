/**
 * `IconButton` - the round glyph control of Sunrise Passport (feature 005, T519; contract
 * C5-15 "Icon buttons"; FR-006, FR-007, FR-026, FR-063, FR-069, FR-071). A 44 dp circle in
 * one of five looks:
 *
 *   <IconButton icon="share" accessibilityLabel="Share" onPress={share} />
 *   <IconButton icon="chevron-left" variant="glass" accessibilityLabel="Back" />
 *
 * - `default`: paper with `lift1`, an ink icon. `tonal`: cream with a hairline. `ghost`: no
 *   fill. `glass`: for a photograph, a `scrimButton` disc with its `scrimButtonLine` and an
 *   `onPhoto` icon (P11: 3:1 over a white photograph). `onSky`: 92 percent paper with
 *   `lift1`, over the globe.
 * - Named by `accessibilityLabel` alone (required: a type error, and an error in
 *   development when blank); the icon is decorative (`<testID>-icon`). `busy` and
 *   `disabled` are mutually exclusive: either makes it inert; a busy one is announced
 *   busy and unavailable and shows a spinner for the glyph; a disabled one is dimmed.
 * - The disc is 44 dp and does not scale with the text size (its icon does not), and the
 *   touch target is the platform floor: slop around the disc on Android (48 dp), none on iOS.
 * - Pressed (FR-019, FR-063): the `pressed` fill with an INK icon (only ink is gated on it),
 *   and the press scale (.97; none under reduced motion). A glass button keeps its disc and
 *   draws the focus ring instead: a light fill over a photograph would tint it, and white
 *   on `pressed` is unreadable (the `feedback="ring"` rule of `Tappable`, 004 T442).
 * - The focus ring is `focus-ring.ts`'s: 2.5 dp, 2 dp outside.
 *
 * The lift is `boxShadow` from the `Lift` token of the active theme (`liftOf`), with the
 * `elevation` fallback below Android 9. There is no literal here.
 */
import { Spinner } from 'heroui-native';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { cornerOf, pressScaleOf, withAlpha, type PaletteName } from '@/theme';

import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';
import { focusRingStyle, useFocusRing } from './focus-ring';
import { Icon, type IconName, type IconSize, type IconTone } from './icon';
import { liftStyle } from './lift-style';
import { useColors, type PaletteKey } from './theme-tokens';

export const ICON_BUTTON_VARIANTS = [
  'default',
  'tonal',
  'ghost',
  'glass',
  'onSky',
] as const;

export type IconButtonVariant = (typeof ICON_BUTTON_VARIANTS)[number];

export interface IconButtonState {
  pressed: boolean;
  busy: boolean;
  disabled: boolean;
}

export interface IconButtonLook {
  fill: PaletteKey | null;
  edge: PaletteKey | null;
  icon: IconTone;
  /** Whether the disc floats on `lift1`. */
  lift: boolean;
  /** The focus ring drawn for a held press (glass only). */
  ring: boolean;
}

const REST: Record<IconButtonVariant, IconButtonLook> = {
  default: { fill: 'surface', edge: null, icon: 'ink', lift: true, ring: false },
  tonal: {
    fill: 'surfaceSecondary',
    edge: 'hairline',
    icon: 'ink',
    lift: false,
    ring: false,
  },
  ghost: { fill: null, edge: null, icon: 'ink', lift: false, ring: false },
  glass: {
    fill: 'scrimButton',
    edge: 'scrimButtonLine',
    icon: 'onPhoto',
    lift: false,
    ring: false,
  },
  onSky: { fill: 'surface', edge: null, icon: 'ink', lift: true, ring: false },
};

/** Which keys a held press paints; the glass disc is not repainted, it is ringed. */
export function iconButtonLook(
  variant: IconButtonVariant,
  { pressed, busy, disabled }: IconButtonState,
): IconButtonLook {
  const rest = REST[variant];
  if (!pressed || busy || disabled) return rest;
  if (variant === 'glass') return { ...rest, ring: true };
  return { ...rest, fill: 'pressed' };
}

const DISC = 44;
const ICON: IconSize = 24;
/** The disc is 44 dp; the platform floor is reached with slop around it. */
const TARGET_SLOP = (MinTouchTarget - DISC) / 2;
const SLOP = {
  top: TARGET_SLOP,
  bottom: TARGET_SLOP,
  left: TARGET_SLOP,
  right: TARGET_SLOP,
} as const;
/** The opacity of paper over the globe (C5-15: 92 percent). */
const SKY_OPACITY = 0.92;
const TONAL_EDGE = 1;

const COLOR_KEYS = [
  'ink',
  'onPhoto',
  'surface',
  'surfaceSecondary',
  'pressed',
  'hairline',
  'scrimButton',
  'scrimButtonLine',
  'focus',
] as const;

export type IconButtonProps = {
  icon: IconName;
  /** Required: what a screen reader says. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: IconButtonVariant;
  /** An operation is in flight: presses are ignored, announced busy. */
  busy?: boolean;
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  onFocus?: PressableProps['onFocus'];
  onBlur?: PressableProps['onBlur'];
  hitSlop?: PressableProps['hitSlop'];
  testID?: string;
  /** Layout classes only (`absolute`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
};

interface StyleInput {
  variant: IconButtonVariant;
  look: IconButtonLook;
  colors: Record<(typeof COLOR_KEYS)[number], string>;
  theme: PaletteName;
  scale: number;
  focused: boolean;
}

function discStyle({
  variant,
  look,
  colors,
  theme,
  scale,
  focused,
}: StyleInput): ViewStyle {
  const fill =
    variant === 'onSky' && look.fill === 'surface'
      ? withAlpha(colors.surface, SKY_OPACITY)
      : look.fill
        ? colors[look.fill as keyof typeof colors]
        : undefined;
  return {
    width: DISC,
    height: DISC,
    alignItems: 'center',
    justifyContent: 'center',
    ...cornerOf('full'),
    ...(fill ? { backgroundColor: fill } : null),
    ...(look.edge
      ? { borderWidth: TONAL_EDGE, borderColor: colors[look.edge as keyof typeof colors] }
      : null),
    ...(look.lift ? liftStyle(theme) : null),
    ...(scale === 1 ? null : { transform: [{ scale }] }),
    ...(focused || look.ring ? focusRingStyle(colors.focus) : null),
  };
}

interface Disc {
  styleFor: (pressed: boolean) => ViewStyle;
  /** The ink of the glyph, for the spinner that replaces it. */
  inkColor: string;
}

/** The disc of a variant for a held or resting press, from the active theme. */
function useDisc(
  variant: IconButtonVariant,
  state: Omit<IconButtonState, 'pressed'>,
  focused: boolean,
): Disc {
  const { themeName, prefersLessMotion } = useAppearance();
  const colors = useColors(COLOR_KEYS);
  const inert = state.busy || state.disabled;
  return {
    inkColor: REST[variant].icon === 'onPhoto' ? colors.onPhoto : colors.ink,
    styleFor: (pressed) =>
      discStyle({
        variant,
        look: iconButtonLook(variant, { ...state, pressed }),
        colors,
        theme: themeName,
        scale: pressed && !inert ? pressScaleOf(prefersLessMotion) : 1,
        focused,
      }),
  };
}

interface BodyProps {
  busy: boolean;
  icon: IconName;
  variant: IconButtonVariant;
  inkColor: string;
  testID?: string;
}

/** The glyph, or the spinner that replaces it while busy. */
function IconButtonBody({ busy, icon, variant, inkColor, testID }: BodyProps) {
  if (busy) {
    return (
      <Spinner
        size="sm"
        color={inkColor}
        testID={testID ? `${testID}-spinner` : undefined}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }
  return (
    <Icon
      name={icon}
      size={ICON}
      tone={REST[variant].icon}
      testID={testID ? `${testID}-icon` : undefined}
    />
  );
}

export function IconButton({
  icon,
  accessibilityLabel,
  variant = 'default',
  busy = false,
  disabled = false,
  onPress,
  onFocus,
  onBlur,
  hitSlop,
  testID,
  className,
  style,
  ...rest
}: IconButtonProps) {
  assertAccessibleName('IconButton', accessibilityLabel);
  assertNotBusyAndDisabled('IconButton', busy, disabled);

  const focus = useFocusRing(onFocus, onBlur);
  const disc = useDisc(variant, { busy, disabled }, focus.focused);
  const inert = busy || disabled;
  const classes = [disabled ? 'opacity-disabled' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy, disabled: inert }}
      disabled={inert}
      onPress={inert ? undefined : onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hitSlop={hitSlop ?? SLOP}
      className={classes || undefined}
      testID={testID}
      style={({ pressed }) => [disc.styleFor(pressed), style]}
      {...rest}>
      <IconButtonBody
        busy={busy}
        icon={icon}
        variant={variant}
        inkColor={disc.inkColor}
        testID={testID}
      />
    </Pressable>
  );
}
