/**
 * How the Home moves its ONE globe (feature 005, T537; FR-013, FR-015, FR-016, FR-019; research
 * D5-03; contracts C5-22, C5-24): the sheet's detent, the camera that follows it, the traveller's
 * fingers on the globe, the recentre control, the choice of a country, and the offsets of the
 * map's logo and attribution. Everything is event driven; nothing runs per frame.
 *
 * - **On every settle** of the sheet the camera gets `globeFitCamera` padding and zoom, once, with a
 *   280 ms ease (a jump under reduced motion); at `full` the fit is `null` and the camera stays.
 *   The sheet reports no settle for a change the parent makes, nor at mount, so the FIRST frame is
 *   fitted by the camera's own default (`initialFit`, handed to `GlobeView`: no animation), and a
 *   later change of what the fit is made of (the header grew a banner, the window changed) fits
 *   again here.
 * - **Choosing a country** lowers the sheet to half and, when the sheet has come to rest there,
 *   flies the globe to it into the free space above the sheet, in place of that settle's fit (the
 *   flight owns the camera then). The fly-to is one `setCamera` and never under the sheet.
 * - **A touch on the globe** stops the idle spin for good; a drag or a pinch means the globe was
 *   moved, which offers the recentre control (FR-015). An action of the map (next trip) or a
 *   country flight counts as moved too. Recentre flies back to the globe's own centre with the
 *   sheet's fit, upright and flat, and takes the control away again.
 * - **The ornaments**: Mapbox's logo and attribution sit 8 dp above whatever covers the bottom of
 *   the screen, the sheet at its resting detent or the card of an empty state (both stay visible,
 *   the provider's terms), and the callout may use the space between the header and that edge.
 *
 * No second map and no network: the camera handle is `GlobeView`'s own.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { GestureResponderEvent } from 'react-native';

import { cameraCenter } from '@/components/globe/arc-features';
import type { GlobeHandle } from '@/components/globe/globe-view';
import type { SheetDetent } from '@/components/ui/sheet-geometry';
import { GlobeCamera } from '@/constants/theme';
import type { GlobeTrip } from '@/features/globe/globe-data';
import {
  globeFit,
  globeFitCamera,
  type CameraFitSettings,
} from '@/features/globe/globe-fit';
import { countryMove, recentreMove } from '@/features/globe/globe-moves';
import type { LngLat } from '@/features/globe/great-circle';
import {
  calloutBounds,
  ornamentOffsets,
  sheetTopOf,
  type OrnamentOffsets,
} from '@/features/home/home-layout';
import type { CountrySummary } from '@/features/passport/country-summary';
import { useAppearance } from '@/hooks/use-appearance';

import type { HomeLayout } from './use-home-layout';

/** A finger that travels this far (dp) has dragged the globe; a tap has not. */
const MOVE_SLOP = 8;

export interface HomeCameraArgs {
  layout: HomeLayout;
  trips: readonly GlobeTrip[];
  focus: readonly string[];
  /** The sheet is drawn. Otherwise a card is (or nothing), and the globe is fitted as at half. */
  sheetShown: boolean;
  /** With no sheet: the height of the card that covers the bottom, tab zone and margin included. */
  cardCovered: number;
}

export interface HomeCamera {
  handle: RefObject<GlobeHandle | null>;
  /** Where the sheet is going, and where it last came to rest. */
  detent: SheetDetent;
  setDetent: (detent: SheetDetent) => void;
  settled: SheetDetent;
  onSettle: (detent: SheetDetent) => void;
  /** The first frame's fit: the camera's default padding and zoom. */
  initialFit: Pick<CameraFitSettings, 'padding' | 'zoomLevel'>;
  /** The globe's own centre: where the camera opens and where recentre goes. */
  centre: LngLat;
  touched: boolean;
  moved: boolean;
  touchProps: {
    onTouchStart: (event: GestureResponderEvent) => void;
    onTouchMove: (event: GestureResponderEvent) => void;
  };
  markMoved: () => void;
  recentre: () => void;
  selectCountry: (country: CountrySummary) => void;
  ornaments: OrnamentOffsets;
  calloutArea: { top: number; bottom: number };
}

/** Keeps the latest closure where a stable effect can call it. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The first touch stops the spin for good; a drag or a pinch means the globe was moved. */
function useGlobeTouch() {
  const [touched, setTouched] = useState(false);
  const [moved, setMoved] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = ({ nativeEvent }: GestureResponderEvent) => {
    start.current = { x: nativeEvent.pageX, y: nativeEvent.pageY };
    setTouched(true);
    if (nativeEvent.touches.length > 1) setMoved(true);
  };
  const onTouchMove = ({ nativeEvent }: GestureResponderEvent) => {
    const from = start.current;
    if (moved || from === null) return;
    const far = Math.hypot(nativeEvent.pageX - from.x, nativeEvent.pageY - from.y);
    if (far > MOVE_SLOP || nativeEvent.touches.length > 1) setMoved(true);
  };
  const markMoved = () => {
    setTouched(true);
    setMoved(true);
  };
  return {
    touched,
    moved,
    touchProps: { onTouchStart, onTouchMove },
    markMoved,
    clearMoved: () => setMoved(false),
  };
}

