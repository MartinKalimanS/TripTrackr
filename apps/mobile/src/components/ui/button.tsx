/**
 * `Button` - the labelled control of Atlas (feature 004; contract C4-7; FR-005, FR-019,
 * FR-020, FR-026, FR-029; review rules 2 and 5), over the kit's Button.
 *
 *   <Button variant="primary" accessibilityLabel="Save trip" busy={saving} onPress={save}>
 *     Save
 *   </Button>
 *   <Button variant="text" size="sm" icon={Add} accessibilityLabel="Add stop">Add</Button>
 *   <Button variant="secondary" iconOnly icon={Share} accessibilityLabel="Share" />
 *
 * Emphasis (FR-005) is the `variant`: `primary` (kit `primary`), `secondary` (kit
 * `secondary`, tonal), `text` (kit `ghost`) and `destructive` (kit `danger-soft`; the
 * confirmation action of a destructive flow is the kit's solid `danger`, to be added with
 * the first screen that needs it). A screen state shows at most ONE primary: a review
 * rule, asserted in screen tests where practical. `variant` defaults to `primary` only so
 * the common call stays short; choose it on purpose.
 *
 * What the adapter guarantees on top of the kit (research D4-02 items 4 and 6):
 * - `accessibilityLabel` is required (a type error, and an error in development when it
 *   is blank). The role is `button`. `testID` reaches the pressable node; the spinner and
 *   the icon get `<testID>-spinner` and `<testID>-icon`.
 * - `busy` and `disabled` are mutually exclusive (both throws in development). Either
 *   makes the button inert: the press is dropped, and no haptic plays. The kit has no
 *   busy state, so a busy button is announced `{ busy: true, disabled: true }`; it keeps
 *   its label (visible and announced) and swaps its icon for a spinner. A disabled one
 *   is announced unavailable and dimmed by the kit. A busy one is NOT dimmed: both go to
 *   the kit as `isDisabled` (React Native's Pressable replaces `accessibilityState.disabled`
 *   with its own `disabled` prop, so a kit-enabled button could not be announced
 *   unavailable), which makes the kit add `disabled:element-disabled` (50% opacity), and
 *   a busy button then adds `disabled:opacity-100` after it. The two classes set the same
 *   property at the same weight and Uniwind lets the later class win.
 * - Touch target (FR-026): the kit's heights are fixed (sm 40, md 48, lg 56 dp), so the
 *   adapter drops the fixed height (`h-auto`, with vertical padding) and asks for a
 *   MINIMUM instead: the larger of the kit height and `MinTouchTarget` (44 iOS, 48
 *   Android) scaled by the font scale. So `sm` is raised to the platform floor, and a
 *   label that wraps at the largest text size grows the button instead of clipping
 *   (FR-029). The label shrinks (`shrink`) so it wraps beside an icon. An icon-only
 *   button is a fixed square of the same floor: its icon does not scale with the text.
 * - Haptics (FR-020): a `primary` press plays `selection` and a `destructive` press plays
 *   `warning`, through `useHaptics()` (silent under reduced motion). Success feedback is
 *   the caller's, once the save has actually succeeded.
 * - Pressed state (FR-019, FR-022): the kit's press highlight is turned off. It overlays
 *   the variant's `-hover` colour, which for `destructive` is a 20% soft fill, and the
 *   gate guarantees readable text on 15% only (review rule 5). It also vanishes under
 *   `animation: 'disable-all'`, which would leave a reduced-motion traveller with no
 *   pressed state at all. Instead each variant swaps to a fixed fill at once with an
 *   `active:` class (`PRESSED_CLASS`): `accent-hover` for primary, `separator-secondary`
 *   (the surface pulled 15% toward the ink) for secondary and text, and a 5% danger tint
 *   for destructive (the soft fill drains; a deeper one cannot keep 7:1 under its label
 *   on an overlay in dark-contrast). Each is at least a 1.08:1 step from the resting
 *   fill on canvas, surface and overlay, and keeps its label at 4.5:1 (7:1 in the contrast
 *   themes) in all four themes: `test/theme/adapter-pressed-fills.test.ts` measures them.
 *   The kit's own 4% hover and the `surface-tertiary` fill were measured and rejected.
 *   The kit's scale animation stays: movement only, and the provider removes it for
 *   reduced motion. Its timing is the press budget (`Motion.pressMs`, 100 ms) in both
 *   directions, not the kit's 300 ms, so it is done within FR-022's 200 ms (T460).
 * - The icon is an `IconName`, drawn by `Icon` with the ink that reads on the variant's
 *   fill, so a caller cannot pick an unreadable one. It is decorative.
 *
 * UNVERIFIED ON A DEVICE until research D4-02 item 4 is ticked (two checks, listed
 * there): that `h-auto` really replaces the kit's fixed height, and that the `active:`
 * fills fire through the kit's Animated Pressable. Both rest on the kit's and Uniwind's
 * source (`test/ui-kit/button-class-merge.test.ts` pins what that source says) and on the
 * Jest stand-in, which renders no styles.
 *
 * Colours come from semantic classes and `useThemeColor`, never a literal.
 */
import {
  Button as KitButton,
  Spinner,
  useThemeColor,
  type ThemeColor,
} from 'heroui-native';
import {
  useWindowDimensions,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useHaptics, type Haptics } from '@/hooks/use-haptics';
import { Motion } from '@/theme';

import { assertAccessibleName, assertNotBusyAndDisabled } from './adapter-guards';
import { Icon, type IconName, type IconSize, type IconTone } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'destructive';
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
  /** Unavailable: dimmed, announced unavailable, presses are ignored. */
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  hitSlop?: PressableProps['hitSlop'];
  testID?: string;
  /** Layout classes only (`self-stretch`): never colour. */
  className?: string;
  style?: StyleProp<ViewStyle>;
};

