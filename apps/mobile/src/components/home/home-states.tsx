/**
 * The Home's two states that are not the globe with its sheet (feature 005, T537; contract
 * C5-32 "Home"; FR-020, FR-021): the loading skeleton, and the slot at the bottom of the screen
 * that holds the invitation or the notice.
 *
 * - `HomeLoading`: while the local store has not answered, a disc where the globe will be and a
 *   skeleton sheet, with the greeting of the previous session (the signed-in traveller's name,
 *   which the session store holds from the keychain). It is ONE announced "Loading your globe"
 *   region on the `home-screen` scaffold over the sky, and it is never the empty state (C5-31
 *   rule 2). The globe is not mounted: a camera's starting position is read once, and it must
 *   open on the traveller's own trips.
 * - `BottomCard`: the invitation (no trips, or no stop yet) and the unreadable-store notice float
 *   over the globe, 20 dp from the sides and 16 dp above the tab pill. The slot reports its height
 *   so the map's logo and attribution can stand above it (they are never hidden).
 */
import { useContext, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Scrim } from '@/components/ui/scrim';
import { HomeSkeleton } from '@/components/ui/screen-skeletons';
import { skeletonDisc } from '@/features/home/home-layout';
import { ScreenMargin, Space } from '@/theme';

import { useHomeLayout } from './use-home-layout';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export function HomeLoading({ name }: { name: string | null }) {
  const { height, width } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const { detents } = useHomeLayout();
  const { discRadius, discCentreY } = skeletonDisc(width, height, insets.top, detents);
  return (
    <View testID="home-screen" className="flex-1 bg-background">
      <Scrim kind="sky" />
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <HomeSkeleton
          discRadius={discRadius}
          discCentreY={discCentreY - insets.top}
          greetingName={name?.trim() || undefined}
        />
      </View>
    </View>
  );
}

export function BottomCard({
  bottom,
  onHeight,
  children,
}: {
  /** The tab zone: the card floats 16 dp above it. */
  bottom: number;
  onHeight: (height: number) => void;
  children: ReactNode;
}) {
  return (
    <View
      testID="home-bottom-card"
      pointerEvents="box-none"
      onLayout={({ nativeEvent }: LayoutChangeEvent) =>
        onHeight(Math.round(nativeEvent.layout.height))
      }
      style={[styles.card, { bottom: bottom + Space[4] }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: {
    position: 'absolute',
    left: ScreenMargin.default,
    right: ScreenMargin.default,
  },
});
