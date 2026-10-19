/**
 * The Home, composed (feature 005, T537; contract C5-32 "Home"; FR-010 to FR-021, FR-081,
 * FR-082; research D5-03, D5-04): ONE globe fills the screen over a warm (or night) sky; a
 * transparent header zone (greeting, sync chip, banner) sits over its top; the sheet floats over
 * its lower part with three detents; "Plan a trip" floats above the tab pill. Layers, bottom up:
 * sky, globe (pins and callout inside it), header, sheet or card, button, the pill.
 *
 * - The globe is ALWAYS here (feature 003): with no trips, with trips but no stop and when the
 *   store cannot be read, a card floats over it instead (`InvitationCard`, `GlobeNotice`) in the
 *   place of the sheet. While loading the screen is the skeleton (`HomeLoading`), not this.
 * - The camera follows the sheet (`useHomeCamera`): the first frame already fitted, a 280 ms ease
 *   on every settle, the logo and the attribution kept above the sheet. The map mounts when the
 *   header has been measured, which is what the planet is fitted under.
 * - The globe turns slowly while idle (`useIdleSpin`, FR-019) and is usable without dragging or
 *   sight (`useGlobeActions`, FR-017): next trip, previous trip, recentre, open countries.
 * - Reading order is the header, the globe, then the sheet or card (the header is first in the
 *   tree and stacked over the globe by `zIndex`). `home-overlay` is the transparent layer that
 *   holds the header and lets every other touch through to the map.
 * - ONE "Plan a trip" button when trips exist (collapsed to its plus at peek, hidden at full);
 *   with none, the invitation carries the action and the button is not drawn (FR-018).
 *
 * Read-only: the screen reads the traveller's own local records (FR-084), writes nothing and
 * makes no request. Every id of the feature 003 screen survives (FR-081).
 */
import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GlobeNotice } from '@/components/globe/empty-state';
import { GlobeView, type LiveTrip } from '@/components/globe/globe-view';
import { useGlobeActions, type GlobeActions } from '@/components/globe/use-globe-actions';
import { useIdleSpin } from '@/components/globe/use-idle-spin';
import { PlanTripFab, planTripFabHidden } from '@/components/ui/plan-trip-fab';
import { Scrim } from '@/components/ui/scrim';
import {
  globeInvitation,
  hasPlacedStop,
  type GlobeInvitation,
  type GlobeTrip,
} from '@/features/globe/globe-data';
import { idleSpinAllowed } from '@/features/globe/idle-spin';
import type { GlobeData } from '@/features/globe/use-globe';
import { describeGlobe } from '@/features/home/describe-globe';
import { liveLine } from '@/features/home/home-copy';
import type { HomeTrip, HomeTrips } from '@/features/home/home-trips';
import type { CountryOverview } from '@/features/passport/use-country-overview';
import { useAppActive } from '@/hooks/use-app-active';
import { useAppearance } from '@/hooks/use-appearance';
import { Space } from '@/theme';

import { HomeHeader } from './home-header';
import { HomeSheet } from './home-sheet';
import { BottomCard } from './home-states';
import { InvitationCard } from './invitation-card';
import { useHomeCamera, type HomeCamera } from './use-home-camera';
import { useHomeLayout, type HomeLayout } from './use-home-layout';

export interface HomeGlobeProps {
  data: GlobeData;
  /** One calendar day for the whole screen, so statuses and the resting stop agree. */
  today: string;
  /** The local store could not be read: a notice floats over the globe. */
  failed: boolean;
  home: HomeTrips;
  /** The local cover picture of each trip, for the pins' roundels (when switched on). */
  covers: Readonly<Record<string, string>>;
  overview: CountryOverview;
  /** The traveller's name for the greeting. */
  name: string | null;
}

/** The live trip the callout names, when it is on the globe: "Day 3 of 8 · Sintra". */
function liveTripOf(
  now: HomeTrip | null,
  trips: readonly GlobeTrip[],
): LiveTrip | undefined {
  if (now === null || now.status !== 'active') return undefined;
  const onGlobe = trips.some((trip) => trip.id === now.id && hasPlacedStop(trip));
  return onGlobe
    ? { tripId: now.id, title: now.title, detail: liveLine(now) }
    : undefined;
}

/** Where the card's one action goes (feature 003 FR-002). */
function invitationAction(
  router: ReturnType<typeof useRouter>,
  invitation: GlobeInvitation,
): () => void {
  if (invitation.reason === 'no-trips') return () => router.push('/modal/add-trip');
  const { tripId } = invitation;
  return tripId ? () => router.push(`/trip/${tripId}`) : () => router.navigate('/trips');
}

