/**
 * The tab bars (feature 005, T524; contract C5-21): the floating pill of iOS on the surface the
 * device gives it, the same pill with Reduce Transparency on (the opaque fallback, as the
 * contrast themes and Android also get), and the Material navigation bar of Android. Each sits
 * in a bounded frame over the sky, because both are `position: absolute` at the bottom edge of
 * whatever contains them.
 *
 * The props are the shape the JS tab navigator hands a custom `tabBar`, built by hand: a
 * press selects the tab, so the selected capsule and the filled glyph can be seen moving.
 * Glass is iOS 26 only and blur is iOS only, so which one the pill draws depends on the device
 * (device check V4); the fallback frame is opaque everywhere.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AndroidNavBar } from '@/components/navigation/android-nav-bar';
import { TabPill } from '@/components/navigation/tab-pill';
import { AppearanceScope } from '@/components/ui/appearance-scope';
import { Scrim } from '@/components/ui/scrim';
import { Text } from '@/components/ui/text';

import { Frame, Section } from '../gallery-parts';

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

/** The home-indicator zone of a phone, so the bars are drawn with a real bottom inset. */
const INSET_BOTTOM = 16;
const FRAME_HEIGHT = 150;

/** The props a tab navigator passes, built by hand; pressing a tab selects it. */
function tabBarProps(
  selected: number,
  onSelect: (index: number) => void,
): BottomTabBarProps {
  const props = {
    state: {
      key: 'gallery-tabs',
      index: selected,
      routeNames: ROUTES.map((route) => route.name),
      routes: ROUTES.map(({ key, name }) => ({ key, name })),
      type: 'tab',
      stale: false,
      history: [],
      preloadedRouteKeys: [],
    },
    descriptors: Object.fromEntries(
      ROUTES.map((route) => [
        route.key,
        {
          options: { title: route.title },
          route: { key: route.key, name: route.name },
          navigation: {},
          render: () => null,
        },
      ]),
    ),
    navigation: {
      emit: () => ({ defaultPrevented: false }),
      navigate: (name: string) =>
        onSelect(
          Math.max(
            0,
            ROUTES.findIndex((route) => route.name === name),
          ),
        ),
    },
    insets: { top: 0, left: 0, right: 0, bottom: INSET_BOTTOM },
  };
  // The navigator's own types (`NavigationHelpers`, `TabNavigationState`) are far larger than
  // the part a tab bar reads, so the hand-built object is asserted rather than rebuilt.
  return props as unknown as BottomTabBarProps;
}

interface BarFrameProps {
  label: string;
  name: string;
  children: (props: BottomTabBarProps) => ReactNode;
}

function BarFrame({ label, name, children }: BarFrameProps) {
  const [selected, setSelected] = useState(0);
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {label}
      </Text>
      <Frame height={FRAME_HEIGHT} testID={`gallery-nav-${name}`}>
        <Scrim kind="sky" />
        {children(tabBarProps(selected, setSelected))}
      </Frame>
    </View>
  );
}

export function NavigationSection() {
  return (
    <Section
      id="navigation"
      title="Tab bars"
      note="Tap a tab: the capsule, the filled glyph and the heavier label move together.">
      <BarFrame label="Pill · the surface the device gives it" name="pill">
        {(props) => <TabPill {...props} />}
      </BarFrame>
      <AppearanceScope reduceTransparency>
        <BarFrame label="Pill · Reduce Transparency, opaque" name="pill-solid">
          {(props) => <TabPill {...props} />}
        </BarFrame>
      </AppearanceScope>
      <BarFrame label="Android navigation bar" name="android">
        {(props) => <AndroidNavBar {...props} />}
      </BarFrame>
    </Section>
  );
}
