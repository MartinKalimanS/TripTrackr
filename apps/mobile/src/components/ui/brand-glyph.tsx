/**
 * `BrandGlyph` - the Google logo of the sign-in button (feature 004, T446; FR-024, FR-030;
 * research D4-08; restyled by F12, owner decision Q-11).
 *
 *   <BrandGlyph name="logo-google" />
 *
 * `Icon` is the one icon vocabulary and is made of Phosphor glyphs, which have no brand's
 * logo; this adapter is the only place that draws a logo:
 *
 * - Google is its four-colour "G" (`GoogleG`, `src/theme/brand-artwork.ts`), drawn in
 *   `react-native-svg` in the brand's colours in every theme: a brand mark is not retuned to
 *   the palette (Google's branding guidelines).
 * - Apple's logo is NOT drawn here, nor anywhere in the app's own code (owner decision
 *   2026-10-22): Sign in with Apple is Apple's own native button, which draws Apple's official
 *   artwork (`components/auth/apple-official-button.tsx`). A glyph of an icon font stood in for
 *   it until then.
 * - `size` is one of the icon sizes (16, 20 or 24 dp, default 20) and does not scale with
 *   the font scale: the control around it does (`Tappable`).
 * - It is decorative, hidden from assistive technology on both platforms: the button it sits
 *   in is named "Continue with Google" by its own label. The wrapper is
 *   `testID="brand-glyph"` (written out, not a prop: the id-parity check reads a literal).
 */
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GoogleG } from '@/theme/brand-artwork';

import type { IconSize } from './icon';

export type BrandGlyphName = 'logo-google';

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

export function BrandGlyph({ size = 20 }: BrandGlyphProps) {
  return (
    <View testID="brand-glyph" {...DECORATIVE}>
      <GoogleLogo size={size} />
    </View>
  );
}
