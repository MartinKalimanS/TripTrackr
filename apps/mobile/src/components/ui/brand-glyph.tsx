/**
 * `BrandGlyph` - the Google and Apple logos of the sign-in buttons (feature 004, T446;
 * FR-024, FR-030; research D4-08: "Ionicons stay only for the Google and Apple brand
 * glyphs").
 *
 *   <BrandGlyph name="logo-google" />
 *
 * `Icon` is the one icon vocabulary and is made of Phosphor glyphs, which have no brand's
 * logo (a registry of general pictograms); the two glyphs Ionicons draws (through
 * `expo-font`, so no native change) stay for exactly that. This adapter is the only place that imports them,
 * so the ink follows the same rule as every other icon, and so that replacing the glyphs
 * with the providers' own artwork (Google's four-colour "G", Apple's logo in black or white;
 * `docs/release/store-readiness.md`, "Branded sign-in buttons") touches one file.
 *
 * - The ink is the kit's `foreground`, read with `useThemeColor`, so it follows the four
 *   themes live; a caller cannot pass a colour.
 * - `size` is one of the icon sizes (16, 20 or 24 dp, default 20) and does not scale with
 *   the font scale: the control around it does (`Tappable`).
 * - It is decorative, hidden from assistive technology on both platforms, like an `Icon`
 *   with no label: the button it sits in is named "Continue with Google" by its own label.
 *   The wrapper is `testID="brand-glyph"` (written out, not a prop: the id-parity check reads
 *   a literal, and a forwarded one would move its unresolved count).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useThemeColor } from 'heroui-native';
import { View } from 'react-native';

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

export function BrandGlyph({ name, size = 20 }: BrandGlyphProps) {
  const color = useThemeColor('foreground');
  return (
    <View testID="brand-glyph" {...DECORATIVE}>
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}