/** The idle spin and the map's actions: both follow the camera's state and nothing per frame. */
function useGlobeMotion(
  props: HomeGlobeProps,
  camera: HomeCamera,
  layout: HomeLayout,
  sheetShown: boolean,
  calloutShowing: boolean,
) {
  const { prefersLessMotion } = useAppearance();
  const focused = useIsFocused();
  const foreground = useAppActive();
  useIdleSpin({
    handle: camera.handle,
    origin: camera.centre,
    enabled: idleSpinAllowed({
      mounted: layout.headerBottom !== null,
      touched: camera.touched,
      detent: sheetShown ? camera.detent : 'half',
      prefersLessMotion,
      foreground,
      focused,
      calloutShowing,
    }),
  });
  return useGlobeActions({
    trips: props.data.trips,
    focus: props.data.focus,
    today: props.today,
    handle: camera.handle,
    animated: !prefersLessMotion,
    onRecentre: camera.recentre,
    onOpenCountries: () => {
      if (sheetShown) camera.setDetent('full');
    },
    onMoved: camera.markMoved,
  });
}

interface LayerProps {
  props: HomeGlobeProps;
  layout: HomeLayout;
  camera: HomeCamera;
  live: LiveTrip | undefined;
  actions: GlobeActions;
}

/**
 * The globe, with the traveller's touches noted on the way past (`onTouchStart`, `onTouchMove`
 * bubble up from the native map without taking it from the map). It mounts once the header has
 * been measured, so its first frame is already fitted under it.
 */
function GlobeLayer({ props, layout, camera, live, actions }: LayerProps) {
  const { data, today, covers } = props;
  const { handle, touchProps, ornaments, calloutArea, initialFit } = camera;
  return (
    <View testID="home-globe" style={StyleSheet.absoluteFill} {...touchProps}>
      {layout.headerBottom === null ? null : (
        <GlobeView
          ref={handle}
          trips={data.trips}
          focus={data.focus}
          today={today}
          accessibilityLabel={describeGlobe(data, data.trips.some(hasPlacedStop))}
          {...ornaments}
          liveTrip={live}
          calloutArea={calloutArea}
          covers={covers}
          initialFit={initialFit}
          {...actions}
        />
      )}
    </View>
  );
}

/** The card over the globe in the sheet's place: the invitation, or the unreadable-store notice. */
function FloatingCard({
  invitation,
}: {
  /** `null`: the store could not be read. */
  invitation: GlobeInvitation | null;
}) {
  const router = useRouter();
  if (invitation === null) {
    return (
      <GlobeNotice
        title="Couldn’t read your trips"
        detail="The local store did not answer. Restarting the app usually clears this."
      />
    );
  }
  return (
    <InvitationCard
      reason={invitation.reason}
      tripTitle={invitation.reason === 'no-stops' ? invitation.tripTitle : undefined}
      onAction={invitationAction(router, invitation)}
    />
  );
}

export function HomeGlobe(props: HomeGlobeProps) {
  const { data, failed, home, overview, name, today } = props;
  const router = useRouter();
  const layout = useHomeLayout();
  const invitation = failed ? null : globeInvitation(data.trips);
  const sheetShown = !failed && invitation === null;
  const [cardHeight, setCardHeight] = useState(0);
  const camera = useHomeCamera({
    layout,
    trips: data.trips,
    focus: data.focus,
    sheetShown,
    cardCovered: layout.tabZone + Space[4] + cardHeight,
  });
  const live = liveTripOf(home.now, data.trips);
  const actions = useGlobeMotion(props, camera, layout, sheetShown, live !== undefined);
  const full = sheetShown && camera.detent === 'full';

  return (
    <View testID="home-screen" className="flex-1 bg-background">
      <Scrim kind="sky" />
      <View testID="home-overlay" pointerEvents="box-none" style={styles.overlay}>
        {full ? null : (
          <HomeHeader
            name={name}
            today={today}
            moved={camera.moved}
            onRecentre={camera.recentre}
            onMeasured={layout.setHeaderBottom}
          />
        )}
      </View>
      <GlobeLayer
        props={props}
        layout={layout}
        camera={camera}
        live={live}
        actions={actions}
      />
      {sheetShown ? (
        <HomeSheet
          {...home}
          detents={layout.detents}
          detent={camera.detent}
          onDetentChange={camera.setDetent}
          onSettle={camera.onSettle}
          tabZone={layout.tabZone}
          overview={overview}
          onOpenTrip={(tripId) => router.push(`/trip/${tripId}`)}
          onOpenTrips={() => router.navigate('/trips')}
          onSelectCountry={camera.selectCountry}
        />
      ) : (
        <BottomCard bottom={layout.tabZone} onHeight={setCardHeight}>
          <FloatingCard invitation={invitation} />
        </BottomCard>
      )}
      <PlanTripFab
        screen="home"
        onPress={() => router.push('/modal/add-trip')}
        bottomInset={layout.tabZone}
        collapsed={camera.detent === 'peek'}
        hidden={
          !sheetShown ||
          planTripFabHidden({ tripCount: data.trips.length, sheetFull: full })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // The header's layer: stacked over the globe, and transparent to every other touch.
  overlay: { ...StyleSheet.absoluteFill, zIndex: 1 },
});
