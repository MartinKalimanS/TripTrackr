/**
 * `DottedSpine` - the dotted 3 dp line of the timeline where the traveller moves on (tasks.md
 * T545; contract C5-20; spec FR-041): the lead above a stop that follows a journey, and the
 * line beside the distance in a `TransitRow`.
 *
 * Drawn as round dots on a line (`react-native-svg`, `strokeDasharray="0 6"` with round caps),
 * not as a dotted border: React Native draws a dotted border only when every side has the
 * same width, so a one-sided dotted border would come out solid. The svg fills a 3 dp box
 * that takes whatever height the row gives it (a lead has its own 8 dp), in the `border`
 * token, which is the 3:1 line colour. It is decoration, hidden from assistive technology.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { useColors } from '@/components/ui/theme-tokens';

export type SpineSlot = 'lead' | 'transit';

export interface DottedSpineProps {
  stopId: string;
  /** `lead` is the 8 dp stub above a stop; `transit` fills the height of its row. */
  slot: SpineSlot;
}

const WIDTH = 3;
const LEAD_HEIGHT = 8;
/** A dot every 6 dp: a 3 dp dot and 3 dp of gap. */
const DASH = '0 6';
const COLOR_KEYS = ['border'] as const;

export function DottedSpine({ stopId, slot }: DottedSpineProps) {
  const colors = useColors(COLOR_KEYS);
  return (
    <View
      testID={
        slot === 'lead'
          ? `stop-rail-top-dotted-${stopId}`
          : `stop-transit-spine-${stopId}`
      }
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={slot === 'lead' ? styles.lead : styles.fill}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Line
          x1={WIDTH / 2}
          y1={0}
          x2={WIDTH / 2}
          y2="100%"
          stroke={colors.border}
          strokeWidth={WIDTH}
          strokeLinecap="round"
          strokeDasharray={DASH}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { width: WIDTH, height: LEAD_HEIGHT },
  fill: { width: WIDTH, flex: 1, minHeight: LEAD_HEIGHT },
});
