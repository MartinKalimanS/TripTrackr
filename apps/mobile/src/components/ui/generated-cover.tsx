/**
 * `GeneratedCover` - what a trip without a usable photograph shows, instead of a grey slab
 * (feature 005; FR-008, FR-034, FR-076; data-model section 10; contract C5-19).
 *
 *   <GeneratedCover palette={coverPalette(trip.id)} iso2="PT" initial="P" />
 *   <GeneratedCover palette={1} iso2={null} initial="Iceland" thumb />   a 64 dp row thumbnail
 *
 * A gradient of one of three palettes (`cover1..3` in the palette, drawn by `Scrim`, the one
 * gradient consumer), the country's code as a big ghost glyph (16 percent white) in the
 * bottom corner, and a dashed stamp outline in the top corner. With no country the glyph is
 * the initial of the trip. `thumb` is the small form: the code only, at 40 dp and in OPAQUE
 * white (text on a picture is never an alpha white, D5-10), no stamp.
 *
 * The flag chip is NOT drawn here. In the prototype frames (`trips-nocover`, `trip-nocover`)
 * the flag sits in the caption row of the card or the hero, over this cover exactly as it sits
 * over a photograph, so the card draws it once for both; a cover of its own would show two.
 *
 * It fills the frame of the picture it replaces (`absoluteFill`) and clips to it, so nothing
 * jumps when a photograph arrives or fails to draw. A caller `style` is applied last. It is
 * decoration: hidden from assistive technology with its descendants, takes no touch, and the
 * card that holds it names the trip. White text on every stop is gated (P9) and re-measured
 * on the rendered cover by `generated-cover.test.tsx`.
 *
 * `coverPalette(seed)` is the pick: `fnv1a32(seed) % 3`, a pure function, so the same trip has
 * the same cover on every launch and device. Pass the trip's id, or its title where there is
 * no id yet.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppearance } from '@/hooks/use-appearance';
import { fnv1a32 } from '@/lib/fnv1a';
import { Palettes, withAlpha } from '@/theme';

import { initialsOf } from './avatar';
import { Scrim, type CoverPaletteIndex } from './scrim';

export type { CoverPaletteIndex } from './scrim';

export interface GeneratedCoverProps {
  /** Which of the three palettes: `coverPalette(trip.id)`. */
  palette: CoverPaletteIndex;
  /** The country's ISO alpha-2 code, as stored (any case). */
  iso2?: string | null;
  /** What to show when there is no country: the trip's title (its first letter is used). */
  initial: string;
  /** The row form: the code only, 40 dp, opaque. */
  thumb?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Default `generated-cover`; the parts are `<testID>-gradient`, `-glyph` and `-stamp`. */
  testID?: string;
}

/** The palette of a trip: `fnv1a32(seed) % 3`. Pure and stable. */
export function coverPalette(seed: string): CoverPaletteIndex {
  return (fnv1a32(seed) % 3) as CoverPaletteIndex;
}

/** The big mark: the country's code in upper case, else the first letter of `initial`. */
export function coverGlyph(iso2: string | null | undefined, initial: string): string {
  const code = (iso2 ?? '').trim().toUpperCase();
  if (code !== '') return code;
  const [word = ''] = initial.trim().split(/\s+/);
  if (word === '') return '';
  const letter = initialsOf(word);
  return letter === '?' ? '' : letter;
}

/** The ghost glyph and the stamp outline are decoration: their strengths are the prototype's. */
const GHOST_ALPHA = 0.16;
const OUTLINE_ALPHA = 0.62;

const GLYPH = {
  cover: { size: 120, tracking: -4.8, right: '-4%', bottom: '-14%' },
  thumb: { size: 40, tracking: -0.8, right: 4, bottom: 6 },
} as const;

function Glyph({
  text,
  thumb,
  color,
  testID,
}: {
  text: string;
  thumb: boolean;
  color: string;
  testID: string;
}) {
  const { size, tracking, right, bottom } = GLYPH[thumb ? 'thumb' : 'cover'];
  return (
    <Text
      testID={testID}
      className="font-display-bold"
      numberOfLines={1}
      allowFontScaling={false}
      style={{
        position: 'absolute',
        right,
        bottom,
        fontSize: size,
        lineHeight: size,
        letterSpacing: tracking,
        color,
      }}>
      {text}
    </Text>
  );
}

/** Two rings, the outer one dashed, in the top corner, tilted: a stamp that was never inked. */
function StampOutline({ color, testID }: { color: string; testID: string }) {
  return (
    <View testID={testID} style={styles.stamp}>
      <Svg width="100%" height="100%" viewBox="0 0 120 120">
        <Circle
          cx={60}
          cy={60}
          r={54}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray="7 6"
        />
        <Circle cx={60} cy={60} r={44} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

export function GeneratedCover({
  palette,
  iso2,
  initial,
  thumb = false,
  style,
  testID = 'generated-cover',
}: GeneratedCoverProps) {
  const { themeName } = useAppearance();
  const { onPhoto } = Palettes[themeName];
  const glyph = coverGlyph(iso2, initial);
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, style]}>
      <Scrim kind="cover" palette={palette} testID={`${testID}-gradient`} />
      {thumb ? null : (
        <StampOutline
          testID={`${testID}-stamp`}
          color={withAlpha(onPhoto, OUTLINE_ALPHA)}
        />
      )}
      {glyph === '' ? null : (
        <Glyph
          testID={`${testID}-glyph`}
          text={glyph}
          thumb={thumb}
          color={thumb ? onPhoto : withAlpha(onPhoto, GHOST_ALPHA)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  stamp: {
    position: 'absolute',
    top: '14%',
    right: '8%',
    width: '28%',
    maxWidth: 96,
    aspectRatio: 1,
    transform: [{ rotate: '-10deg' }],
  },
});
