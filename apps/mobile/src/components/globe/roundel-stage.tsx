/**
 * Where the roundel bitmaps are made — feature 005, T533 (research D5-04; spike V2, T508).
 *
 * A photo roundel is a trip's cover in a circle with a white ring, a coral ring round it for
 * the live trip and a dashed amber one for a planned trip. A `SymbolLayer` draws a bitmap, so
 * each is baked from a real view: this stage lays the badges out OFF SCREEN (`left: -2000`:
 * laid out, not `opacity: 0`, which captures as nothing), and a badge is captured once its
 * picture is on screen (`onDisplay`), through the swappable `CaptureView`. A badge that
 * cannot be captured, or whose picture does not load, reports a failure and the pin stays a
 * dot; nothing here throws into the globe.
 *
 * At most `GlobeLayers.pins.captureBatch` badges are laid out at once, so sixty photographs
 * are not decoded together. The stage is drawn BESIDE the map (`GlobeView`), never inside it.
 * It is off by default (`GlobeLayers.pins.roundelsEnabled`); whether a hidden view captures
 * correctly on both platforms is a device check.
 */
import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CaptureView } from '@/components/ui/view-capture';
import {
  GlobeColors,
  GlobeLayers,
  GlobeStyle,
  type GlobeScheme,
} from '@/constants/theme';

import type { RoundelRequest } from './pin-features';

export type RoundelStageProps = {
  /** The badges still to make: the stage lays out the first few. */
  requests: readonly RoundelRequest[];
  scheme: GlobeScheme;
  capture: CaptureView;
  onCaptured: (key: string, uri: string) => void;
  onFailed: (key: string) => void;
};

type BadgeProps = Omit<RoundelStageProps, 'requests'> & { request: RoundelRequest };

function ringStyle(request: RoundelRequest, scheme: GlobeScheme) {
  const { statusRing, statusRingGap } = GlobeLayers.pins;
  const palette = GlobeColors[scheme];
  const size = GlobeLayers.pins.roundelSize[request.status];
  const outer = size + 2 * (statusRingGap + statusRing);
  const base = {
    width: outer,
    height: outer,
    borderRadius: outer / 2,
    padding: statusRingGap,
  };
  if (request.status === 'active') {
    return {
      ...base,
      borderWidth: statusRing,
      borderColor: palette.active,
      borderStyle: 'solid' as const,
    };
  }
  if (request.status === 'planning') {
    return {
      ...base,
      borderWidth: statusRing,
      borderColor: palette.planning,
      borderStyle: 'dashed' as const,
    };
  }
  return { ...base, borderWidth: 0 };
}

function RoundelBadge({ request, scheme, capture, onCaptured, onFailed }: BadgeProps) {
  const ref = useRef<View>(null);
  const started = useRef(false);
  const size = GlobeLayers.pins.roundelSize[request.status];

  const onDisplay = useCallback(() => {
    if (started.current) return;
    started.current = true;
    capture(ref).then(
      (uri) => onCaptured(request.key, uri),
      () => onFailed(request.key),
    );
  }, [capture, onCaptured, onFailed, request.key]);

  return (
    <View
      ref={ref}
      collapsable={false}
      testID={`roundel-badge-${request.key}`}
      style={ringStyle(request, scheme)}>
      <Image
        testID={`roundel-image-${request.key}`}
        source={{ uri: request.cover }}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        onDisplay={onDisplay}
        onError={() => onFailed(request.key)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: GlobeLayers.pins.roundelRing,
          borderColor: GlobeStyle[scheme].callout.surface,
        }}
      />
    </View>
  );
}

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
