/**
 * `BrandGlyph` - the Google and Apple logos of the sign-in buttons (feature 004, T446;
 * FR-024, FR-030; research D4-08; restyled by F12, owner decision Q-11).
 *
 *   <BrandGlyph name="logo-google" />
 *
 * `Icon` is the one icon vocabulary and is made of Phosphor glyphs, which have no brand's
 * logo; this adapter is the only place that draws the two logos, so that replacing them with
 * the providers' own downloaded artwork touches one file:
 *
 * - Google is its four-colour "G" (`GoogleG`, `src/theme/brand-artwork.ts`), drawn in
 *   `react-native-svg` in the brand's colours in every theme: a brand mark is not retuned to
 *   the palette (Google's branding guidelines).
 * - Apple is the logo glyph (Ionicons, through `expo-font`, so no native change) inked as
 *   Sign in with Apple asks: white on the black button, black on the white one
 *   (`AppleButton`, by colour scheme). The Apple glyph is only drawn inside that button.
 * - `size` is one of the icon sizes (16, 20 or 24 dp, default 20) and does not scale with
 *   the font scale: the control around it does (`Tappable`).
 * - It is decorative, hidden from assistive technology on both platforms: the button it sits
 *   in is named "Continue with Google" by its own label. The wrapper is
 *   `testID="brand-glyph"` (written out, not a prop: the id-parity check reads a literal).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppearance } from '@/hooks/use-appearance';
import { AppleButton, GoogleG } from '@/theme/brand-artwork';

import type { IconSize } from './icon';

export type BrandGlyphName = 'logo-apple' | 'logo-google';

export interface BrandGlyphProps {
  name: BrandGlyphName;
  /** Default 20. */
  size?: IconSize;
}

const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

function GoogleLogo({ size }: { size: IconSize }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GoogleG.box} ${GoogleG.box}`}>
      {GoogleG.paths.map((path) => (
        <Path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </Svg>
  );
}

export function BrandGlyph({ name, size = 20 }: BrandGlyphProps) {
  const { theme } = useAppearance();
  return (
    <View testID="brand-glyph" {...DECORATIVE}>
      {name === 'logo-google' ? (
        <GoogleLogo size={size} />
      ) : (
        <Ionicons name={name} size={size} color={AppleButton[theme].ink} />
      )}
    </View>
  );
}
