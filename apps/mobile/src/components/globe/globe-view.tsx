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
 * Feature 005 gives it the Sunrise look in layers, none of which changes the
 * geometry, the connections, the statistics or the camera rules (FR-082): the basemap's
 * colours through `basemap-config.ts`, the atmosphere, a faint graticule, the visited and
 * planned countries and the gradient overlay of the connections (T532); a pin for each trip,
 * a dot by default and a photo roundel when that is switched on, and the callout of the live
 * trip, ONE `MarkerView` (T533). The Home sheet drives the camera through the handle
 * (`GlobeHandle.setCamera`, once per settle, `globe-fit.ts`), moves the Mapbox logo and
 * attribution above itself with `logoPosition` and `attributionPosition` (both stay on) and
 * says where the callout may sit with `calloutArea`.
 *
 * The map mounts only once Mapbox is configured — token set, telemetry off
 * (`useMapboxReady`, lib/mapbox.ts) — never on the strength of import order.
 */
import { Camera, MapView, StyleImport, type MapState } from '@rnmapbox/maps';
import { useIsFocused } from 'expo-router';
import {
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type Ref,
} from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import {
  GlobeBasemap,
  GlobeCamera,
  GlobeColors,
  GlobeLayers,
  Spacing,
  type GlobeScheme,
} from '@/constants/theme';
import { countryCodes } from '@/features/globe/country-codes';
import { restingCoordinate, type GlobeTrip } from '@/features/globe/globe-data';
import type { CameraFitSettings } from '@/features/globe/globe-fit';
import type { LngLat } from '@/features/globe/great-circle';
import { todayIso } from '@/features/trips/stop-dates';
import { useAppActive } from '@/hooks/use-app-active';
import { useAppearance } from '@/hooks/use-appearance';
import { useMapboxReady } from '@/hooks/use-mapbox-ready';

import { ActiveCallout } from './active-callout';
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
import { PinLayer } from './pin-layer';
import { pinCollection, pinCountries } from './pin-features';
import { TerrainLayers } from './terrain-layers';
import { useArcPress, type GlobePressEvent } from './use-arc-press';
import { useCalloutPlacement } from './use-callout-placement';
import { useRoundels, type Roundels } from './use-roundels';
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

/** The trip the callout names: "Portugal Road Trip", "Day 3 of 8 · Sintra". */
export type LiveTrip = { tripId: string; title: string; detail: string };

/** The free space between the header and the sheet, in dp from the top of the window. */
export type CalloutBounds = { top: number; bottom: number };

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
  /** The live trip: its pin gets a ring, a pulse and a card. Without one there is no callout. */
  liveTrip?: LiveTrip;
  /** Where the callout may go; the whole window by default. */
  calloutArea?: CalloutBounds;
  /** The local cover picture of each trip, by trip id, for the photo roundels (when on). */
  covers?: Readonly<Record<string, string>>;
  /**
   * The sheet's fit for the first frame (`globeFitCamera`): the camera's default padding and zoom, so
   * the planet is already where the sheet wants it when the map first draws, with no animation. The
   * flight to the first stop that appears keeps that zoom. Read once, when the camera mounts.
   */
  initialFit?: Pick<CameraFitSettings, 'padding' | 'zoomLevel'>;
  /** The map's accessibility actions (next trip, previous trip, recentre, open countries; FR-017). */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  /** The camera, for the sheet: `setCamera` with `globeFitCamera` once per settle. */
  ref?: Ref<GlobeHandle>;
};

const NO_COVERS: Readonly<Record<string, string>> = {};

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
      pins: pinCollection(trips, today),
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

type Shapes = ReturnType<typeof useGlobeShapes>;

/** The camera: the sheet's handle, the auto-pitch, the first placement and the label scale. */
function useGlobeCamera(
  ref: Ref<GlobeHandle> | undefined,
  shapes: Shapes,
  animated: boolean,
  zoomLevel: number,
) {
  const { cameraRef, onMapIdle: tiltOnIdle } = useAutoPitch(animated);
  const { worldScale, onMapIdle: labelsOnIdle } = useWorldScale();
  useImperativeHandle(
    ref,
    () => ({ setCamera: (settings) => cameraRef.current?.setCamera(settings) }),
    [cameraRef],
  );
  useFlyToFirstPlacement(
    cameraRef,
    shapes.markers.features.length > 0,
    shapes.centre,
    animated,
    zoomLevel,
  );
  return { cameraRef, worldScale, tiltOnIdle, labelsOnIdle };
}

/** Where the live trip's pin is: the stop the traveller is at today, else the first. */
function useLiveCoordinate(
  trips: readonly GlobeTrip[],
  liveTrip: LiveTrip | undefined,
  today: string,
): LngLat | null {
  return useMemo(() => {
    const trip = liveTrip && trips.find((t) => t.id === liveTrip.tripId);
    return trip ? restingCoordinate(trip, today) : null;
  }, [trips, liveTrip, today]);
}

