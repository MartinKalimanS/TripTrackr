/**
 * `AndroidNavBar` - the tab bar of Android (feature 005, research D5-05 and D5-21, contract
 * C5-21; FR-022, FR-023, FR-028): Material 3's own navigation bar, designed for Android and
 * not derived from the pill. Chosen by `TabBar` from `Platform.OS`. Measured from the
 * reference (`home-android.png`, `styles.css` `:root[data-platform='android'] .tabbar`).
 *
 * - Edge to edge: absolute, `left` and `right` 0, the bottom edge 0. Its MINIMUM height is
 *   64 dp (hairline and the 12 dp top padding inside it) PLUS the system inset (gesture bar
 *   or three buttons, `insets.bottom`, the real one: 24 dp in the picture), so the bar is
 *   64 dp above the inset whatever the device's, never a fixed number, and it grows with the
 *   text size. Padding 12 on top and 8 on the sides (plus the side insets). It reports its
 *   measured height, inset included, through `BottomTabBarHeightCallbackContext`, which every
 *   scene reads as `useBottomTabBarHeight()`; a scene and the FAB keep 16 dp above that.
 * - Cream (`surfaceSecondary`) with ONE 1 dp hairline on its top edge. No blur and no glass
 *   (on Android a blur needs a `BlurTargetView` around the globe, re-blurred every frame while
 *   it moves), no lift, no fade: it is opaque in every appearance, contrast themes included.
 * - Each tab is a `Tappable` holding a 56 by 32 dp indicator, a capsule, with the 24 dp icon
 *   centred in it, and the 12 / 14 label beneath, 4 dp apart. The indicator is the coral
 *   `accent` at 26% (28% in dark) on the selected tab only, with a FILLED icon and an `ink`
 *   label (the others: outline icon, `muted` label); every label is weight 600, as drawn. A
 *   held press fills the indicator (Material's state layer), not the whole tab. The indicator
 *   carries `tab-mark-<name>` on the selected tab and `tab-indicator-<name>` on the others
 *   (the same size, clear, so nothing jumps).
 * - Names, roles and press behaviour are the pill's: a `tab` named by the route's label,
 *   `selected`, inside a `tablist`; `tabPress` then navigate, `tabLongPress` (`tab-shared.ts`).
 *   The label is capped at 1.3 times (Q-1) and wraps (FR-023: labels wrap rather than clip);
 *   the bar grows and clips nothing.
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
import { useAppearance } from '@/hooks/use-appearance';
import { Radii, withAlpha } from '@/theme';

import { AndroidBarMetrics } from './tab-metrics';
import {
  TAB_ICONS,
  tabLabel,
  tabPressHandlers,
  type TabNavigation,
  type TabOptions,
  type TabRoute,
} from './tab-shared';

const COLOR_KEYS = ['surfaceSecondary', 'hairline', 'accent', 'pressed'] as const;

export interface IndicatorFills {
  /** The selected tab's indicator. */
  tint: string;
  /** What a held press on an unselected tab fills the indicator with. */
  held: string;
}

/** The indicator's fill: the tint when selected, the held fill while pressed, else clear. Pure. */
export function indicatorFill(
  state: { focused: boolean; pressed: boolean },
  fills: IndicatorFills,
): string | undefined {
  if (state.focused) return fills.tint;
  return state.pressed ? fills.held : undefined;
}

interface TabButtonProps {
  route: TabRoute;
  options: TabOptions;
  focused: boolean;
  navigation: TabNavigation;
  fills: IndicatorFills;
}

function TabButton({ route, options, focused, navigation, fills }: TabButtonProps) {
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
      {({ pressed }) => (
        <>
          <View
            testID={focused ? `tab-mark-${route.name}` : `tab-indicator-${route.name}`}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.indicator,
              { backgroundColor: indicatorFill({ focused, pressed }, fills) },
            ]}>
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
            strong
            capped
            tone={focused ? 'default' : 'muted'}
            style={styles.label}
            className="text-center">
            {label}
          </Text>
        </>
      )}
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
  const { theme } = useAppearance();
  const fills: IndicatorFills = {
    tint: withAlpha(colors.accent, AndroidBarMetrics.indicatorOpacity[theme]),
    held: colors.pressed,
  };

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
          minHeight: AndroidBarMetrics.height + insets.bottom,
          paddingLeft: AndroidBarMetrics.paddingX + insets.left,
          paddingRight: AndroidBarMetrics.paddingX + insets.right,
        },
      ]}>
      {state.routes.map((route, index) => (
        <TabButton
          key={route.key}
          route={route}
          options={descriptors[route.key].options}
          focused={state.index === index}
          navigation={navigation}
          fills={fills}
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
    paddingTop: AndroidBarMetrics.paddingTop,
    borderTopWidth: AndroidBarMetrics.hairline,
  },
  // A caller style wins over `Tappable`'s, whose minimum height grows with the font scale:
  // here the minimum is the 48 dp touch target and the content grows the tab. A square,
  // clear tab, not `Tappable`'s rounded one with a held fill: the held fill is the
  // indicator's. The content starts at the top (the bar's 12 dp padding is above it).
  tab: {
    minHeight: AndroidBarMetrics.tabMinHeight,
    minWidth: AndroidBarMetrics.tabMinHeight,
    justifyContent: 'flex-start',
    gap: AndroidBarMetrics.indicatorLabelGap,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: AndroidBarMetrics.labelSize,
    lineHeight: AndroidBarMetrics.labelLineHeight,
  },
  indicator: {
    width: AndroidBarMetrics.indicatorWidth,
    height: AndroidBarMetrics.indicatorHeight,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
