/**
 * The camera moves of the Home that are not the sheet's fit (feature 005, T537; FR-015, FR-016,
 * FR-017; research D5-03; contract C5-22 and C5-24): recentre, fly to a trip, fly to a country
 * the traveller chose in the Countries list. Each is the argument of ONE `Camera.setCamera`,
 * made when the traveller asks (never per frame), and each jumps instead of flying under
 * reduced motion (FR-004).
 *
 * The padding and zoom of the sheet's fit (`globe-fit.ts`) are an input here, never computed
 * again, and nothing in this file is the geometry of the arcs or the camera rules (FR-082): a
 * move only says where to look and how close. Pure: no Mapbox, no React.
 */
import { GlobeCamera } from '@/constants/theme';
import type { CountryFocus } from '@/features/passport/country-summary';

import type { CameraFitSettings } from './globe-fit';
import type { LngLat } from './great-circle';

type FlightMode = 'flyTo' | 'moveTo';

interface Flight {
  animationMode: FlightMode;
  animationDuration: number;
}

function flight(animated: boolean): Flight {
  return {
    animationMode: animated ? 'flyTo' : 'moveTo',
    animationDuration: animated ? GlobeCamera.flyToMs : 0,
  };
}

export interface FlyMove extends Flight {
  centerCoordinate: LngLat;
}

/** To a place, keeping the zoom and the padding the camera has. */
export function flyMove(centre: LngLat, animated: boolean): FlyMove {
  return { centerCoordinate: centre, ...flight(animated) };
}

export interface RecentreMove extends Flight {
  centerCoordinate: LngLat;
  padding: CameraFitSettings['padding'];
  zoomLevel: number;
  heading: 0;
  pitch: 0;
}

/** Back to the globe's own centre, upright and flat, with the sheet's fit. */
export function recentreMove(
  centre: LngLat,
  fit: Pick<CameraFitSettings, 'padding' | 'zoomLevel'>,
  animated: boolean,
): RecentreMove {
  return {
    centerCoordinate: centre,
    padding: fit.padding,
    zoomLevel: fit.zoomLevel,
    heading: 0,
    pitch: 0,
    ...flight(animated),
  };
}

/** Country scale: how close to look, as zoom levels (the world is 512 dp wide at zoom 0). */
export const COUNTRY_ZOOM = {
  /** A country drawn from one place. */
  single: 5,
  /** Never closer than this when choosing a country (the street zoom is the traveller's). */
  max: 7,
  /** The share of the free space the country's span should fill. */
  share: 0.7,
} as const;

/** The free space above the sheet, in dp from the top of the window. */
export interface FreeBand {
  top: number;
  bottom: number;
}

const WORLD_DP = 512;

/** Radians in a degree of latitude, for the Mercator stretch at the country's latitude. */
const DEGREES = Math.PI / 180;

/** The zoom at which `degrees` of the world's width is `dp` wide on screen. */
function zoomFor(dp: number, degrees: number): number {
  return Math.log2(dp / ((degrees * WORLD_DP) / 360));
}

/**
 * How close to look at a country: the zoom at which its span (the short way round the date
 * line) fills `COUNTRY_ZOOM.share` of the window's width and of the free band's height,
 * never further out than `floor` (the planet of the sheet's fit) nor closer than the ceiling.
 */
export function countryZoom(
  focus: CountryFocus,
  windowWidth: number,
  band: FreeBand,
  floor: number,
): number {
  if (focus.bounds === null) return Math.max(COUNTRY_ZOOM.single, floor);
  const [[west, south], [east, north]] = focus.bounds;
  const stretch = Math.cos(focus.center[1] * DEGREES);
  const byWidth = zoomFor(COUNTRY_ZOOM.share * windowWidth, east - west);
  const byHeight = zoomFor(
    COUNTRY_ZOOM.share * (band.bottom - band.top) * stretch,
    north - south,
  );
  return Math.min(Math.max(Math.min(byWidth, byHeight), floor), COUNTRY_ZOOM.max);
}

export interface CountryMove extends Flight {
  centerCoordinate: LngLat;
  zoomLevel: number;
  padding: CameraFitSettings['padding'];
}

/**
 * To a country, into the free band above the sheet: the padding puts the middle of the view
 * at the middle of the band, so the country is not under the sheet at half.
 */
export function countryMove(
  focus: CountryFocus,
  band: FreeBand,
  size: { width: number; height: number },
  floor: number,
  animated: boolean,
): CountryMove {
  return {
    centerCoordinate: focus.center,
    zoomLevel: countryZoom(focus, size.width, band, floor),
    padding: {
      paddingTop: band.top,
      paddingBottom: size.height - band.bottom,
      paddingLeft: 0,
      paddingRight: 0,
    },
    ...flight(animated),
  };
}
