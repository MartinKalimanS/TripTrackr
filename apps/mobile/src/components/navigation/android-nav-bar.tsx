/**
 * `AndroidNavBar` - the tab bar of Android (feature 005, research D5-05 and D5-21, contract
 * C5-21; FR-022, FR-023, FR-028): Material 3's own navigation bar, designed for Android and
 * not derived from the pill. Chosen by `TabBar` from `Platform.OS`.
 *
 * - Edge to edge: absolute, `left` and `right` 0, the bottom edge 0. The content is 64 dp tall
 *   as a MINIMUM (it grows with the text size) and the system inset (gesture bar or three
 *   buttons) is the padding BELOW it, so the bar is 64 dp plus the inset whatever the
 *   device's, never a fixed number. It reports its measured height, inset included, through
 *   `BottomTabBarHeightCallbackContext`, which every scene reads as `useBottomTabBarHeight()`.
 * - Cream (`surfaceSecondary`) with ONE hairline on its top edge. No blur and no glass (on
 *   Android a blur needs a `BlurTargetView` around the globe, re-blurred every frame while it
 *   moves), no lift, no fade: it is opaque in every appearance.
 * - Each tab is a `Tappable` holding a 56 by 32 dp indicator, a capsule, with the 24 dp icon
 *   centred in it, and the label beneath. The indicator is tinted (`accentTint`) on the
 *   selected tab only, with a FILLED icon and a heavier label, so the selection survives
 *   greyscale. The indicator carries `tab-mark-<name>` on the selected tab and
 *   `tab-indicator-<name>` on the others (the same size, clear, so nothing jumps).
 * - Names, roles and press behaviour are the pill's: a `tab` named by the route's label,
 *   `selected`, inside a `tablist`; `tabPress` then navigate, `tabLongPress` (`tab-shared.ts`).
 *   The label is `label`, capped at 1.3 times (Q-1), and wraps; the bar grows and clips nothing.
 */
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { use } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { Radii } from '@/theme';

import { AndroidBarMetrics } from './tab-metrics';
import {
  TAB_ICONS,
  tabLabel,
  tabPressHandlers,
  type TabNavigation,
  type TabOptions,
  type TabRoute,
} from './tab-shared';

const COLOR_KEYS = ['surfaceSecondary', 'hairline', 'accentTint'] as const;

interface TabButtonProps {
  route: TabRoute;
  options: TabOptions;
  focused: boolean;
  navigation: TabNavigation;
  indicatorFill: string;
}

function TabButton({
  route,
  options,
  focused,
  navigation,
  indicatorFill,
}: TabButtonProps) {
  const label = tabLabel(options, route.name);
  const icon = TAB_ICONS[route.name];
  const { onPress, onLongPress } = tabPressHandlers(route, navigation, focused);

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
      <View
        testID={focused ? `tab-mark-${route.name}` : `tab-indicator-${route.name}`}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.indicator, focused ? { backgroundColor: indicatorFill } : null]}>
        {icon ? (
          <Icon
            name={icon}
            weight={focused ? 'fill' : 'regular'}
            size={AndroidBarMetrics.iconSize}
            tone={focused ? 'ink' : 'muted'}
          />
        ) : null}
      </View>
      <Text
        variant="label"
        strong={focused}
        capped
        tone={focused ? 'default' : 'muted'}
        className="text-center">
        {label}
      </Text>
    </Tappable>
  );
}

export function AndroidNavBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  // Lets `useBottomTabBarHeight()` tell every scene where the bar's top edge is.
  const reportHeight = use(BottomTabBarHeightCallbackContext);
  const colors = useColors(COLOR_KEYS);

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      onLayout={(event: LayoutChangeEvent) =>
        reportHeight?.(event.nativeEvent.layout.height)
      }
      style={[
        styles.bar,
        {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.hairline,
          paddingBottom: insets.bottom,
        },
      ]}>
      {state.routes.map((route, index) => (
        <TabButton
          key={route.key}
          route={route}
          options={descriptors[route.key].options}
          focused={state.index === index}
          navigation={navigation}
          indicatorFill={colors.accentTint}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // A caller style wins over `Tappable`'s, whose minimum height grows with the font scale:
  // here the minimum is the bar's 64 dp and the content grows the tab. A square tab, not
  // `Tappable`'s rounded one: the held fill is a flat patch the width of the tab.
  tab: {
    minHeight: AndroidBarMetrics.height,
    minWidth: AndroidBarMetrics.height,
    gap: AndroidBarMetrics.indicatorLabelGap,
    paddingVertical: AndroidBarMetrics.paddingY,
    borderRadius: 0,
  },
  indicator: {
    width: AndroidBarMetrics.indicatorWidth,
    height: AndroidBarMetrics.indicatorHeight,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
