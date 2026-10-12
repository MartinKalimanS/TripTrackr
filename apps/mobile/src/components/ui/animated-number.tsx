/**
 * `AnimatedNumber` - a figure that counts up once (feature 005; FR-060, FR-074, FR-076,
 * FR-077; contract C5-30; research D5-11).
 *
 *   <AnimatedNumber value={14} testID="globe-stat-countries" />                 the numeral role
 *   <AnimatedNumber value={61480} format={{ maximumFractionDigits: 0 }} delay={Motion.countUpStaggerMs} />
 *   <AnimatedNumber value={14} accessibilityLabel="14 of 195 countries" />
 *
 * It counts from 0 to `value` once per appearance in `Motion.countUpMs` (700 ms), eased out, and
 * on a new `value` counts on from the figure last drawn. Under reduced motion the final text is
 * there on the first render, in a single text, with no timer (FR-073). The engine is `count-up.ts`
 * (a small interval driven by the clock; why not a Reanimated value is written there); the digits
 * are an ordinary `Text`, never a `TextInput`.
 *
 * - **Assistive technology hears the final value, once.** The label is the final formatted
 *   value ("12,346") from the very first render, whatever frame is drawn, and the figure is not
 *   a live region, so a reader never says "3, 17, 42". `accessibilityLabel` replaces it where a
 *   tile has better words ("14 of 195 countries").
 * - **The box does not move.** While it counts, the figure lies over an invisible copy of the
 *   FINAL text, which sizes the box (hidden from assistive technology, so it is not read as
 *   well); `containerStyle` lays that box out and every text style you give applies to both,
 *   `textAlign` included. Tabular figures in a display face (Bricolage, which has `tnum`; DM Sans
 *   has none), so the digits do not jitter either: the roles on offer are the display ones.
 * - **Figures follow the device** (FR-077): `Intl.NumberFormat` with the device locale, or `locale`.
 *   A whole number grouped ("12,346", "12.346") unless `format` asks for more; compact notation
 *   (`notation: 'compact'`, "1.26M") is the caller's choice and Hermes support for it is a
 *   device check. For non-negative figures.
 * - The `numeral` role is capped at 1.3 times the text size (FR-074); other text props
 *   (`numberOfLines`, `adjustsFontSizeToFit`, `tone`, `className`) go to both texts.
 *
 * `testID` is the visible figure (so a test reads the number that is drawn), the keeper is
 * `<testID>-width` and the box `<testID>-container`. A test that wants the final text at once
 * asks for reduced motion (`prefersLessMotion`) or drives the clock.
 */
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';
import { Motion } from '@/theme';

import { formatFigure, useCountUp } from './count-up';
import { Text, type TextProps } from './text';

/** The roles in a display face: the ones with tabular figures. */
export type AnimatedNumberVariant =
  'numeral' | 'display' | 'title' | 'headline' | 'callout';

export interface AnimatedNumberProps extends Omit<
  TextProps,
  'children' | 'variant' | 'type' | 'context'
> {
  value: number;
  /** `Intl.NumberFormat` options; a whole number by default. */
  format?: Intl.NumberFormatOptions;
  /** A BCP 47 tag; the device's by default. */
  locale?: string;
  /** Wait this long before counting (the 80 ms stagger of three figures). Default 0. */
  delay?: number;
  /** Default `Motion.countUpMs`. */
  duration?: number;
  /** Default `numeral`. */
  variant?: AnimatedNumberVariant;
  /** The box that holds the keeper and the figure. */
  containerStyle?: StyleProp<ViewStyle>;
}

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const KEEPER: TextStyle = { opacity: 0 };

export function AnimatedNumber({
  value,
  format,
  locale,
  delay = 0,
  duration = Motion.countUpMs,
  variant = 'numeral',
  containerStyle,
  style,
  accessibilityLabel,
  testID,
  ...rest
}: AnimatedNumberProps) {
  const { prefersLessMotion } = useAppearance();
  const tag = locale ?? deviceLocale().languageTag;
  const target = Number.isFinite(value) ? value : 0;
  const drawn = useCountUp(target, {
    enabled: !prefersLessMotion,
    durationMs: duration,
    delayMs: delay,
  });
  const finalText = formatFigure(target, tag, format);
  const label = accessibilityLabel ?? finalText;

  if (prefersLessMotion) {
    return (
      <Text
        variant={variant}
        testID={testID}
        accessibilityLabel={label}
        style={[TABULAR, style]}
        {...rest}>
        {finalText}
      </Text>
    );
  }
  return (
    <View
      testID={testID === undefined ? undefined : `${testID}-container`}
      style={containerStyle}>
      <Text
        variant={variant}
        testID={testID === undefined ? undefined : `${testID}-width`}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[TABULAR, style, KEEPER]}
        {...rest}>
        {finalText}
      </Text>
      <Text
        variant={variant}
        testID={testID}
        accessibilityLabel={label}
        style={[TABULAR, style, StyleSheet.absoluteFill]}
        {...rest}>
        {formatFigure(drawn, tag, format)}
      </Text>
    </View>
  );
}