type LayersProps = {
  theme: GlobeScheme;
  shapes: Shapes;
  roundels: Roundels;
  onPress: (event: GlobePressEvent) => void;
  beaconsRunning: boolean;
  callout: ReactNode;
};

/** Everything drawn on the map, bottom up: style layers, connections, pins, callout. */
function MapLayers({
  theme,
  shapes,
  roundels,
  onPress,
  beaconsRunning,
  callout,
}: LayersProps) {
  const { arcs, journey, markers, countries, beacons } = shapes;
  const palette = GlobeColors[theme];
  return (
    <>
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
      <PinLayer
        split={roundels.split}
        bitmaps={roundels.bitmaps}
        palette={palette}
        scheme={theme}
        onPress={onPress}
      />
      {beacons.length > 0 ? (
        <Beacons routes={beacons} palette={palette} running={beaconsRunning} />
      ) : null}
      {callout}
    </>
  );
}

function GlobeMap({
  trips,
  focus,
  accessibilityLabel,
  today,
  logoPosition,
  attributionPosition,
  liveTrip,
  calloutArea,
  covers = NO_COVERS,
  initialFit,
  accessibilityActions,
  onAccessibilityAction,
  ref,
}: GlobeViewProps & { today: string }) {
  const { theme, prefersLessMotion } = useAppearance();
  const focused = useIsFocused();
  const foreground = useAppActive();
  const onPress = useArcPress();
  const mapRef = useRef<ComponentRef<typeof MapView>>(null);
  const shapes = useGlobeShapes(trips, focus, today);
  const { cameraRef, worldScale, tiltOnIdle, labelsOnIdle } = useGlobeCamera(
    ref,
    shapes,
    !prefersLessMotion,
    initialFit?.zoomLevel ?? GlobeCamera.zoomLevel,
  );
  const countries = useMemo(() => pinCountries(trips, today), [trips, today]);
  const roundels = useRoundels(shapes.pins, covers, { scheme: theme, countries });
  const running = !prefersLessMotion && focused && foreground;
  const live = useLiveCallout({
    trips,
    liveTrip,
    today,
    mapRef,
    calloutArea,
    roundels,
    running,
  });
  const config = basemapConfig(theme, worldScale);
  const onMapIdle = (state: MapState) => {
    tiltOnIdle(state);
    labelsOnIdle(state);
    live.refresh();
  };

  return (
    <>
      <MapView
        ref={mapRef}
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
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}>
        <StyleImport id="basemap" existing config={config} />
        <Camera
          ref={cameraRef}
          minZoomLevel={GlobeCamera.minZoomLevel}
          maxZoomLevel={GlobeCamera.maxZoomLevel}
          defaultSettings={{
            centerCoordinate: shapes.centre,
            zoomLevel: initialFit?.zoomLevel ?? GlobeCamera.zoomLevel,
            ...(initialFit ? { padding: initialFit.padding } : null),
          }}
        />
        <MapLayers
          theme={theme}
          shapes={shapes}
          roundels={roundels}
          onPress={onPress}
          beaconsRunning={running}
          callout={live.element}
        />
      </MapView>
      {roundels.stage}
    </>
  );
}

type LiveCalloutArgs = {
  trips: readonly GlobeTrip[];
  liveTrip: LiveTrip | undefined;
  today: string;
  mapRef: Parameters<typeof useCalloutPlacement>[0]['map'];
  calloutArea: CalloutBounds | undefined;
  roundels: Roundels;
  running: boolean;
};

/** The callout of the live trip, placed on the side of its pin that has room, and its refresh. */
function useLiveCallout({
  trips,
  liveTrip,
  today,
  mapRef,
  calloutArea,
  roundels,
  running,
}: LiveCalloutArgs) {
  const { width, height } = useWindowDimensions();
  const coordinate = useLiveCoordinate(trips, liveTrip, today);
  const area = useMemo(
    () => ({
      left: 0,
      right: width,
      top: calloutArea?.top ?? 0,
      bottom: calloutArea?.bottom ?? height,
    }),
    [width, height, calloutArea?.top, calloutArea?.bottom],
  );
  const isRoundel = roundels.split.roundels.features.some(
    (f) => f.properties.trip_id === liveTrip?.tripId,
  );
  const ringSize = isRoundel
    ? GlobeLayers.callout.ringSize.roundel
    : GlobeLayers.callout.ringSize.dot;
  const placement = useCalloutPlacement({ map: mapRef, coordinate, area, ringSize });
  const element =
    coordinate && liveTrip ? (
      <ActiveCallout
        coordinate={coordinate}
        title={liveTrip.title}
        detail={liveTrip.detail}
        side={placement.side}
        maxWidth={placement.maxWidth}
        ringSize={ringSize}
        ring={!isRoundel}
        pulseSize={isRoundel ? GlobeLayers.callout.roundelPulse : ringSize}
        running={running}
        onCardLayout={placement.onCardLayout}
      />
    ) : null;
  return { element, refresh: placement.refresh };
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
