/**
 * Where the planet sits above the Home sheet — feature 005, T531 (FR-013, SC-018; research
 * D5-03; data-model section 7; contract C5-22).
 *
 * The camera follows the sheet ONCE per settle, never per frame. The caller measures the
 * bottom of the header and the top of the sheet, asks `globeFit` where the planet should
 * be, and hands `globeFitCamera` to `Camera.setCamera`. The rule is the prototype's
 * `cameraFor` (`ui-proto/sunrise-v2/app.js`), with `band` the height between the bottom of
 * the header and the top of the sheet:
 *
 * - **peek**: the whole planet is in view. Radius `clamp((band - 24) / 2, 110, 175)`,
 *   centred in the band, 4 dp lower, and never so wide that it comes within 20 dp of a
 *   screen edge (SC-018: the cap of 175 is the 20 dp margin on the 390 dp reference phone,
 *   so a narrower phone loses radius, not margin).
 * - **half, full**: the planet hangs from the header and the sheet covers its lower part.
 *   Radius `clamp(0.95 * band, 150, 286)`, its top 28 dp below the header. At `full` the
 *   map is hidden and the camera does not move (`globeFitCamera` answers `null`).
 *
 * Camera `padding` moves the centre of the view but does not rescale the sphere, so the
 * fit also says how far to zoom. `zoomDelta` is the base 2 logarithm of the radius over the
 * radius the planet has at the default zoom, because the planet's radius doubles with each
 * zoom level. The contract's text, `log2(freeBand / fullHeight)`, leaves out the 0.95, the
 * clamps and the margin cap that the radius rule has, and puts peek and half at the same
 * floor on every phone; this form is consistent with the radius it returns. Whether Mapbox's
 * globe really has the radius assumed below is a device check (V3, T509).
 *
 * Pure: no Mapbox, no React.
 */
import { GlobeCamera } from '@/constants/theme';
import { Motion } from '@/theme';

export type SheetDetent = 'peek' | 'half' | 'full';

export interface FitPadding {
  top: number;
  bottom: number;
  left: 0;
  right: 0;
}

export interface GlobeFit {
  /** Radius of the planet on screen, in dp. */
  radius: number;
  /** Where the middle of the planet is, in dp from the top left of the window. */
  centreX: number;
  centreY: number;
  /** Handed to the camera so the middle of the view is the middle of the planet. */
  padding: FitPadding;
  /** Added to `GlobeCamera.zoomLevel`; never takes the zoom below `minZoomLevel`. */
  zoomDelta: number;
}

/** The numbers of the rule, named. */
export const GlobeFitRules = {
  peek: { minRadius: 110, maxRadius: 175, bandAllowance: 24, centreNudge: 4 },
  other: { minRadius: 150, maxRadius: 286, bandFill: 0.95, topGap: 28 },
  /** The planet's distance to both screen edges at peek (SC-018). */
  sideMargin: 20,
} as const;

/**
 * The planet's radius in dp at `GlobeCamera.zoomLevel`: the world is 512 dp wide at zoom 0
 * and doubles per level, and a sphere's radius is its circumference over 2 pi.
 */
export const FIT_REFERENCE_RADIUS = (512 * 2 ** GlobeCamera.zoomLevel) / (2 * Math.PI);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A measurement that is not a number is no measurement: zero, so nothing downstream is NaN. */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function peekRadius(band: number, windowWidth: number): number {
  const { minRadius, maxRadius, bandAllowance } = GlobeFitRules.peek;
  const byBand = clamp((band - bandAllowance) / 2, minRadius, maxRadius);
  const byWidth = windowWidth / 2 - GlobeFitRules.sideMargin;
  return Math.min(byBand, Math.max(byWidth, minRadius));
}

function otherRadius(band: number): number {
  const { minRadius, maxRadius, bandFill } = GlobeFitRules.other;
  return clamp(bandFill * band, minRadius, maxRadius);
}

/** Padding that puts the middle of the padded view at `centreY` (never a negative inset). */
function paddingFor(centreY: number, windowHeight: number): FitPadding {
  const imbalance = 2 * centreY - windowHeight;
  return {
    top: Math.max(imbalance, 0),
    bottom: Math.max(-imbalance, 0),
    left: 0,
    right: 0,
  };
}

function zoomDeltaFor(radius: number): number {
  const lowest = GlobeCamera.minZoomLevel - GlobeCamera.zoomLevel;
  return Math.max(Math.log2(radius / FIT_REFERENCE_RADIUS), lowest);
}

/**
 * Where the planet goes for a sheet detent. `headerBottom` and `sheetTop` are measured from
 * the top of the window, in dp.
 */
export function globeFit(
  detent: SheetDetent,
  windowWidth: number,
  headerBottom: number,
  sheetTop: number,
  windowHeight: number,
): GlobeFit {
  const width = finite(windowWidth);
  const header = finite(headerBottom);
  const band = Math.max(finite(sheetTop) - header, 0);
  const peek = detent === 'peek';
  const radius = peek ? peekRadius(band, width) : otherRadius(band);
  const centreY = peek
    ? header + band / 2 + GlobeFitRules.peek.centreNudge
    : header + GlobeFitRules.other.topGap + radius;
  return {
    radius,
    centreX: width / 2,
    centreY,
    padding: paddingFor(centreY, finite(windowHeight)),
    zoomDelta: zoomDeltaFor(radius),
  };
}

/** What `Camera.setCamera` takes for a fit: the camera's own padding names. */
export interface CameraFitSettings {
  padding: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
  };
  zoomLevel: number;
  animationMode: 'easeTo' | 'moveTo';
  animationDuration: number;
}

/**
 * The camera move for a settled detent, or `null` when the camera stays where it is (at
 * `full` the map is hidden). An ease of `Motion.cameraFollowMs`, equal to the sheet's spring;
 * with `animated: false` (reduced motion) the camera jumps.
 */
export function globeFitCamera(
  detent: SheetDetent,
  fit: GlobeFit,
  { animated = true }: { animated?: boolean } = {},
): CameraFitSettings | null {
  if (detent === 'full') return null;
  return {
    padding: {
      paddingTop: fit.padding.top,
      paddingBottom: fit.padding.bottom,
      paddingLeft: fit.padding.left,
      paddingRight: fit.padding.right,
    },
    zoomLevel: GlobeCamera.zoomLevel + fit.zoomDelta,
    animationMode: animated ? 'easeTo' : 'moveTo',
    animationDuration: animated ? Motion.cameraFollowMs : 0,
  };
}
