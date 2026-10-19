/**
 * Home - the globe (T099; FR-045, FR-050, FR-051; research D-30; feature 003; recomposed by
 * feature 005, T537: contract C5-32 "Home", FR-010 to FR-021, research D5-03 and D5-04).
 *
 * The traveller's own trips as connections on ONE 3D globe, read from the encrypted local store
 * (Constitution II): no network is needed to open it. The globe is ALWAYS here (feature 003
 * FR-001): with no trips, with trips but no stop, and when the store cannot be read, a card
 * floats over it (an invitation, or a plain notice). Over it, a transparent header (greeting,
 * the one sync chip, the offline or sync-failed banner), a sheet of three positions (the figures
 * and the live trip, the live trip alone, the Countries list), and "Plan a trip" above the tab
 * pill. The camera follows the sheet, the globe turns slowly while idle and offers actions to a
 * traveller who cannot drag or see (`components/home/home-globe.tsx` has the composition).
 *
 * Only the brief wait for the local store is not the globe: a skeleton (a disc and a sheet, the
 * greeting of the last session), because a camera's starting position is read once and the
 * globe must open on the traveller's own trips. The trip list lives on the Trips tab, which is
 * also the accessible path to every trip the map shows.
 *
 * Visibility posture: private, local, never transmitted, nothing new stored (FR-084). The globe,
 * the figures, the live trip and the Countries list read the signed-in traveller's own local
 * rows, and no other person's content is shown.
 */
import { HomeGlobe } from '@/components/home/home-globe';
import { HomeLoading } from '@/components/home/home-states';
import { useSessionStore } from '@/features/auth/session-store';
import { useGlobe } from '@/features/globe/use-globe';
import { useHomeTrips } from '@/features/home/use-home-trips';
import { useCountryOverview } from '@/features/passport/use-country-overview';
import { todayIso } from '@/features/trips/stop-dates';

export default function HomeScreen() {
  // One calendar day for the whole screen: the statuses and the beacon's resting stop must
  // agree, even across midnight.
  const today = todayIso();
  const globe = useGlobe(today);
  const home = useHomeTrips(today);
  const overview = useCountryOverview(globe.data.trips, today);
  const name = useSessionStore((state) => state.user?.display_name ?? null);

  const failed = globe.error !== null;
  // A failure is shown over the globe, never as an endless wait; the rest wait for the store.
  const loading = !failed && (globe.loading || home.loading || overview.loading);
  if (loading) return <HomeLoading name={name} />;

  return (
    <HomeGlobe
      data={globe.data}
      today={today}
      failed={failed}
      home={home.data}
      covers={home.covers}
      overview={overview.data}
      name={name}
    />
  );
}
