/**
 * `Text` - the one text primitive of the app (feature 004: FR-004, FR-023, FR-029, contract
 * C4-8, research D4-07; feature 005: FR-004, FR-074, contract C5-7, research D5-06).
 *
 * Screens import `Text` from here and never write a font size, a line height or a
 * colour.
 *
 *   <Text variant="display">Hello, <Text variant="accent">Marti</Text></Text>
 *   <Text variant="eyebrow" tone="muted">Portugal</Text>                        capped 1.3
 *   <Text variant="label" capped>Planning</Text>                                a chip label
 *   <Text>Running text</Text>                                                   variant "body"
 *
 * `variant` selects a role of `TypeRoles` in `src/theme/typography.ts`: display, numeral,
 * title, headline, callout, body, label, caption, eyebrow, accent. The 004 `type` and
 * `context` props and their table were deleted by T564.
 *
 * `tone` is the ink and resolves to SEMANTIC classes of the generated theme
 * (`text-foreground`, `text-muted`, ...), so the four themes, including the
 * increased-contrast ones, come from the stylesheet and not from JavaScript. Coral as TEXT
 * is `accentText`: the coral fill is 2.82:1 on white, so `tone="accent"` is `text-accent-text`.
 * A size is an arbitrary VALUE (`text-[16px]`), never a colour, so the lint rule against
 * arbitrary colour classes does not apply. The strings are literal on purpose: Tailwind
 * finds a class by scanning the source, so it cannot be assembled from the token at run
 * time. `text.test.tsx` pins each one to its token.
 *
 * Accessibility: `display`, `title` and `headline` are announced as headers (a caller's own
 * `accessibilityRole` wins). On iOS each role asks for its Dynamic Type ramp, so a caption
 * does not grow as fast as a title. FR-029 says the largest text size must work, so text is
 * not capped (`maxFontSizeMultiplier` is left to the platform) EXCEPT the chrome FR-074
 * names: the `numeral` and `eyebrow` roles always carry 1.3, and `callout`, `label` and
 * `caption` carry it when the call site says `capped` (tab labels, pills and chips, the FAB
 * label, the day chips). No other role is ever capped, whatever `capped` says. Everything
 * else (`accessibilityLabel`, `numberOfLines`, `selectable`, `testID`, ...) passes straight to
 * the kit's text.
 *
 * Tracking, upper case and tabular figures are style (`typeExtras`): `numeral` sets tabular
 * figures and is always Bricolage (DM Sans has no `tnum`, so a body or label figure does not
 * align in columns). `strong` turns `body` and `label` to the semibold face. `accent` is the
 * serif italic word and carries NO size: it inherits the size of the text it sits in, so it is
 * drawn with the platform text rather than the kit's, whose body preset would set one.
 *
 * The faces are semantic classes (`font-display`, `font-display-bold`, `font-body`,
 * `font-body-semibold`, `font-body-bold`, `font-serif-italic`): Tailwind turns the
 * `--font-*` variables of the `@theme static` block in `src/global.css` into those
 * utilities, and `text.test.tsx` reads the stylesheet so a missing declaration fails the
 * build instead of leaving a role in the platform face. Each weight is its own family
 * (React Native has no variable weights for a custom font), so these roles ask for no
 * `font-*` weight class. Whether the family loads and applies that way on both platforms is
 * the device check of research D5-06 (T507).
 */
import { Typography, type TypographyRootProps } from 'heroui-native';
import {
  Text as NativeText,
  type TextPropsIOS,
  type TextProps as NativeTextProps,
} from 'react-native';

import {
  TypeRoles,
  fontClassOf,
  maxFontScaleOf,
  typeExtras,
  type TypeRole,
} from '@/theme';

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'accent'
  | 'aqua'
  | 'amber'
  | 'danger'
  | 'success'
  | 'onAccent'
  | 'onInk'
  | 'onPhoto';

