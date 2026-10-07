/**
 * The camera's tilt from globe to street — tasks.md T104 (FR-048, FR-049).
 *
 * Zooming itself needs no help: the one MapView's globe projection flattens
 * into a street map on its own as the camera descends (research D-06). What
 * the app adds is the tilt that makes terrain and the basemap's buildings
 * read as relief once the traveller is close — and takes it away again on
 * the way out, because a tilted globe looks like a mistake.
 *
 * The tilt is applied only after the camera settles (`onMapIdle`), never
 * while a gesture is in progress, and only to a tilt the app set itself: once
 * the traveller tilts by hand their choice stands until they are back out at
 * the globe. A traveller who prefers less motion gets no automatic camera
 * movement at all; the two-finger tilt is still theirs.
 */
import type { Camera, MapState } from '@rnmapbox/maps';
import { useEffect, useRef, type ComponentRef, type RefObject } from 'react';

import { GlobeCamera, GlobePitch } from '@/constants/theme';
import type { LngLat } from '@/features/globe/great-circle';

/** rnmapbox declares `CameraRef` but does not export it from the package root. */
type CameraHandle = ComponentRef<typeof Camera>;

/** Differences below this are rounding in the native camera, not a choice. */
const PITCH_TOLERANCE = 1;

/** 0 until city scale, rising linearly to the full tilt at street level. */
export function pitchForZoom(zoom: number): number {
  const { startZoom, fullZoom, max } = GlobePitch;
  const progress = (zoom - startZoom) / (fullZoom - startZoom);
  return Math.min(Math.max(progress, 0), 1) * max;
}

export interface CameraReading {
  zoom: number;
  pitch: number;
}

/**
 * The tilt the settled camera should take, or `null` to leave it alone.
 * `appliedPitch` is the last tilt the app set (the camera starts flat, so 0).
 */
export function nextPitch(reading: CameraReading, appliedPitch: number): number | null {
  const differs = (a: number, b: number) => Math.abs(a - b) > PITCH_TOLERANCE;

  if (reading.zoom < GlobePitch.flattenBelowZoom) {
    return differs(reading.pitch, 0) ? 0 : null;
  }
  if (differs(reading.pitch, appliedPitch)) return null;

  const target = pitchForZoom(reading.zoom);
  return differs(target, reading.pitch) ? target : null;
}

/**
 * Wires `nextPitch` to a MapView: hand `cameraRef` to the Camera and
 * `onMapIdle` to the MapView. Refs only — settling never re-renders the globe.
 */
export function useAutoPitch(enabled: boolean) {
  const cameraRef = useRef<CameraHandle>(null);
  const appliedPitch = useRef(0);

  const onMapIdle = (state: MapState) => {
    if (!enabled) return;
    const { zoom, pitch } = state.properties;
    const target = nextPitch({ zoom, pitch }, appliedPitch.current);
    if (target === null) return;
    appliedPitch.current = target;
    cameraRef.current?.setCamera({
      pitch: target,
      animationMode: 'easeTo',
      animationDuration: GlobePitch.durationMs,
    });
  };

  return { cameraRef, onMapIdle };
}

/**
 * The globe is mounted before there is anything on it (feature 003), and a
 * camera's `defaultSettings` are read once, so the first stop that appears
 * would otherwise land off screen. This moves the camera to it — once, on the
 * step from "nothing placed" to "something placed" — and never again: later
 * edits and syncs leave the traveller's own pan and zoom alone. Under reduced
 * motion the camera jumps instead of flying (FR-004).
 */
export function useFlyToFirstPlacement(
  cameraRef: RefObject<CameraHandle | null>,
  placed: boolean,
  centre: LngLat,
  animated: boolean,
) {
  const wasPlaced = useRef(placed);

  useEffect(() => {
    if (placed && !wasPlaced.current) {
      cameraRef.current?.setCamera({
        centerCoordinate: centre,
        zoomLevel: GlobeCamera.zoomLevel,
        animationMode: animated ? 'flyTo' : 'moveTo',
        animationDuration: animated ? GlobeCamera.flyToMs : 0,
      });
    }
    wasPlaced.current = placed;
  }, [cameraRef, placed, centre, animated]);
}
