/**
 * `FlagChip` - a country's flag in a small clipped box (feature 005, T520; contract C5-16;
 * research D5-16; owner answer Q-3: platform emoji flags in a clipped chip; FR-055).
 *
 *   <FlagChip iso2="PT" />            20 by 14 dp, rounded 3
 *   <FlagChip iso2="PT" size="lg" />  28 by 20 dp, rounded 4
 *
 * - The glyph is the flag emoji of the ISO alpha-2 code (`countries.iso_code`): the two
 *   regional-indicator letters the platform draws as a flag. There is no flag package, no
 *   asset and no network (offline first). A code that is not two letters (an empty one, a
 *   country the data has no code for) has no glyph: the box then shows the two letters, or a
 *   question mark, in a neutral chip. Emoji flags differ in style between platforms and cannot
 *   be cropped to the exact flag ratio, so the box clips them; whether a given country's glyph
 *   exists on a given device is the V6 device check (T512).
 * - The box is a hairline-edged, rounded, `overflow: hidden` view of a FIXED size: the glyph
 *   does not scale with the text size (the country name beside it does).
 * - Decorative: hidden from assistive technology on both platforms, because the country name
 *   is always beside it. It is never pressable.
 */
import { Text as NativeText, View, type ViewStyle } from 'react-native';

import { Text } from './text';
import { useColors } from './theme-tokens';

export interface FlagChipProps {
  /** The country's ISO alpha-2 code, any case. */
  iso2: string;
  size?: 'md' | 'lg';
  testID?: string;
}

/** The regional indicator symbol letter A. */
const REGIONAL_A = 0x1f1e6;
const LETTER_A = 'A'.charCodeAt(0);
const ALPHA2 = /^[A-Za-z]{2}$/;

/** The flag emoji of an ISO alpha-2 code, or `null` for anything that is not one. */
export function flagGlyph(iso2: string | null | undefined): string | null {
  if (typeof iso2 !== 'string' || !ALPHA2.test(iso2)) return null;
  return [...iso2.toUpperCase()]
    .map((letter) => String.fromCodePoint(REGIONAL_A + letter.charCodeAt(0) - LETTER_A))
    .join('');
}

/** The letters shown where there is no glyph: up to two, upper case, else a question mark. */
function fallbackLetters(iso2: string | null | undefined): string {
  const letters = (iso2 ?? '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return letters === '' ? '?' : letters;
}

/** Box, corner and type, in dp, for each size (C5-16: 20 by 14 and 28 by 20). */
const SIZES = {
  md: { width: 20, height: 14, radius: 3, glyph: 15, letters: 9 },
  lg: { width: 28, height: 20, radius: 4, glyph: 22, letters: 12 },
} as const;

const COLOR_KEYS = ['hairline', 'surfaceSecondary'] as const;

export function FlagChip({ iso2, size = 'md', testID }: FlagChipProps) {
  const colors = useColors(COLOR_KEYS);
  const box = SIZES[size];
  const glyph = flagGlyph(iso2);
  const style: ViewStyle = {
    width: box.width,
    height: box.height,
    borderRadius: box.radius,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    ...(glyph === null ? { backgroundColor: colors.surfaceSecondary } : null),
  };

  return (
    <View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={style}>
      {glyph === null ? (
        <Text
          variant="caption"
          allowFontScaling={false}
          style={{ fontSize: box.letters, lineHeight: box.height }}>
          {fallbackLetters(iso2)}
        </Text>
      ) : (
        <NativeText
          allowFontScaling={false}
          style={{
            fontSize: box.glyph,
            lineHeight: box.height + 2,
            includeFontPadding: false,
          }}>
          {glyph}
        </NativeText>
      )}
    </View>
  );
}
