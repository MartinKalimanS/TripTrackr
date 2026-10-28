/**
 * `HomeHeader` - the transparent zone over the globe (feature 005, T537; contract C5-32 "Home";
 * FR-014, FR-015, FR-021, FR-026): the greeting with the date and, at the right, the tools
 * (`HomeTools`: the ONE global sync chip and the coming-soon search button); under them
 * the ONE `SyncStatusBanner` (a slim, non-blocking note when the phone is offline or a sync
 * failed), and, only after the traveller has moved the globe, a recentre
 * control below it.
 *
 *   <HomeHeader name={user.display_name} today={today} moved={moved} onRecentre={recentre}
 *     onMeasured={setHeaderBottom} />
 *
 * The zone is `absolute` over the whole top of the screen, with `pointerEvents="box-none"`, so
 * a touch anywhere outside the greeting, the tools and the banner reaches the globe. It reports
 * where it ENDS in whole dp (`onMeasured`, from its own layout): the globe is fitted to the free
 * space under that edge (`globeFit`, FR-013), and fitted again if the banner comes or goes. The
 * recentre control is drawn BELOW that edge and takes no room in the zone (an absolute slot at
 * `top: 100%`, 20 dp under the edge as the prototype draws it), so it appearing never moves
 * the planet.
 *
 * The chip and the banner are the global ones of `components/sync/sync-status.tsx`: both read
 * the one derived state, so a screen shows one answer to one question and nothing here queries
 * or writes. The Home leaves the whole zone out at the full detent (the Countries list covers
 * it), which is the parent's decision (`contracts/screens.md`). Ids: `home-header`,
 * `home-recentre-slot`; the greeting's, the chip's and the banner's are their own.
 *
 * `GreetingHeader.onRecentre` is deliberately not used: that control sits IN the greeting's
 * layout, which would make the measured edge move when it appears.
 *
 * As the pictures place things: `banner={false}` leaves the banner out (the half sheet carries
 * it at the top, `home-offline.png`; at peek and in the states with no sheet it stays here).
 */
import { useContext } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/icon-button';
import { SyncStatusBanner } from '@/components/sync/sync-status';
import { ScreenMargin, Space } from '@/theme';

import { GreetingHeader } from './greeting-header';
import { HomeTools } from './home-tools';

export interface HomeHeaderProps {
  /** The traveller's name; blank or `null` greets without one. */
  name: string | null;
  /** The local calendar day, YYYY-MM-DD. */
  today: string;
  /** The traveller has moved the globe: the recentre control is offered. */
  moved: boolean;
  onRecentre: () => void;
  /** Where the zone ends, in dp from the top of the window, whenever it is laid out. */
  onMeasured: (bottom: number) => void;
  /** Draw the offline or sync-failed banner here. Default true. */
  banner?: boolean;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export function HomeHeader({
  name,
  today,
  moved,
  onRecentre,
  onMeasured,
  banner = true,
}: HomeHeaderProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const onLayout = ({ nativeEvent }: LayoutChangeEvent) =>
    onMeasured(Math.round(nativeEvent.layout.y + nativeEvent.layout.height));

  return (
    <View
      testID="home-header"
      pointerEvents="box-none"
      onLayout={onLayout}
      style={[styles.zone, { paddingTop: insets.top }]}>
      <GreetingHeader name={name} today={today} trailing={<HomeTools />} />
      {banner ? <SyncStatusBanner /> : null}
      {moved ? (
        <View testID="home-recentre-slot" style={styles.recentre}>
          <IconButton
            icon="locate"
            variant="onSky"
            accessibilityLabel="Recentre the globe"
            onPress={onRecentre}
            testID="home-recentre"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: ScreenMargin.default,
    paddingBottom: Space[2],
    gap: Space[3],
  },
  // Below the zone, at the left margin; not in its layout.
  recentre: {
    position: 'absolute',
    top: '100%',
    left: ScreenMargin.default,
    marginTop: Space[5],
  },
});
