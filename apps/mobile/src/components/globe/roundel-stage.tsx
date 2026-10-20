/**
 * Where the roundel bitmaps are made — feature 005, T533 (research D5-04; spike V2, T508).
 *
 * A photo roundel is a trip's cover in a circle with a white ring, a coral ring round it for
 * the live trip and a dashed amber one for a planned trip (`roundel-badge.tsx`). A
 * `SymbolLayer` draws a bitmap, so each is baked from a real view: this stage lays the badges
 * out OFF SCREEN (`left: -2000`: laid out, not `opacity: 0`, which captures as nothing), and
 * a badge is captured once its picture is on screen, through the swappable `CaptureView`. A
 * badge that cannot be captured, or whose picture does not load, reports a failure and the
 * pin stays a dot; nothing here throws into the globe.
 *
 * At most `GlobeLayers.pins.captureBatch` badges are laid out at once, so sixty photographs
 * are not decoded together. The stage is drawn BESIDE the map (`GlobeView`), never inside it.
 * It exists only while `GlobeLayers.pins.roundelsEnabled`; whether a hidden view captures
 * correctly on both platforms is a device check.
 */
import { StyleSheet, View } from 'react-native';

import { GlobeLayers } from '@/constants/theme';

import type { RoundelRequest } from './pin-features';
import { RoundelBadge, type RoundelBadgeProps } from './roundel-badge';

export type RoundelStageProps = Omit<RoundelBadgeProps, 'request'> & {
  /** The badges still to make: the stage lays out the first few. */
  requests: readonly RoundelRequest[];
};

export function RoundelStage({ requests, ...badge }: RoundelStageProps) {
  return (
    <View
      testID="roundel-stage"
      pointerEvents="none"
      collapsable={false}
      style={styles.stage}>
      {requests.slice(0, GlobeLayers.pins.captureBatch).map((request) => (
        <RoundelBadge key={request.key} request={request} {...badge} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', left: -2000, top: 0, flexDirection: 'row' },
});
