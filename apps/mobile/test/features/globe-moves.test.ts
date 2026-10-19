/**
 * @jest-environment node
 *
 * The camera moves of the Home that are not the sheet's fit (feature 005, T537; FR-015,
 * FR-016, FR-017; research D5-03; contract C5-22 and C5-24): recentre, fly to a trip, fly to a
 * country the traveller chose in the Countries list. Pure: each is the argument of one
 * `Camera.setCamera`; the zoom and padding of the sheet's fit (`globe-fit.ts`) are an input,
 * never recomputed here, and nothing here is geometry of the arcs or the camera rules (FR-082).
 */
import { GlobeCamera } from '@/constants/theme';
import { globeFit, globeFitCamera } from '@/features/globe/globe-fit';
import {
  COUNTRY_ZOOM,
  countryMove,
  countryZoom,
  flyMove,
  recentreMove,
} from '@/features/globe/globe-moves';
import type { CountryFocus } from '@/features/passport/country-summary';

const WINDOW = { width: 390, height: 844 };
/** Half sheet 439 dp tall, a 150 dp header: the free band of the half detent. */
const BAND = { top: 150, bottom: 844 - 439 };

describe('flyMove: to a place, keeping the zoom and padding the camera has', () => {
  test('flies, taking the globe fly time', () => {
    expect(flyMove([12.5, 41.9], true)).toEqual({
      centerCoordinate: [12.5, 41.9],
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });
  });

  test('jumps under reduced motion', () => {
    expect(flyMove([12.5, 41.9], false)).toEqual({
      centerCoordinate: [12.5, 41.9],
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  });
});

describe('recentreMove: back to the planet the sheet made room for', () => {
  const fit = globeFit('half', 390, 150, 405, 844);
  const settings = globeFitCamera('half', fit)!;

  test('goes to the centre with the sheet fit, upright and flat', () => {
    expect(recentreMove([8, 40], settings, true)).toEqual({
      centerCoordinate: [8, 40],
      padding: settings.padding,
      zoomLevel: settings.zoomLevel,
      heading: 0,
      pitch: 0,
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });
  });

  test('jumps under reduced motion', () => {
    const move = recentreMove([8, 40], settings, false);
    expect(move.animationMode).toBe('moveTo');
    expect(move.animationDuration).toBe(0);
  });
});

describe('countryZoom: country scale, never further out than the planet', () => {
  const FLOOR = 1.6;
  const focus = (
    west: number,
    south: number,
    east: number,
    north: number,
  ): CountryFocus => ({
    center: [(west + east) / 2, (south + north) / 2],
    bounds: [
      [west, south],
      [east, north],
    ],
  });

  test('a country with one place is shown at the single-place zoom', () => {
    expect(
      countryZoom({ center: [103.8, 1.35], bounds: null }, WINDOW.width, BAND, FLOOR),
    ).toBe(COUNTRY_ZOOM.single);
  });

  test('a small country is closer than a large one', () => {
    const small = countryZoom(focus(-9.5, 37, -6.2, 42), WINDOW.width, BAND, FLOOR);
    const large = countryZoom(focus(-125, 25, -67, 49), WINDOW.width, BAND, FLOOR);
    expect(small).toBeGreaterThan(large);
  });

  test('is never further out than the floor, and never closer than the ceiling', () => {
    expect(countryZoom(focus(-170, -60, 170, 70), WINDOW.width, BAND, FLOOR)).toBe(FLOOR);
    expect(countryZoom(focus(12.4, 41.9, 12.41, 41.91), WINDOW.width, BAND, FLOOR)).toBe(
      COUNTRY_ZOOM.max,
    );
  });

  test('reads a span that crosses the date line the short way round', () => {
    // Fiji: 177 east to 182 (past 180), five degrees wide, not 355.
    const fiji = countryZoom(focus(177, -19, 182, -16), WINDOW.width, BAND, FLOOR);
    expect(fiji).toBeGreaterThan(COUNTRY_ZOOM.single - 1);
  });

  test('a tall country is limited by the free band, not by the width', () => {
    const tall = countryZoom(focus(-75, -55, -66, -18), WINDOW.width, BAND, FLOOR); // Chile
    const wideBand = countryZoom(
      focus(-75, -55, -66, -18),
      WINDOW.width,
      { top: 150, bottom: 700 },
      FLOOR,
    );
    expect(wideBand).toBeGreaterThan(tall);
  });
});

describe('countryMove: fly to a country into the free band above the sheet', () => {
  const portugal: CountryFocus = {
    center: [-8, 39.5],
    bounds: [
      [-9.5, 37],
      [-6.2, 42],
    ],
  };

  test('centres the country in the band between the header and the sheet', () => {
    const move = countryMove(portugal, BAND, WINDOW, 1.6, true);
    expect(move.centerCoordinate).toEqual([-8, 39.5]);
    // The middle of the padded view is the middle of the band.
    expect(move.padding).toEqual({
      paddingTop: BAND.top,
      paddingBottom: WINDOW.height - BAND.bottom,
      paddingLeft: 0,
      paddingRight: 0,
    });
    expect(move.zoomLevel).toBeGreaterThan(1.6);
  });

  test('flies, or jumps under reduced motion', () => {
    expect(countryMove(portugal, BAND, WINDOW, 1.6, true)).toMatchObject({
      animationMode: 'flyTo',
      animationDuration: GlobeCamera.flyToMs,
    });
    expect(countryMove(portugal, BAND, WINDOW, 1.6, false)).toMatchObject({
      animationMode: 'moveTo',
      animationDuration: 0,
    });
  });
});