const KIT_VARIANT = {
  primary: 'primary',
  secondary: 'secondary',
  text: 'ghost',
  destructive: 'danger-soft',
} as const;

/** The kit's fixed heights in dp (h-10, h-12, h-14 at 4 dp per step). */
const KIT_HEIGHT: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 };
const ICON_SIZE: Record<ButtonSize, IconSize> = { sm: 16, md: 20, lg: 24 };

/** The ink of the icon, matched to the kit's label colour on that variant's fill. */
const ICON_TONE: Record<ButtonVariant, IconTone> = {
  primary: 'onAccent',
  secondary: 'accent',
  text: 'default',
  destructive: 'danger',
};

/** The spinner takes the colour of the label it replaces the icon beside. */
const SPINNER_TOKEN: Record<ButtonVariant, ThemeColor> = {
  primary: 'accent-foreground',
  secondary: 'accent-soft-foreground',
  text: 'default-foreground',
  destructive: 'danger-soft-foreground',
};

/**
 * The discrete pressed fill (FR-019); see the header for why not the kit's highlight.
 * Exported so `test/theme/adapter-pressed-fills.test.ts` measures exactly these.
 */
export const PRESSED_CLASS: Record<ButtonVariant, string> = {
  primary: 'active:bg-accent-hover',
  secondary: 'active:bg-separator-secondary',
  text: 'active:bg-separator-secondary',
  destructive: 'active:bg-danger/5',
};

/** Cancels the kit's `disabled:element-disabled` (50% opacity) on a busy button. */
const BUSY_NOT_DIMMED = 'disabled:opacity-100';

const PRESS_HAPTIC: Partial<Record<ButtonVariant, keyof Haptics>> = {
  primary: 'selection',
  destructive: 'warning',
};

/**
 * The kit's press highlight off, scale kept (see the header), and the scale finished within
 * the press budget (FR-019, FR-022): the kit's own timing is 300 ms, which would leave the
 * movement it starts at touch-down running past the 200 ms of an in-place transition.
 * The easing stays the kit's (out, no overshoot); reduced motion removes the scale.
 */
const PRESS_FEEDBACK = {
  highlight: false,
  scale: { timingConfig: { duration: Motion.pressMs } },
} as const;

/**
 * The frame the kit's fixed height is replaced by. Exported so the arithmetic is
 * asserted directly: a label button has a MINIMUM height (the larger of the kit's and
 * the scaled platform floor, never below it when the text is made smaller) and an
 * icon-only button is a fixed square.
 */
export function buttonFrame(
  size: ButtonSize,
  iconOnly: boolean,
  fontScale: number,
): ViewStyle {
  if (iconOnly) {
    const side = Math.max(KIT_HEIGHT[size], MinTouchTarget);
    return { width: side, height: side };
  }
  return {
    minHeight: Math.max(KIT_HEIGHT[size], MinTouchTarget * Math.max(1, fontScale)),
    minWidth: MinTouchTarget,
  };
}

interface ClassOptions {
  variant: ButtonVariant;
  iconOnly: boolean;
  busy: boolean;
  className?: string;
}

function buttonClasses({ variant, iconOnly, busy, className }: ClassOptions) {
  const layout = iconOnly ? '' : 'h-auto py-2';
  return [layout, PRESSED_CLASS[variant], busy ? BUSY_NOT_DIMMED : '', className]
    .filter(Boolean)
    .join(' ');
}

interface LeadingProps {
  busy: boolean;
  icon?: IconName;
  variant: ButtonVariant;
  size: ButtonSize;
  testID?: string;
}

/** The busy indicator: the colour of the label it sits beside. */
function BusySpinner({ variant, testID }: { variant: ButtonVariant; testID?: string }) {
  const color = useThemeColor(SPINNER_TOKEN[variant]);
  return (
    <Spinner
      size="sm"
      color={color}
      testID={testID ? `${testID}-spinner` : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** The spinner while busy, else the icon, else nothing. */
function Leading({ busy, icon, variant, size, testID }: LeadingProps) {
  if (busy) return <BusySpinner variant={variant} testID={testID} />;
  if (!icon) return null;
  return (
    <Icon
      name={icon}
      size={ICON_SIZE[size]}
      tone={ICON_TONE[variant]}
      testID={testID ? `${testID}-icon` : undefined}
    />
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  accessibilityLabel,
  busy = false,
  disabled = false,
  icon,
  iconOnly = false,
  onPress,
  children,
  className,
  style,
  testID,
  ...rest
}: ButtonProps) {
  assertAccessibleName('Button', accessibilityLabel);
  assertNotBusyAndDisabled('Button', busy, disabled);

  const { fontScale } = useWindowDimensions();
  const haptics = useHaptics();
  const inert = busy || disabled;

  const handlePress = (event: GestureResponderEvent) => {
    const kind = PRESS_HAPTIC[variant];
    if (kind) haptics[kind]();
    onPress?.(event);
  };

  return (
    <KitButton
      variant={KIT_VARIANT[variant]}
      size={size}
      isIconOnly={iconOnly}
      isDisabled={inert}
      animation={PRESS_FEEDBACK}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy, disabled: inert }}
      onPress={inert ? undefined : handlePress}
      className={buttonClasses({ variant, iconOnly, busy, className })}
      style={[buttonFrame(size, iconOnly, fontScale), style]}
      testID={testID}
      {...rest}>
      <Leading busy={busy} icon={icon} variant={variant} size={size} testID={testID} />
      {iconOnly ? null : (
        <KitButton.Label className="shrink text-center">{children}</KitButton.Label>
      )}
    </KitButton>
  );
}
