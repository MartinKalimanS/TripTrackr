/**
 * `TabPill` - the floating tab bar, on iOS and Android (feature 005, contract C5-21, research D5-05; FR-022,
 * FR-023, FR-024, FR-027, FR-071), over the JS `Tabs` navigator's custom `tabBar`
 * (https://docs.expo.dev/router/advanced/tabs.md; 001 D-17, 004 D4-06). It receives the
 * `BottomTabBarProps` the navigator passes and replaces the flat strip of feature 004.
 *
 * - FLOATS. The bar is absolute, 16 dp from both sides, its bottom edge `max(inset - 10, 12)`
 *   (`pillBottomOffset`), so it clears the home indicator. It takes no space in the
 *   navigator's column: the scenes fill the screen and run UNDER it (verified in the
 *   installed navigator, `BottomTabView`: `[screens (flex: 1), tabBar]` in a column, an
 *   absolute bar adds no height). The container is `box-none`, so the globe pans around the
 *   pill and not through it.
 * - TELLS SCENES how much to keep clear. It reports `height + bottomOffset` through
 *   `BottomTabBarHeightCallbackContext` from its `onLayout` (88 dp on a 390 by 844 phone);
 *   a scene reads it as `useBottomTabBarHeight()` (`hooks/use-tab-inset.ts` adds the 16 dp of
 *   FR-024). The pill is 64 dp tall as a MINIMUM, padded 6 with 4 between tabs, and grows with
 *   the text size.
 * - FADE. A 48 dp fade of the ground (`Scrim kind="fade"`, the only gradient consumer) sits
 *   under the pill across the bottom edge, so content scrolls beneath it softly (FR-022). Its
 *   ground is the canvas the lists are painted with, and the surface of the sheet on Home.
 * - SURFACE. `TabSurface` is glass on iOS 26, a blur before it, and opaque where transparency
 *   is reduced or contrast increased (`tabSurface()`); nothing here animates an opacity.
 * - SELECTION is a tinted capsule behind the tab (`TabCapsule`, id `tab-mark-<name>`, one
 *   spring), the FILLED variant of the icon and the ink (the others are outline and muted),
 *   so it survives greyscale and is never colour alone. The label is DM Sans 600 at 12 / 14
 *   in every state (the prototype's `.tab`: `label` strong, sized by `PillMetrics`), capped
 *   at 1.3 times (Q-1), and it wraps instead of clipping; the tab is at least 52 dp tall (the
 *   inside of the pill) and grows with its content.
 * - EACH TAB is a `Tappable`: touch target, pressed fill (a capsule here), focus ring and the
 *   name come from it. It is announced as a `tab` named by the route's label, `selected` for
 *   the focused one, inside a `tablist`. Press behaviour is React Navigation's (`tabPress`,
 *   then navigate; `tabLongPress`): `tab-shared.ts`. A press that changes the tab plays the
 *   selection haptic (`tabChange`); one on the focused tab or one a listener vetoes plays none.
 */
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { use, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Scrim, type FadeGround } from '@/components/ui/scrim';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useHaptics } from '@/hooks/use-haptics';
import { Radii } from '@/theme';

import { TabCapsule } from './tab-capsule';
import { PillMetrics, pillBottomOffset, pillReportedHeight } from './tab-metrics';
import {
  TAB_ICONS,
  tabLabel,
  tabPressHandlers,
  type TabNavigation,
  type TabOptions,
  type TabRoute,
} from './tab-shared';
import { TabSurface } from './tab-surface';

/**
 * What each tab's scene is painted with at the bottom, for the fade: Home's is the sheet (the
 * `surface`); the lists and You are on the `canvas`. A route not named here is on the canvas.
 */
const FADE_GROUND: Readonly<Record<string, FadeGround>> = { index: 'surface' };

interface TabButtonProps {
  route: TabRoute;
  options: TabOptions;
  focused: boolean;
  navigation: TabNavigation;
}

function TabButton({ route, options, focused, navigation }: TabButtonProps) {
  const label = tabLabel(options, route.name);
  const icon = TAB_ICONS[route.name];
  const haptics = useHaptics();
  const { onPress, onLongPress } = tabPressHandlers(route, navigation, focused, () =>
    haptics.tabChange(),
  );

  return (
    <Tappable
      testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
      accessibilityRole="tab"
      accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-1 items-center"
      style={styles.tab}>
      {icon ? (
        <Icon
          name={icon}
          weight={focused ? 'fill' : 'regular'}
          size={PillMetrics.iconSize}
          tone={focused ? 'ink' : 'muted'}
        />
      ) : null}
      <Text
        variant="label"
        strong
        capped
        tone={focused ? 'default' : 'muted'}
        style={styles.label}
        className="text-center">
        {label}
      </Text>
    </Tappable>
  );
}

export function TabPill({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  // Lets `useBottomTabBarHeight()` tell every scene where the pill's top edge is.
  const reportHeight = use(BottomTabBarHeightCallbackContext);
  const [trackWidth, setTrackWidth] = useState<number | null>(null);
  const selected = state.routes[state.index];

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setTrackWidth(width);
    reportHeight?.(pillReportedHeight(height, insets.bottom));
  };

  return (
    <>
      <Scrim
        testID="tab-fade"
        kind="fade"
        ground={FADE_GROUND[selected?.name ?? ''] ?? 'canvas'}
        style={styles.fade}
      />
      <View
        testID="tab-bar"
        accessibilityRole="tablist"
        pointerEvents="box-none"
        onLayout={onLayout}
        style={[styles.bar, { bottom: pillBottomOffset(insets.bottom) }]}>
        <TabSurface style={styles.pill}>
          {selected ? (
            <TabCapsule
              routeName={selected.name}
              index={state.index}
              count={state.routes.length}
              trackWidth={trackWidth}
            />
          ) : null}
          {state.routes.map((route, index) => (
            <TabButton
              key={route.key}
              route={route}
              options={descriptors[route.key].options}
              focused={state.index === index}
              navigation={navigation}
            />
          ))}
        </TabSurface>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fade: { height: PillMetrics.fadeHeight },
  // 12 / 14, not the `label` role's 14 / 20: the tab label of the pictures.
  label: { fontSize: PillMetrics.labelSize, lineHeight: PillMetrics.labelLine },
  bar: {
    position: 'absolute',
    left: PillMetrics.sideMargin,
    right: PillMetrics.sideMargin,
  },
  // A minimum, never a height: the tabs grow with the text and the pill with them.
  pill: {
    minHeight: PillMetrics.height,
    padding: PillMetrics.padding,
    gap: PillMetrics.gap,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // A caller style wins over `Tappable`'s, whose minimum height grows with the font scale:
  // here the minimum is the inside of the pill and the content grows the tab. The pressed
  // fill and the focus ring follow the capsule (a circular curve: the continuous one of
  // `Tappable` would make the ends lopsided).
  tab: {
    minHeight: PillMetrics.tabMinHeight,
    minWidth: PillMetrics.tabMinHeight,
    gap: PillMetrics.iconLabelGap,
    paddingHorizontal: PillMetrics.gap,
    borderRadius: Radii.full,
    borderCurve: 'circular',
  },
});