/** Peek and half have a fit; at full the map is hidden and the half fit is the one to go back to. */
const fitDetentOf = (detent: SheetDetent): Exclude<SheetDetent, 'full'> =>
  detent === 'full' ? 'half' : detent;

type Handle = RefObject<GlobeHandle | null>;

/** Where the planet goes at a detent, and the two moves that put the camera there. */
function useFitting(layout: HomeLayout, handle: Handle, animated: boolean) {
  const { width, height, headerBottom, detents } = layout;
  const fitOf = (at: SheetDetent) =>
    globeFit(at, width, headerBottom ?? 0, sheetTopOf(height, detents[at]), height);
  const applyFit = (at: SheetDetent) => {
    const settings = globeFitCamera(at, fitOf(at), { animated });
    if (settings !== null) handle.current?.setCamera(settings);
  };
  const flyToCountry = (country: CountrySummary, at: SheetDetent) => {
    const band = { top: headerBottom ?? 0, bottom: sheetTopOf(height, detents[at]) };
    const floor = GlobeCamera.zoomLevel + fitOf(at).zoomDelta;
    handle.current?.setCamera(
      countryMove(country.focus, band, { width, height }, floor, animated),
    );
  };
  return { fitOf, applyFit, flyToCountry };
}

/**
 * The fit is made of the window, the header's edge and the sheet's heights: if one of them changes
 * under a settled sheet (a banner arrived, the window turned) the planet is fitted again. The
 * first measure is not a change: the camera opened with it (`initialFit`).
 */
function useRefit(layout: HomeLayout, refit: () => void) {
  const { width, height, headerBottom, detents } = layout;
  const latest = useLatest(refit);
  const key = `${width}|${height}|${headerBottom}|${detents.peek}|${detents.half}`;
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (headerBottom === null) return;
    const before = fitted.current;
    fitted.current = key;
    if (before !== null && before !== key) latest.current();
  }, [key, headerBottom, latest]);
}

type Fitting = ReturnType<typeof useFitting>;

/**
 * What a settle does, and what choosing a country does. A country chosen in the list is remembered
 * and flown to when the sheet has come to rest, in place of that settle's fit; any other settle
 * fits the planet to the detent (nothing at full).
 */
function useSettling(
  fitting: Fitting,
  actions: {
    setSettled: (detent: SheetDetent) => void;
    setDetent: (detent: SheetDetent) => void;
    markMoved: () => void;
  },
) {
  const pending = useRef<CountrySummary | null>(null);
  const onSettle = (at: SheetDetent) => {
    actions.setSettled(at);
    const country = pending.current;
    pending.current = null;
    if (country !== null && at !== 'full') fitting.flyToCountry(country, at);
    else fitting.applyFit(at);
  };
  const selectCountry = (country: CountrySummary) => {
    pending.current = country;
    actions.markMoved();
    actions.setDetent('half');
  };
  return { onSettle, selectCountry };
}

/** The logo and attribution above what covers the bottom, and the callout's free space. */
function useOrnaments(layout: HomeLayout, covered: number) {
  const { height, headerBottom } = layout;
  const ornaments = useMemo(() => ornamentOffsets(covered), [covered]);
  const calloutArea = useMemo(
    () => calloutBounds(headerBottom ?? 0, sheetTopOf(height, covered)),
    [headerBottom, height, covered],
  );
  return { ornaments, calloutArea };
}

export function useHomeCamera({
  layout,
  trips,
  focus,
  sheetShown,
  cardCovered,
}: HomeCameraArgs): HomeCamera {
  const animated = !useAppearance().prefersLessMotion;
  const handle = useRef<GlobeHandle>(null);
  const [detent, setDetent] = useState<SheetDetent>('half');
  const [settled, setSettled] = useState<SheetDetent>('half');
  const touch = useGlobeTouch();
  const fitting = useFitting(layout, handle, animated);
  const centre = useMemo(
    () => cameraCenter(trips, focus) ?? GlobeCamera.fallbackCenter,
    [trips, focus],
  );
  const resting: SheetDetent = sheetShown ? settled : 'half';
  useRefit(layout, () => fitting.applyFit(resting));
  const { onSettle, selectCountry } = useSettling(fitting, {
    setSettled,
    setDetent,
    markMoved: touch.markMoved,
  });

  const fitAt = fitDetentOf(resting);
  const recentre = () => {
    const fit = globeFitCamera(fitAt, fitting.fitOf(fitAt), { animated })!;
    handle.current?.setCamera(recentreMove(centre, fit, animated));
    touch.clearMoved();
  };
  const first = globeFitCamera(fitAt, fitting.fitOf(fitAt), { animated: false })!;
  const covered = sheetShown ? layout.detents[settled] : cardCovered;

  return {
    handle,
    detent,
    setDetent,
    settled,
    onSettle,
    initialFit: { padding: first.padding, zoomLevel: first.zoomLevel },
    centre,
    touched: touch.touched,
    moved: touch.moved,
    touchProps: touch.touchProps,
    markMoved: touch.markMoved,
    recentre,
    selectCountry,
    ...useOrnaments(layout, covered),
  };
}
