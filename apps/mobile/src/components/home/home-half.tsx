/**
 * `HomeHalf` - what the Home sheet shows at its middle detent (feature 005, T535; contract
 * C5-23; FR-014): the three figures, the live trip (else the next planned one) and, beneath a
 * live trip, the next planned one, 16 dp apart.
 *
 *   <HomeHalf totals={overview.totals} now={trips.now} next={trips.next}
 *     onOpenCountries={() => setDetent('full')} onOpenTrips={() => router.navigate('/trips')}
 *     onOpenTrip={(id) => router.push(`/trip/${id}`)} />
 *
 * It is a composition of `StatsRow`, `NowCard` and `NextRow` and owns nothing but their order and
 * the gap: what is shown, and what a press does, is the parent's. With no trip to show it is
 * the figures alone.
 */
import { View } from 'react-native';

import type { HomeTrip } from '@/features/home/home-trips';

import { NextRow } from './next-row';
import { NowCard } from './now-card';
import { StatsRow } from './stats-row';

export interface HomeHalfProps {
  totals: { countries: number; trips: number; distanceKm: number };
  now: HomeTrip | null;
  next: HomeTrip | null;
  onOpenCountries: () => void;
  onOpenTrips: () => void;
  onOpenTrip: (tripId: string) => void;
}

export function HomeHalf({
  totals,
  now,
  next,
  onOpenCountries,
  onOpenTrips,
  onOpenTrip,
}: HomeHalfProps) {
  return (
    <View testID="home-half" className="gap-4">
      <StatsRow
        countries={totals.countries}
        trips={totals.trips}
        distanceKm={totals.distanceKm}
        onOpenCountries={onOpenCountries}
        onOpenTrips={onOpenTrips}
      />
      {now === null ? null : <NowCard trip={now} onPress={() => onOpenTrip(now.id)} />}
      {next === null ? null : <NextRow trip={next} onPress={() => onOpenTrip(next.id)} />}
    </View>
  );
}
