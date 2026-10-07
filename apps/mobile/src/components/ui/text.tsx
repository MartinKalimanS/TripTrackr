/**
 * `Text` - the one text primitive of Atlas (feature 004; FR-004, FR-023, FR-029;
 * contract C4-8; research D4-07).
 *
 * Screens that have migrated import `Text` from here and never write a font size, a
 * line height or a colour. `ThemedText` stays exactly as it is until phase 7: the
 * unmigrated screens keep using it, so the two coexist and neither wraps the other.
 *
 *   <Text type="largeTitle">Lisbon</Text>                        header, display face
 *   <Text type="body" tone="muted" numberOfLines={2}>...</Text>
 *   <Text type="numeric" context="largeTitle">1,204 km</Text>     tabular figures
 *
 * Roles (`type`) are the rows of `TextRoles` in `src/theme/typography.ts`; `tone` is the
 * ink. Both resolve to SEMANTIC classes of the generated theme (`text-foreground`,
 * `text-muted`, ...), so the four themes, including the increased-contrast ones, come
 * from the stylesheet and not from JavaScript: there is no muted-to-primary promotion
 * here, because `--muted` is already 7:1 in `light-contrast` and `dark-contrast`
 * (design-tokens C4-3). A size is an arbitrary VALUE (`text-[16px]`), never a colour, so
 * the lint rule against arbitrary colour classes does not apply. The strings are
 * literal on purpose: Tailwind finds a class by scanning the source, so it cannot be
 * assembled from the token at run time. `text.test.tsx` pins each one to its token.
 *
 * Accessibility: `largeTitle` and `title` are announced as headers (a caller's own
 * `accessibilityRole` wins). Text is never capped (`maxFontSizeMultiplier` is left to
 * the platform) because the largest text size must work (FR-029). On iOS each role asks
 * for its Dynamic Type ramp, so a caption does not grow as fast as a title. Everything
 * else (`accessibilityLabel`, `numberOfLines`, `selectable`, `testID`, ...) passes
 * straight to the kit's text.
 *
 * `numeric` is for money, distance, counts and dates: tabular figures through the style
 * (`fontVariant`), semibold, and `context` borrows the size of the role it sits in, so a
 * total in a hero is `context="largeTitle"` (and takes the display face with it).
 *
 * The display faces are `font-display` and `font-display-bold` (global.css). They carry
 * their own weight, so the display roles ask for no `font-*` weight class.
 */
import { Typography, type TypographyRootProps } from 'heroui-native';
import type { TextPropsIOS } from 'react-native';

import { textStyle, type TextRole } from '@/theme';

export type TextTone = 'default' | 'muted' | 'accent' | 'danger' | 'success' | 'onAccent';

/** The role whose size a `numeric` text borrows. */
export type NumericContext = Exclude<TextRole, 'numeric'>;

export type TextProps = Omit<
  TypographyRootProps,
  'type' | 'color' | 'weight' | 'truncate'
> & {
  /** The role in the type scale. Default `body`. */
  type?: TextRole;
  /** The ink. Default `default`. */
  tone?: TextTone;
  /** Only for `type="numeric"`: the role it sits in. Default `body`. */
  context?: NumericContext;
};

const SIZE_CLASSES: Record<NumericContext, string> = {
  largeTitle: 'text-[32px] leading-[38px]',
  title: 'text-[22px] leading-[28px]',
  headline: 'text-[17px] leading-[24px]',
  body: 'text-[16px] leading-[24px]',
  callout: 'text-[14px] leading-[20px]',
  caption: 'text-[12px] leading-[16px]',
};

const FACE_CLASSES: Record<TextRole, string> = {
  largeTitle: 'font-display-bold',
  title: 'font-display',
  headline: 'font-semibold',
  body: 'font-normal',
  callout: 'font-medium',
  caption: 'font-medium',
  numeric: 'font-semibold',
};

const TONE_CLASSES: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted',
  accent: 'text-accent',
  danger: 'text-danger',
  success: 'text-success',
  onAccent: 'text-accent-foreground',
};

const DYNAMIC_TYPE_RAMP: Record<TextRole, TextPropsIOS['dynamicTypeRamp']> = {
  largeTitle: 'largeTitle',
  title: 'title2',
  headline: 'headline',
  body: 'body',
  callout: 'callout',
  caption: 'caption1',
  numeric: 'body',
};

const HEADER_ROLES: readonly TextRole[] = ['largeTitle', 'title'];

/** Tabular figures, from the token so the role and its style cannot disagree. */
const TABULAR_NUMERALS = textStyle('numeric').fontVariant;

/** The classes of a role: size and line height, then the face, then the ink. */
export function textClasses(type: TextRole, tone: TextTone, context: NumericContext) {
  const sizeRole = type === 'numeric' ? context : type;
  const display = type === 'numeric' && (context === 'largeTitle' || context === 'title');
  const face = display ? FACE_CLASSES[context] : FACE_CLASSES[type];
  return `${SIZE_CLASSES[sizeRole]} ${face} ${TONE_CLASSES[tone]}`;
}

export function Text({
  type = 'body',
  tone = 'default',
  context = 'body',
  className,
  style,
  ...rest
}: TextProps) {
  const classes = textClasses(type, tone, context);
  return (
    <Typography
      accessibilityRole={HEADER_ROLES.includes(type) ? 'header' : undefined}
      dynamicTypeRamp={DYNAMIC_TYPE_RAMP[type]}
      className={className ? `${classes} ${className}` : classes}
      style={type === 'numeric' ? [{ fontVariant: TABULAR_NUMERALS }, style] : style}
      {...rest}
    />
  );
}