export type TextProps = Omit<
  TypographyRootProps,
  'type' | 'color' | 'weight' | 'truncate'
> & {
  /** A role of the type scale (C5-7). Default `body`. */
  variant?: TypeRole;
  /** The ink. Default `default`. */
  tone?: TextTone;
  /** Only for the `body` and `label` variants: the semibold face. */
  strong?: boolean;
  /**
   * Chrome that FR-074 caps at 1.3 times the text size: tab labels, pills and chips, stat
   * labels, the FAB label, the day chips. Only `callout`, `label` and `caption` honour it.
   */
  capped?: boolean;
};

const TONE_CLASSES: Record<TextTone, string> = {
  default: 'text-foreground',
  muted: 'text-muted',
  subtle: 'text-subtle',
  accent: 'text-accent-text',
  aqua: 'text-aqua-ink',
  amber: 'text-amber-ink',
  danger: 'text-danger',
  success: 'text-success',
  onAccent: 'text-accent-foreground',
  onInk: 'text-on-ink',
  onPhoto: 'text-on-photo',
};

/** Size and line height of a Sunrise role (the accent has none: it inherits). */
const TYPE_SIZE_CLASSES: Record<Exclude<TypeRole, 'accent'>, string> = {
  display: 'text-[40px] leading-[44px]',
  numeral: 'text-[36px] leading-[40px]',
  title: 'text-[28px] leading-[32px]',
  headline: 'text-[22px] leading-[28px]',
  callout: 'text-[17px] leading-[22px]',
  body: 'text-[16px] leading-[24px]',
  label: 'text-[14px] leading-[20px]',
  caption: 'text-[13px] leading-[18px]',
  eyebrow: 'text-[12px] leading-[16px]',
};

/** The iOS Dynamic Type ramp of a Sunrise role: the nearest text style by size. */
const TYPE_DYNAMIC_TYPE_RAMP: Record<
  Exclude<TypeRole, 'accent'>,
  TextPropsIOS['dynamicTypeRamp']
> = {
  display: 'largeTitle',
  numeral: 'title1',
  title: 'title1',
  headline: 'title2',
  callout: 'headline',
  body: 'body',
  label: 'subheadline',
  caption: 'footnote',
  eyebrow: 'caption1',
};

const TYPE_HEADER_ROLES: readonly TypeRole[] = ['display', 'title', 'headline'];

/** The roles with a semibold sibling in the same family, for `strong`. */
const STRONG_ROLES: readonly TypeRole[] = ['body', 'label'];

/** The classes of a Sunrise role: size and line height, then the face, then the ink. */
export function typeClasses(variant: TypeRole, tone: TextTone, strong: boolean) {
  const { family, weight } = TypeRoles[variant];
  const face =
    strong && STRONG_ROLES.includes(variant)
      ? fontClassOf('body', 600)
      : fontClassOf(family, weight);
  const size = variant === 'accent' ? '' : `${TYPE_SIZE_CLASSES[variant]} `;
  return `${size}${face} ${TONE_CLASSES[tone]}`;
}

export function Text({
  variant = 'body',
  tone = 'default',
  strong = false,
  capped = false,
  className,
  style,
  ...rest
}: TextProps) {
  const classes = typeClasses(variant, tone, strong);
  const merged = className ? `${classes} ${className}` : classes;
  const extras = typeExtras(variant);
  if (variant === 'accent') {
    return (
      <NativeText
        className={merged}
        style={[extras, style]}
        {...(rest as NativeTextProps)}
      />
    );
  }
  return (
    <Typography
      accessibilityRole={TYPE_HEADER_ROLES.includes(variant) ? 'header' : undefined}
      dynamicTypeRamp={TYPE_DYNAMIC_TYPE_RAMP[variant]}
      maxFontSizeMultiplier={maxFontScaleOf(variant, capped)}
      className={merged}
      style={[extras, style]}
      {...rest}
    />
  );
}
