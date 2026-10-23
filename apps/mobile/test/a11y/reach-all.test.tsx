/**
 * T560 - every country and every trip is reachable with a screen reader (feature 005; FR-016,
 * FR-017, SC-015; contract C5-23, C5-24): over a 30-country, 30-trip fixture, the Countries list
 * of the Home sheet exposes EVERY country as an accessible node named
 * "Land AA, 2 trips, last visited Oct 2026", under its continent heading, and is not virtualised
 * away from assistive technology; the globe's "Next trip" and "Previous trip" visit every trip
 * that has a place on the map; "Open countries" raises the list. The trips themselves are listed
 * in `order-trips.test.tsx` (the same guarantee for the Trips tab).
 *
 * A list recycles what is off screen. A screen reader walks what is mounted, so while one is on
 * the list keeps its rows mounted (`useReachAll`); with none, the list stays virtualised, which
 * is what keeps a long passport light.
 */
import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { CountriesList } from '@/components/home/countries-list';
import { GLOBE_ACTIONS } from '@/components/globe/use-globe-actions';
import type { GlobeTrip } from '@/features/globe/globe-data';
import { placedTrips, stepTrip, type TripPlace } from '@/features/globe/globe-actions';

import { accessibleNodes, exposedArt, unnamed } from '../helpers/a11y-nodes';
import { appearance } from '../helpers/appearance';
import {
  CONTINENTS,
  manyCountries,
  overviewOf,
  rowLabel,
} from '../helpers/country-fixture';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const COUNTRIES = manyCountries(30);
const overview = () => overviewOf(COUNTRIES);

const list = () => (
  <CountriesList
    overview={overview()}
    onSelectCountry={jest.fn()}
    onCollapse={jest.fn()}
  />
);

/** Renders, then lets the screen reader query and FlashList's first-load timer settle. */
async function show(screenReader: boolean) {
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(screenReader);
  await render(list());
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
}

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
});
afterEach(() => {
  jest.restoreAllMocks();
});

const rowNames = () =>
  accessibleNodes()
    .filter((node) => node.id?.startsWith('country-row-'))
    .map((node) => node.name);

describe('The Countries list with a screen reader on (SC-015)', () => {
  test('exposes all 30 countries, each by its accessible name', async () => {
    await show(true);
    expect(rowNames()).toHaveLength(30);
    for (const country of COUNTRIES) {
      expect(rowNames()).toContain(rowLabel(country));
    }
  });

  test('each continent is one heading with its count, before its countries', async () => {
    await show(true);
    const nodes = accessibleNodes();
    const headings = nodes.filter((node) => node.role === 'header' && node.id);
    expect(headings.map((node) => node.name)).toEqual(
      [...CONTINENTS].sort().map((name) => `${name}, 5 countries`),
    );
    for (const heading of headings) {
      const at = nodes.indexOf(heading);
      expect(nodes[at + 1]?.id?.startsWith('country-row-')).toBe(true);
    }
  });

  test('every row is a button with a hint, and no control or drawing is left unnamed or exposed', async () => {
    await show(true);
    const nodes = accessibleNodes();
    expect(
      nodes
        .filter((node) => node.id?.startsWith('country-row-'))
        .every((node) => node.role === 'button' && node.hint === 'Shows it on the globe'),
    ).toBe(true);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});

describe('The Countries list with no screen reader', () => {
  test('stays virtualised: not every row is mounted (a long passport stays light)', async () => {
    await show(false);
    expect(rowNames().length).toBeLessThan(30);
  });
});

describe("The globe's actions reach every trip (FR-017)", () => {
  const trips: GlobeTrip[] = Array.from({ length: 30 }, (_, index) => ({
    id: `trip-${String(index).padStart(2, '0')}`,
    title: `Trip ${index}`,
    status: 'past' as const,
    stops: [
      {
        id: `stop-${index}`,
        cityId: index,
        countryId: index,
        arriveDate: `2020-01-${String(1 + (index % 28)).padStart(2, '0')}`,
        departDate: `2020-01-${String(1 + (index % 28)).padStart(2, '0')}`,
        // Three trips have no place on the map: they are listed in the Trips tab instead.
        coordinate: index % 10 === 9 ? null : [index, index / 2],
      },
    ],
  }));

  test('"Next trip" visits every trip that has a place, once, and wraps round', () => {
    const places = placedTrips(trips, '2026-10-14');
    expect(places).toHaveLength(27);
    const seen: string[] = [];
    let current: string | null = null;
    for (let step = 0; step < places.length; step += 1) {
      const next: TripPlace = stepTrip(places, current, 1)!;
      seen.push(next.tripId);
      current = next.tripId;
    }
    expect(new Set(seen).size).toBe(27);
    expect(stepTrip(places, current, 1)!.tripId).toBe(seen[0]);
  });

  test('"Previous trip" walks the same trips the other way', () => {
    const places = placedTrips(trips, '2026-10-14');
    const forward: string[] = [];
    let current: string | null = null;
    for (let step = 0; step < places.length; step += 1) {
      current = stepTrip(places, current, 1)!.tripId;
      forward.push(current);
    }
    const backward: string[] = [];
    current = null;
    for (let step = 0; step < places.length; step += 1) {
      current = stepTrip(places, current, -1)!.tripId;
      backward.push(current);
    }
    expect(backward).toEqual([...forward].reverse());
  });

  test('the four actions of the map are named for a reader', () => {
    expect(GLOBE_ACTIONS.map((action) => action.label)).toEqual([
      'Next trip',
      'Previous trip',
      'Recentre the globe',
      'Open countries',
    ]);
  });
});
