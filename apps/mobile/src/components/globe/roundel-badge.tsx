/**
 * One roundel badge — the view a pin's bitmap is baked from (feature 005, F1 pins).
 *
 * From the outside in: a transparent margin (`shadowPad`, so the lift is not cut off by the
 * capture), the status ring (a 2.5 dp coral line 6 dp outside a live trip's roundel, a dashed
 * amber one 5 dp outside a planned one, none for a past one), then the roundel itself: the
 * trip's picture in a circle with a 2 dp ring (white by day) and `lift2` under it. A trip
 * with no photograph shows its GENERATED cover: the palette of its id and the country's code,
 * as `GeneratedCover` draws it, with the code centred to fit a circle. Every value is a token
 * (`GlobeLayers.pins`, `GlobeStyle[scheme].pin`, `GlobeColors`).
 *
 * The badge reports ONE capture: once its photograph is on screen (`onDisplay`), or, for a
 * generated cover, once it is laid out. A badge that cannot be captured, or whose picture
 * does not load, reports a failure and the pin stays a dot.
 */
import { Image } from 'expo-image';
import { useCallback, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';

import { liftStyle } from '@/components/ui/lift-style';
import { Scrim } from '@/components/ui/scrim';
import { coverGlyph } from '@/components/ui/generated-cover';
import type { CaptureView } from '@/components/ui/view-capture';
import {
  GlobeColors,
  GlobeLayers,
  GlobeStyle,
  type GlobeScheme,
} from '@/constants/theme';
import { Palettes } from '@/theme';

import type { RoundelRequest } from './pin-features';

export type RoundelBadgeProps = {
  request: RoundelRequest;
  scheme: GlobeScheme;
  capture: CaptureView;
  onCaptured: (key: string, uri: string) => void;
  onFailed: (key: string) => void;
};

/** The status ring round a roundel: coral and solid, amber and dashed, or none. */
export function statusRingStyle(
  request: Pick<RoundelRequest, 'status'>,
  scheme: GlobeScheme,
  os: string = Platform.OS,
): ViewStyle {
  const { statusRing, statusRingOutset, roundelSize } = GlobeLayers.pins;
  const size = roundelSize[request.status];
  if (request.status === 'past') return { width: size, height: size };
  const outer = size + 2 * statusRingOutset[request.status];
  const palette = GlobeColors[scheme];
  return {
    width: outer,
    height: outer,
    borderRadius: outer / 2,
    borderWidth: statusRing,
    borderColor: request.status === 'active' ? palette.active : palette.planning,
    // A dashed border on a circle is not reliable on Android: solid there.
    borderStyle: request.status === 'planning' && os !== 'android' ? 'dashed' : 'solid',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function GeneratedFace({
  request,
  scheme,
  size,
}: {
  request: RoundelRequest;
  scheme: GlobeScheme;
  size: number;
}) {
  const glyph = coverGlyph(request.iso, '');
  const fontSize = Math.round(size * 0.34);
  return (
    <>
      <Scrim
        kind="cover"
        palette={request.palette}
        testID={`roundel-cover-${request.key}`}
      />
      {glyph === '' ? null : (
        <Text
          testID={`roundel-glyph-${request.key}`}
          className="font-display-bold"
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.glyph,
            { fontSize, lineHeight: size, color: Palettes[scheme].onPhoto },
          ]}>
          {glyph}
        </Text>
      )}
    </>
  );
}

export function RoundelBadge({
  request,
  scheme,
  capture,
  onCaptured,
  onFailed,
}: RoundelBadgeProps) {
  const ref = useRef<View>(null);
  const started = useRef(false);
  const { roundelSize, roundelRing, shadowPad } = GlobeLayers.pins;
  const size = roundelSize[request.status];
  const { pin } = GlobeStyle[scheme];
  const generated = request.cover === null;

  const ready = useCallback(() => {
    if (started.current) return;
    started.current = true;
    capture(ref).then(
      // A capture that answers with nothing is a failed one: the pin stays a dot.
      (uri) => (uri ? onCaptured(request.key, uri) : onFailed(request.key)),
      () => onFailed(request.key),
    );
  }, [capture, onCaptured, onFailed, request.key]);
  const onLayout = generated ? (_event: LayoutChangeEvent) => ready() : undefined;

  return (
    <View
      ref={ref}
      collapsable={false}
      testID={`roundel-badge-${request.key}`}
      onLayout={onLayout}
      style={[styles.margin, { padding: shadowPad }]}>
      <View
        testID={`roundel-ring-${request.key}`}
        style={statusRingStyle(request, scheme)}>
        <View
          testID={`roundel-disc-${request.key}`}
          style={[
            { width: size, height: size, borderRadius: size / 2 },
            liftStyle(scheme, 'lift2'),
          ]}>
          <View
            style={[
              styles.clip,
              { borderRadius: size / 2, borderWidth: roundelRing, borderColor: pin.ring },
            ]}>
            {request.cover === null ? (
              <GeneratedFace request={request} scheme={scheme} size={size} />
            ) : (
              <Image
                testID={`roundel-image-${request.key}`}
                source={{ uri: request.cover }}
                contentFit="cover"
                transition={0}
                cachePolicy="memory-disk"
                onDisplay={ready}
                onError={() => onFailed(request.key)}
                style={StyleSheet.absoluteFill}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  margin: { alignItems: 'center', justifyContent: 'center' },
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  glyph: { textAlign: 'center', fontWeight: '700' },
});
