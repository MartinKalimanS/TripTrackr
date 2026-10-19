/**
 * `ProgressRing` - a share of a whole as a ring (feature 005, T536; contract C5-23; research
 * D5-15; FR-076): a `sand` track and an arc in the coral line colour that starts at the top and
 * runs clockwise, with round caps, drawn with `react-native-svg`. The Countries list uses it for
 * "14 of 195"; the passport card (T55x) will use it again.
 *
 *   <ProgressRing value={14} max={195} size={72}><Text>14</Text></ProgressRing>
 *
 * `children` sit in the middle. The ring is decoration: the words beside it carry the meaning
 * ("14 of 195 countries"), so the ring and its centre are hidden from assistive technology on
 * both platforms. The arc is a dash of one circumference with an offset (the form an animated
 * ring needs, `strokeDashoffset`); this one is drawn at once. A small share is drawn at least
 * as long as its round caps, so a first country still shows; nothing draws no arc.
 *
 * Ids: `testID` is the ring, `<testID>-track` and `<testID>-arc` the two circles.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useColors } from './theme-tokens';

export interface ProgressRingProps {
  /** How far round: `value` of `max`. */
  value: number;
  max: number;
  /** The diameter in dp. Default 64. */
  size?: number;
  /** The width of the track and the arc in dp. Default 8. */
  strokeWidth?: number;
  /** The middle of the ring. */
  children?: ReactNode;
  testID?: string;
}

/** The shortest arc that is drawn for a value above zero: the round caps alone are a dot. */
const MIN_DASH = 1;
const COLOR_KEYS = ['sand', 'accentLine'] as const;

interface RingInput {
  value: number;
  max: number;
  size: number;
  strokeWidth: number;
}

/** The circle's radius and circumference, and the length of the arc for `value` of `max`. */
export function ringArc({ value, max, size, strokeWidth }: RingInput) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const dash =
    share === 0 ? 0 : Math.min(Math.max(share * circumference, MIN_DASH), circumference);
  return { radius, circumference, dash };
}

export function ProgressRing({
  value,
  max,
  size = 64,
  strokeWidth = 8,
  children,
  testID,
}: ProgressRingProps) {
  const colors = useColors(COLOR_KEYS);
  const { radius, circumference, dash } = ringArc({ value, max, size, strokeWidth });
  const centre = size / 2;
  const circle = {
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    strokeWidth,
  } as const;

  return (
    <View
      testID={testID}
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle
          testID={testID === undefined ? undefined : `${testID}-track`}
          {...circle}
          stroke={colors.sand}
        />
        {dash === 0 ? null : (
          <Circle
            testID={testID === undefined ? undefined : `${testID}-arc`}
            {...circle}
            stroke={colors.accentLine}
            strokeLinecap="round"
            strokeDasharray={[circumference, circumference]}
            strokeDashoffset={circumference - dash}
            rotation={-90}
            originX={centre}
            originY={centre}
          />
        )}
      </Svg>
      <View style={styles.centre}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
