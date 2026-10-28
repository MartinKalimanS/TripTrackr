/**
 * `WelcomeMark` - the 32 dp TripTrackr mark of the wordmark row (prototype `.wordmark .ic`:
 * a globe outline with one meridian and a coral arc ending in a dot). A drawing in the ink
 * and the `accentLine` token, stroke 1.75, decorative: the wordmark's words name it.
 */
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { useColors } from '@/components/ui/theme-tokens';

const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

const MARK_COLOURS = ['ink', 'accentLine'] as const;

export function WelcomeMark({ size = 32 }: { size?: number }) {
  const colours = useColors(MARK_COLOURS);
  return (
    <View testID="welcome-mark" {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <Circle cx={16} cy={16} r={12.5} stroke={colours.ink} strokeWidth={1.75} />
        <Ellipse
          cx={16}
          cy={16}
          rx={5.5}
          ry={12.5}
          stroke={colours.ink}
          strokeWidth={1.75}
        />
        <Path d="M3.5 16h25" stroke={colours.ink} strokeWidth={1.75} />
        <Path
          d="M5 22C9 11 18 7 27 9"
          stroke={colours.accentLine}
          strokeWidth={2.25}
          strokeLinecap="round"
        />
        <Circle cx={27} cy={9} r={2.6} fill={colours.accentLine} />
      </Svg>
    </View>
  );
}
