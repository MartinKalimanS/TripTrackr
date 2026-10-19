/**
 * @jest-environment node
 *
 * The words for the globe (feature 003 FR-045; feature 005 FR-081: unchanged). A screen reader
 * cannot enter a native map, so this one summary is the globe, and it must not claim trips the
 * map is not showing.
 */
import type { GlobeTrip } from '@/features/globe/globe-data';
import type { GlobeData } from '@/features/globe/use-globe';

import { describeGlobe } from '../describe-globe';

const trip = (id: string): GlobeTrip => ({ id, title: id, status: 'past', stops: [] });

const data = (trips: GlobeTrip[], countriesVisited: number): GlobeData => ({
  trips,
  focus: [],
  summary: { countriesVisited, distanceKm: 0 },
});

test('an empty globe says so and points at the Trips tab', () => {
  expect(describeGlobe(data([], 0), false)).toBe(
    'Globe with nothing drawn yet. Your trips are listed in the Trips tab.',
  );
});

test('a drawn globe counts its trips and countries, in the singular where it must', () => {
  expect(describeGlobe(data([trip('a'), trip('b')], 1), true)).toBe(
    'Globe showing 2 trips across 1 country. Every trip is also listed in the Trips tab.',
  );
  expect(describeGlobe(data([trip('a')], 3), true)).toBe(
    'Globe showing 1 trip across 3 countries. Every trip is also listed in the Trips tab.',
  );
});
