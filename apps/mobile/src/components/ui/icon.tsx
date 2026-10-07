/**
 * `Icon` - the one icon vocabulary of Atlas (feature 004; contract C4-8; research D4-08;
 * FR-008, FR-030), over `expo-symbols`
 * (https://docs.expo.dev/versions/v57.0.0/sdk/symbols.md).
 *
 *   <Icon name={{ ios: 'chevron.left', android: 'chevron_left' }} />               decorative
 *   <Icon name={Planning} size={16} tone="muted" label="Planning" />               meaningful
 *
 * - `name` is ALWAYS both platforms: an SF Symbol for iOS and a Material symbol for
 *   Android. A bare string is an SF Symbol and renders on iOS only (v57 reference,
 *   "Cross-platform symbols"), which is how an icon goes missing on Android, so the type
 *   does not accept one. Both are the literal unions `expo-symbols` ships, so a typo is a
 *   compile error. Ionicons stay only for the Google and Apple brand glyphs.
 * - `size` is 16, 20 or 24 dp. Icons do not scale with the font scale: the control around
 *   one does (`Tappable`, `Button`).
 * - `tone` picks the ink by name (`default | muted | accent | danger | success |
 *   onAccent`, and `statusPlanning | statusActive | statusPast | pending` for the status
 *   and sync chips), resolved from the active theme with `useThemeColor`, so it follows
 *   the four themes live. There is no way to pass a colour.
 * - Decorative by default: the icon is hidden from assistive technology on both
 *   platforms, because the label or text beside it already says everything. Pass `label`
 *   only when the icon is the sole carrier of its meaning; it is then announced as an
 *   image with that name. The accessibility props live on a wrapper View, not on the
 *   symbol, because the Android `SymbolView` forwards only `style`. `testID` lands on
 *   that wrapper.
 */
import { useThemeColor, type ThemeColor } from 'heroui-native';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

export type IconName = { ios: SFSymbol; android: AndroidSymbol };
export type IconSize = 16 | 20 | 24;
export type IconTone =
  | 'default'
  | 'muted'
  | 'accent'
  | 'danger'
  | 'success'
  | 'onAccent'
  | 'statusPlanning'
  | 'statusActive'
  | 'statusPast'
  | 'pending';

export interface IconProps {
  name: IconName;
  /** Default 20. */
  size?: IconSize;
  /** Default `default`. */
  tone?: IconTone;
  /** Makes the icon meaningful: announced as an image with this name. */
  label?: string;
  testID?: string;
}

/**
 * The app's own colours, declared beside the kit's in the generated stylesheet
 * (`--color-status-*`, `--color-pending`; `src/theme/generated/theme.css`). The kit's
 * `ThemeColor` type lists only ITS variables, but `useThemeColor` reads `--color-<name>`
 * for whatever it is given, so these resolve like any other and follow the four themes.
 * Planning is the INK variant, the one the contrast gate measures as text (C4-3).
 */
type AppColor = 'status-planning-ink' | 'status-active' | 'status-past' | 'pending';

const TONE_TOKENS: Record<IconTone, ThemeColor | AppColor> = {
  default: 'foreground',
  muted: 'muted',
  accent: 'accent',
  danger: 'danger',
  success: 'success',
  onAccent: 'accent-foreground',
  statusPlanning: 'status-planning-ink',
  statusActive: 'status-active',
  statusPast: 'status-past',
  pending: 'pending',
};

const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function Icon({ name, size = 20, tone = 'default', label, testID }: IconProps) {
  const tintColor = useThemeColor(TONE_TOKENS[tone] as ThemeColor);
  const meaningful = label !== undefined && label.trim() !== '';
  return (
    <View
      testID={testID}
      {...(meaningful
        ? { accessible: true, accessibilityRole: 'image', accessibilityLabel: label }
        : DECORATIVE)}>
      <SymbolView name={name} size={size} tintColor={tintColor} />
    </View>
  );
}
