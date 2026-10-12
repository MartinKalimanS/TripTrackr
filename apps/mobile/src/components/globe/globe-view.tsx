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
 * Feature 005 (T532) gives it the Sunrise look in layers, none of which changes the
 * geometry, the connections, the statistics or the camera rules (FR-082): the basemap's
 * colours through `basemap-config.ts`, the atmosphere, a faint graticule, the visited and
 * planned countries, and the gradient overlay of the connections. The Home sheet drives the
 * camera through the handle (`GlobeHandle.setCamera`, once per settle, `globe-fit.ts`) and
 * moves the Mapbox logo and attribution above itself with `logoPosition` and
 * `attributionPosition`; both stay on.
 *
 * The map mounts only once Mapbox is configured — token set, telemetry off
 * (`useMapboxReady`, lib/mapbox.ts) — never on the strength of import order.
 */
import { Camera, MapView, StyleImport, type MapState } from '@rnmapbox/maps';
import { useIsFocused } from 'expo-router';
import {
  useImperativeHandle,
  useMemo,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type Ref,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { GlobeBasemap, GlobeCamera, GlobeColors, Spacing } from '@/constants/theme';
import { countryCodes } from '@/features/globe/country-codes';
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
import { AtmosphereLayer } from './atmosphere-layer';
import { basemapConfig } from './basemap-config';
import { Beacons } from './beacon';
import { useAutoPitch, useFlyToFirstPlacement } from './camera';
import { GradientArcLayer } from './gradient-arc-layer';
import { GraticuleLayer } from './graticule-layer';
import { TerrainLayers } from './terrain-layers';
import { useArcPress } from './use-arc-press';
import { useWorldScale } from './use-world-scale';
import { VisitedCountriesLayer } from './visited-countries-layer';

/** rnmapbox declares `CameraRef` but does not export it from the package root. */
type CameraHandle = ComponentRef<typeof Camera>;

/** Where Mapbox's logo and attribution sit: offsets from two edges, as the package types them. */
type OrnamentPosition = ComponentProps<typeof MapView>['logoPosition'];

/** What the Home sheet may ask of the globe's camera: one move per settle. */
export type GlobeHandle = {
  setCamera: (settings: Parameters<CameraHandle['setCamera']>[0]) => void;
};

export type GlobeViewProps = {
  trips: readonly GlobeTrip[];
  /** The trips that animate (`focusTripIds`). */
  focus: readonly string[];
  /** Announced in place of the map, which a screen reader cannot enter. */
  accessibilityLabel: string;
  /** `YYYY-MM-DD`; injectable for tests, otherwise the device's local day. */
  today?: string;
  /** Moves the Mapbox logo above the Home sheet. The logo is never hidden (Mapbox's terms). */
  logoPosition?: OrnamentPosition;
  /** Moves the attribution above the Home sheet. It is never hidden (Mapbox's terms). */
  attributionPosition?: OrnamentPosition;
  /** The camera, for the sheet: `setCamera` with `globeFitCamera` once per settle. */
  ref?: Ref<GlobeHandle>;
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
      countries: countryCodes(trips, today),
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
  logoPosition,
  attributionPosition,
  ref,
}: GlobeViewProps & { today: string }) {
  const { theme, prefersLessMotion } = useAppearance();
  const focused = useIsFocused();
  const foreground = useAppActive();
  const onPress = useArcPress();
  const { cameraRef, onMapIdle: tiltOnIdle } = useAutoPitch(!prefersLessMotion);
  const { worldScale, onMapIdle: labelsOnIdle } = useWorldScale();
  const { arcs, journey, markers, countries, beacons, centre } = useGlobeShapes(
    trips,
    focus,
    today,
  );
  useImperativeHandle(
    ref,
    () => ({ setCamera: (settings) => cameraRef.current?.setCamera(settings) }),
    [cameraRef],
  );
  const onMapIdle = (state: MapState) => {
    tiltOnIdle(state);
    labelsOnIdle(state);
  };
  const config = basemapConfig(theme, worldScale);
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
      logoPosition={logoPosition}
      attributionPosition={attributionPosition}
      pitchEnabled
      maxPitch={GlobeCamera.maxPitch}
      onMapIdle={onMapIdle}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      <StyleImport id="basemap" existing config={config} />
      <Camera
        ref={cameraRef}
        minZoomLevel={GlobeCamera.minZoomLevel}
        maxZoomLevel={GlobeCamera.maxZoomLevel}
        defaultSettings={{ centerCoordinate: centre, zoomLevel: GlobeCamera.zoomLevel }}
      />
      <AtmosphereLayer scheme={theme} />
      <GraticuleLayer scheme={theme} />
      <VisitedCountriesLayer
        scheme={theme}
        visited={countries.visited}
        planned={countries.planned}
      />
      <TerrainLayers />
      <ArcSource
        arcs={arcs}
        journey={journey}
        markers={markers}
        palette={palette}
        onPress={onPress}
      />
      <GradientArcLayer arcs={arcs} journey={journey} palette={palette} />
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
