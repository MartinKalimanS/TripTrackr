/**
 * `Text` - the one text primitive of the app (feature 004: FR-004, FR-023, FR-029, contract
 * C4-8, research D4-07; feature 005: FR-004, FR-074, contract C5-7, research D5-06).
 *
 * Screens import `Text` from here and never write a font size, a line height or a
 * colour.
 *
 *   <Text variant="display">Hello, <Text variant="accent">Marti</Text></Text>   Sunrise
 *   <Text variant="eyebrow" tone="muted">Portugal</Text>                        capped 1.3
 *   <Text variant="label" capped>Planning</Text>                                a chip label
 *   <Text type="largeTitle">Lisbon</Text>                                       004, until Phase 10
 *
 * Two role tables, two props. `variant` selects a Sunrise role (`TypeRoles` in
 * `src/theme/typography.ts`: display, numeral, title, headline, callout, body, label,
 * caption, eyebrow, accent). `type` selects a 004 role (`TextRoles`; `largeTitle`, `title`,
 * `headline`, `body`, `callout`, `caption`, `numeric`) and keeps resolving exactly as
 * before, so every existing call site and test is unchanged: five role names exist in both
 * tables with different sizes, and the 004 call sites are migrated screen by screen. A
 * `variant` wins when both are given. Phase 10 deletes `type`.
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
 * Accessibility: `largeTitle`, `title`, `display` and `headline` are announced as headers (a
 * caller's own `accessibilityRole` wins). On iOS each role asks for its Dynamic Type ramp,
 * so a caption does not grow as fast as a title. FR-029 says the largest text size must
 * work, so text is not capped (`maxFontSizeMultiplier` is left to the platform) EXCEPT the
 * chrome FR-074 names: the `numeral` and `eyebrow` roles always carry 1.3, and `callout`,
 * `label` and `caption` carry it when the call site says `capped` (tab labels, pills and
 * chips, the FAB label, the day chips). No other role is ever capped, whatever `capped` says.
 * Everything else (`accessibilityLabel`, `numberOfLines`, `selectable`, `testID`, ...) passes
 * straight to the kit's text.
 *
 * Tracking, upper case and tabular figures are style (`typeExtras`): `numeral` sets tabular
 * figures and is always Bricolage (DM Sans has no `tnum`). `strong` turns `body` and `label`
 * to the semibold face. `accent` is the serif italic word and carries NO size: it inherits
 * the size of the text it sits in, so it is drawn with the platform text rather than the
 * kit's, whose body preset would set one.
 *
 * `numeric` (004) is for money, distance, counts and dates: tabular figures through the
 * style (`fontVariant`), semibold, and `context` borrows the size of the role it sits in, so
 * a total in a hero is `context="largeTitle"` (and takes the display face with it).
 *
 * The faces are semantic classes (`font-display`, `font-display-bold`, `font-body`,
 * `font-body-semibold`, `font-body-bold`, `font-serif-italic`): Tailwind turns the
 * `--font-*` variables of the `@theme static` block in `src/global.css` into those
 * utilities, and `text.test.tsx` reads the stylesheet so a missing declaration fails the
 * build instead of leaving a role in the platform face. Each weight is its own family
 * (React Native has no variable weights for a custom font), so these roles ask for no
 * `font-*` weight class. The kit's text adds `font-normal` (weight 400) beside the family
 * and tailwind-merge keeps both (checked): that is expected to be harmless, and to even
 * help, because a requested weight of 400 leaves Android nothing to synthesise on top of
 * the already bold file. Whether the family loads and applies that way on both platforms is
 * the device check of research D4-07 (T408) and D5-06 (T507).
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
  textStyle,
  typeExtras,
  type TextRole,
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

/** The 004 role whose size a `numeric` text borrows. */
export type NumericContext = Exclude<TextRole, 'numeric'>;

export type TextProps = Omit<
  TypographyRootProps,
  'type' | 'color' | 'weight' | 'truncate'
> & {
  /** A Sunrise role (C5-7). Wins over `type` when both are given. */
  variant?: TypeRole;
  /** A 004 role, until Phase 10. Default `body`. */
  type?: TextRole;
  /** The ink. Default `default`. */
  tone?: TextTone;
  /** Only for `type="numeric"`: the role it sits in. Default `body`. */
  context?: NumericContext;
  /** Only for the `body` and `label` variants: the semibold face. */
  strong?: boolean;
  /**
   * Chrome that FR-074 caps at 1.3 times the text size: tab labels, pills and chips, stat
   * labels, the FAB label, the day chips. Only `callout`, `label` and `caption` honour it.
   */
  capped?: boolean;
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

/**
 * The iOS Dynamic Type ramp of a 004 role. A `numeric` text takes the ramp of the role it
 * sits in (its `context`, `body` by default), so a total in a hero grows like a large title.
 */
const DYNAMIC_TYPE_RAMP: Record<NumericContext, TextPropsIOS['dynamicTypeRamp']> = {
  largeTitle: 'largeTitle',
  title: 'title2',
  headline: 'headline',
  body: 'body',
  callout: 'callout',
  caption: 'caption1',
};

const HEADER_ROLES: readonly TextRole[] = ['largeTitle', 'title'];

/** Tabular figures, from the token so the role and its style cannot disagree. */
const TABULAR_NUMERALS = textStyle('numeric').fontVariant;

/** The classes of a 004 role: size and line height, then the face, then the ink. */
export function textClasses(type: TextRole, tone: TextTone, context: NumericContext) {
  const sizeRole = type === 'numeric' ? context : type;
  const display = type === 'numeric' && (context === 'largeTitle' || context === 'title');
  const face = display ? FACE_CLASSES[context] : FACE_CLASSES[type];
  return `${SIZE_CLASSES[sizeRole]} ${face} ${TONE_CLASSES[tone]}`;
}

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

/** A Sunrise text: the kit's text, or the platform's for the size-less accent word. */
function SunriseText({
  variant,
  tone,
  strong,
  capped,
  className,
  style,
  ...rest
}: Omit<TextProps, 'type' | 'context' | 'variant'> &
  Required<Pick<TextProps, 'variant' | 'tone' | 'strong' | 'capped'>>) {
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

export function Text({
  type = 'body',
  variant,
  tone = 'default',
  context = 'body',
  strong = false,
  capped = false,
  className,
  style,
  ...rest
}: TextProps) {
  if (variant !== undefined) {
    return (
      <SunriseText
        variant={variant}
        tone={tone}
        strong={strong}
        capped={capped}
        className={className}
        style={style}
        {...rest}
      />
    );
  }
  const classes = textClasses(type, tone, context);
  return (
    <Typography
      accessibilityRole={HEADER_ROLES.includes(type) ? 'header' : undefined}
      dynamicTypeRamp={DYNAMIC_TYPE_RAMP[type === 'numeric' ? context : type]}
      className={className ? `${classes} ${className}` : classes}
      style={type === 'numeric' ? [{ fontVariant: TABULAR_NUMERALS }, style] : style}
      {...rest}
    />
  );
}
