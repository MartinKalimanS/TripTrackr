/**
 * The globe — T093, FR-045 to FR-047; research D-06 and D-30.
 *
 * ONE `MapView` with the globe projection is the home screen and, in User
 * Story 4, the street-level map: Mapbox interpolates the sphere into a flat map
 * as the traveller zooms, so FR-048's "no break between two views" holds
 * because there is only ever one view. Its basemap is Mapbox Standard, faded so
 * the connections are the subject (feature 002 FR-024) and lit to follow the
 * app theme, live (FR-023). The Mapbox logo and attribution are left where the
 * SDK puts them — Mapbox's terms require both — and nothing is drawn over the
 * map but the connections themselves (feature 002 contract C12).
 *
 * It is mounted for every traveller, with or without a trip (feature 003): an
 * empty globe opens on the whole sphere and moves to the first stop that
 * appears (`useFlyToFirstPlacement`).
 *
 * Close in (User Story 4), terrain relief rises from city scale
 * (`TerrainLayers`), the basemap stands its 3D buildings up at street level,
 * and the camera tilts to show them once it settles (`useAutoPitch`,
 * camera.ts) — all inside the same view, so nothing swaps as the traveller
 * descends.
 *
 * A screen reader cannot enter a native map, so the map is one summarised
 * image to assistive technology, and the Trips tab remains the accessible
 * path to every trip (D-30).
 *
 * The map mounts only once Mapbox is configured — token set, telemetry off
 * (`useMapboxReady`, lib/mapbox.ts) — never on the strength of import order.
 */
import { Camera, MapView, StyleImport } from '@rnmapbox/maps';
import { useIsFocused } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { GlobeBasemap, GlobeCamera, GlobeColors, Spacing } from '@/constants/theme';
import type { GlobeTrip } from '@/features/globe/globe-data';
import { todayIso } from '@/features/trips/stop-dates';
import { useAppActive } from '@/hooks/use-app-active';
import { useAppearance } from '@/hooks/use-appearance';
import { useMapboxReady } from '@/hooks/use-mapbox-ready';

import {
  arcCollection,
  beaconRoutes,
  cameraCenter,
  journeyCollection,
  markerCollection,
} from './arc-features';
import { ArcSource } from './arc-source';
import { Beacons } from './beacon';
import { useAutoPitch, useFlyToFirstPlacement } from './camera';
import { TerrainLayers } from './terrain-layers';
import { useArcPress } from './use-arc-press';

export type GlobeViewProps = {
  trips: readonly GlobeTrip[];
  /** The trips that animate (`focusTripIds`). */
  focus: readonly string[];
  /** Announced in place of the map, which a screen reader cannot enter. */
  accessibilityLabel: string;
  /** `YYYY-MM-DD`; injectable for tests, otherwise the device's local day. */
  today?: string;
};

/** Derived once per data change — never per animation frame. */
function useGlobeShapes(
  trips: readonly GlobeTrip[],
  focus: readonly string[],
  today: string,
) {
  return useMemo(
    () => ({
      arcs: arcCollection(trips),
      journey: journeyCollection(trips, today),
      markers: markerCollection(trips),
      beacons: beaconRoutes(trips, focus, today),
      centre: cameraCenter(trips, focus) ?? GlobeCamera.fallbackCenter,
    }),
    [trips, focus, today],
  );
}

export function GlobeView({ today, ...props }: GlobeViewProps) {
  const mapbox = useMapboxReady();

  if (mapbox === 'unavailable') return <GlobeUnavailable />;
  if (mapbox === 'starting') {
    return (
      <Centred>
        <LoadingState title="Preparing the globe" />
      </Centred>
    );
  }
  return <GlobeMap {...props} today={today ?? todayIso()} />;
}

function GlobeMap({
  trips,
  focus,
  accessibilityLabel,
  today,
}: GlobeViewProps & { today: string }) {
  const { theme, prefersLessMotion } = useAppearance();
  const focused = useIsFocused();
  const foreground = useAppActive();
  const onPress = useArcPress();
  const { cameraRef, onMapIdle } = useAutoPitch(!prefersLessMotion);
  const { arcs, journey, markers, beacons, centre } = useGlobeShapes(trips, focus, today);
  useFlyToFirstPlacement(
    cameraRef,
    markers.features.length > 0,
    centre,
    !prefersLessMotion,
  );
  const palette = GlobeColors[theme];

  return (
    <MapView
      testID="globe-map"
      style={styles.map}
      projection="globe"
      styleURL={GlobeBasemap.styleURL}
      scaleBarEnabled={false}
      pitchEnabled
      maxPitch={GlobeCamera.maxPitch}
      onMapIdle={onMapIdle}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <StyleImport
        id="basemap"
        existing
        config={{
          theme: GlobeBasemap.theme,
          lightPreset: GlobeBasemap.lightPreset[theme],
          show3dObjects: true,
        }}
      />
      <Camera
        ref={cameraRef}
        minZoomLevel={GlobeCamera.minZoomLevel}
        maxZoomLevel={GlobeCamera.maxZoomLevel}
        defaultSettings={{ centerCoordinate: centre, zoomLevel: GlobeCamera.zoomLevel }}
      />
      <TerrainLayers />
      <ArcSource
        arcs={arcs}
        journey={journey}
        markers={markers}
        palette={palette}
        onPress={onPress}
      />
      {beacons.length > 0 ? (
        <Beacons
          routes={beacons}
          palette={palette}
          running={!prefersLessMotion && focused && foreground}
        />
      ) : null}
    </MapView>
  );
}

function Centred({ children }: { children: ReactNode }) {
  return <View style={styles.centred}>{children}</View>;
}

/**
 * No token in the build, or the SDK refused it: a designed state, never a
 * blank map (D-30).
 */
function GlobeUnavailable() {
  return (
    <Centred>
      <ErrorState
        title="The globe can’t load in this build"
        detail="Map access isn’t set up in this version of the app. Your trips are safe — the Trips tab lists every one."
      />
    </Centred>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  centred: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
});
