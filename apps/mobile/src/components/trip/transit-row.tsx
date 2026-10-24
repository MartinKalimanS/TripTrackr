/**
 * `TransitRow` - the dotted segment and the distance between two stops where the traveller
 * moves on (tasks.md T545; contract C5-20; spec FR-041, FR-074, FR-077, FR-076).
 *
 *   <TransitRow stopId={stop.id} km={313.2} />      "313 km"
 *
 * A 36 dp minimum (it grows with the text) with a 32 dp rail holding the dotted spine and, beside
 * it, a route glyph and the distance in kilometres, grouped for the device (`formatDistance`). The
 * app does not know how the traveller moves, so the glyph is a route, never a car or a plane.
 *
 * It is omitted when `km` is `null`: a stop this device has not placed is never guessed
 * (Constitution IV), and the solid line alone joins the stops. It is decoration: the distance is
 * said as the VALUE of the stop it leads to ("23 kilometres from Lisbon."), so it is hidden from
 * assistive technology rather than read twice.
 */
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { formatDistance } from '@/lib/locale';

import { DottedSpine } from './spine';

export interface TransitRowProps {
  /** The stop this segment leads from: the row is `stop-transit-<id>`. */
  stopId: string;
  km: number | null;
}

const ROUTE: IconName = 'route';
const MIN_HEIGHT = 36;

export function TransitRow({ stopId, km }: TransitRowProps) {
  if (km === null) return null;
  return (
    <View
      testID={`stop-transit-${stopId}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row gap-3"
      style={{ minHeight: MIN_HEIGHT }}>
      <View className="w-8 items-center">
        <DottedSpine stopId={stopId} slot="transit" />
      </View>
      <View className="flex-1 flex-row items-center gap-1.5 py-1">
        <Icon name={ROUTE} size={16} tone="muted" />
        <Text
          variant="caption"
          tone="muted"
          className="shrink"
          testID={`stop-transit-distance-${stopId}`}>
          {formatDistance(km).text}
        </Text>
      </View>
    </View>
  );
}
