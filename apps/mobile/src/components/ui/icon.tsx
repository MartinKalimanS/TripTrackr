/**
 * `Icon` - the one icon vocabulary of Sunrise Passport (feature 005; contract C5-14;
 * research D5-07; FR-005, FR-030), over `phosphor-react-native` through the registry in
 * `icon-registry.ts` (feature 004 drew `expo-symbols`).
 *
 *   <Icon name="chevron-left" />                                   decorative
 *   <Icon name="calendar" size={16} tone="muted" label="Planning" />   meaningful
 *   <Icon name="globe" size={24} weight="fill" tone="ink" />       the selected tab
 *
 * - `name` is a registry key, an app word that one glyph answers to on BOTH platforms
 *   (`'chevron-left'`, `'cloud-upload'`). An unknown key, and the feature 004 form with one
 *   symbol per platform, are compile errors. Ionicons stay only for the Google and Apple
 *   brand glyphs (`brand-glyph.tsx`).
 * - `size` is 16, 20 or 24 dp (`IconSize`). Icons do not scale with the font scale: the
 *   control around one does (`Tappable`, `Button`).
 * - `weight` is `regular` (rest), `fill` (selected, status) or `duotone` (stat tiles).
 * - `tone` picks the ink by NAME from the palette (C5-3), resolved for the active theme
 *   with `useThemeColor`, so it follows the four themes live and the contrast themes need
 *   no promotion. There is no way to pass a colour. The feature 004 names stay as aliases
 *   until Phase 10, each on a token that passes: `accent` is `accentText` (coral as ink),
 *   never the coral fill, which is 2.82:1 on paper in `light` (D5-22, M-1).
 * - Decorative by default: the icon is hidden from assistive technology on both
 *   platforms, because the label or text beside it already says everything. Pass `label`
 *   only when the icon is the sole carrier of its meaning; it is then announced as an
 *   image with that name. The accessibility props live on a wrapper View, not on the
 *   glyph, and `testID` lands on that wrapper.
 * - A direction glyph (a chevron, an arrow: `DIRECTIONAL_ICONS`) mirrors itself when the
 *   layout direction is reversed; the others never do.
 */
import { useThemeColor, type ThemeColor } from 'heroui-native';
import { I18nManager, View } from 'react-native';

import { IconSize as IconSizes, type IconWeight } from '@/theme';

import { DIRECTIONAL_ICONS, ICONS, type IconKey } from './icon-registry';

export type IconName = IconKey;
export type IconSize = (typeof IconSizes)[keyof typeof IconSizes];
export type { IconWeight };
export type IconTone =
  | 'ink'
  | 'muted'
  | 'subtle'
  | 'onInk'
  | 'onPhoto'
  | 'accentInk'
  | 'accentText'
  | 'accentLine'
  | 'aquaInk'
  | 'aquaLine'
  | 'amberInk'
  | 'amberLine'
  | 'amber'
  | 'danger'
  | 'dangerInk'
  | 'success'
  // The feature 004 names, kept for the call sites that have not moved (Phase 10).
  | 'default'
  | 'accent'
  | 'onAccent'
  | 'pending';

export interface IconProps {
  name: IconName;
  /** Default 20. */
  size?: IconSize;
  /** Default `regular`. */
  weight?: IconWeight;
  /** Default `ink`. */
  tone?: IconTone;
  /** Makes the icon meaningful: announced as an image with this name. */
  label?: string;
  testID?: string;
}

/**
 * The app's own colours, declared beside the kit's in the generated stylesheet
 * (`--color-accent-text` and the others; `src/theme/generated/theme.css`). The kit's
 * `ThemeColor` type lists only ITS variables, but `useThemeColor` reads `--color-<name>`
 * for whatever it is given, so these resolve like any other and follow the four themes.
 */
type AppColor =
  | 'subtle'
  | 'on-ink'
  | 'on-photo'
  | 'accent-text'
  | 'accent-line'
  | 'aqua-ink'
  | 'aqua-line'
  | 'amber-ink'
  | 'amber-line'
  | 'amber';

const TONE_TOKENS: Record<IconTone, ThemeColor | AppColor> = {
  ink: 'foreground',
  muted: 'muted',
  subtle: 'subtle',
  onInk: 'on-ink',
  onPhoto: 'on-photo',
  accentInk: 'accent-foreground',
  accentText: 'accent-text',
  accentLine: 'accent-line',
  aquaInk: 'aqua-ink',
  aquaLine: 'aqua-line',
  amberInk: 'amber-ink',
  amberLine: 'amber-line',
  amber: 'amber',
  danger: 'danger',
  dangerInk: 'danger-foreground',
  success: 'success',
  default: 'foreground',
  accent: 'accent-text',
  onAccent: 'accent-foreground',
  pending: 'amber-ink',
};

const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

export function Icon({
  name,
  size = 20,
  weight = 'regular',
  tone = 'ink',
  label,
  testID,
}: IconProps) {
  const color = useThemeColor(TONE_TOKENS[tone] as ThemeColor);
  const Glyph = ICONS[name];
  const meaningful = label !== undefined && label.trim() !== '';
  return (
    <View
      testID={testID}
      {...(meaningful
        ? { accessible: true, accessibilityRole: 'image', accessibilityLabel: label }
        : DECORATIVE)}>
      <Glyph
        size={size}
        weight={weight}
        color={color}
        mirrored={I18nManager.isRTL && DIRECTIONAL_ICONS.has(name)}
      />
    </View>
  );
}
