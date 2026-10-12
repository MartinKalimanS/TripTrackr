/**
 * The tab bar - feature 004 (T426; contract C4-9; FR-010, FR-025, FR-026, FR-029,
 * FR-030; research D4-06), over feature 003 FR-013 to FR-016 and research D-17.
 *
 * It receives the `BottomTabBarProps` the JS `Tabs` navigator passes to a custom
 * `tabBar` (https://docs.expo.dev/router/advanced/tabs.md, "Tab bar options"). The bar
 * sits in the navigator's flex column below the screens, so screens are never hidden
 * behind it and need no bottom inset of their own. The native tab bar stays unused: the
 * module is still `unstable-` in SDK 57 (research D4-06).
 *
 * - A flat strip. It is painted with the canvas colour (`bg-background`) and ONE divider
 *   on its top edge marks where it starts: the colour is the `border-border` class (3:1
 *   against the canvas) and the width is the style's hairline `borderTopWidth`, the only
 *   width there is (Tailwind's `border-t` would be 1 px). A tab never has a surface, a
 *   fill or a border of its own.
 * - Its content is at most 56 dp at the default text size. A tab is as tall as the larger
 *   of the platform's minimum touch target (44 dp iOS, 48 dp Android) and what it holds,
 *   `TabContentHeight`: the icon, the gap, ONE caption line (the type scale's, 16 dp) and
 *   the vertical padding, 46 dp. The bar adds the hairline above that, so it is 46.3 dp on
 *   iOS and 48.3 dp on Android, and the 56 dp budget is `TabMetrics` summed, not a cap.
 * - Nothing caps the height at a larger text size. The tab's own minimum is the touch
 *   target, NOT scaled with the font scale as `Tappable` would (that would make the bar
 *   88 dp at scale 2 and about 140 dp at Android's largest, for a 20 dp icon and a word):
 *   the platform scales the caption's line, the label wraps rather than truncates, and the
 *   content grows the tab by what it needs (FR-029).
 * - Each tab is a `Tappable`: the touch target, the pressed fill and the focus ring come
 *   from it, and so does the name. It is announced as a `tab` named by the route's label,
 *   `selected` for the focused one, inside a `tablist`.
 * - The selected tab says so three ways besides colour (FR-025): the FILLED variant of its
 *   icon, a heavier label, and a short accent mark above the icon (`tab-mark-<name>`, in
 *   the selected tab only). The mark and the weight survive greyscale. The icon and label
 *   are the accent ink when selected, the muted ink otherwise (7:1 in the contrast
 *   themes), both resolved from the theme by `Icon` and `Text`.
 * - The bottom inset is the one the navigator resolved for this device, so the bar clears
 *   the home indicator and the Android gesture bar.
 *
 * Press behaviour is React Navigation's own: `tabPress` first, so a listener may veto it,
 * then navigate; `tabLongPress` on a long press.
 */
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { use } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { BorderHairline, MinTouchTarget, Spacing } from '@/constants/theme';
import { TextRoles } from '@/theme';

type TabRoute = BottomTabBarProps['state']['routes'][number];
type TabOptions = BottomTabBarProps['descriptors'][string]['options'];

/**
 * The icon of each tab route, a registry key: drawn `regular` at rest and `fill` when
 * selected (Phosphor has the weight on both platforms, which the Material symbols of
 * feature 004 did not on Android). A route missing here gets a label but no icon rather
 * than a crash.
 */
const TAB_ICONS: Record<string, IconName> = {
  index: 'globe',
  trips: 'suitcase',
  profile: 'user',
};

/**
 * The numbers a tab is laid out with, in dp. Exported so the 56 dp budget is summed from
 * the same constants the tab renders with (`test/components/tab-bar.test.tsx`).
 */
export const TabMetrics = {
  /** An `Icon` size: icons do not scale with the font scale. */
  iconSize: 20,
  /** Between the icon and the label. */
  gap: Spacing.half,
  paddingX: Spacing.two,
  paddingY: Spacing.one,
  /** One line of the caption role. The platform scales it with the font size. */
  captionLineHeight: TextRoles.caption.lineHeight,
  /** The selected tab's mark: out of the layout, so it adds nothing to the height. */
  markWidth: 24,
  markHeight: 3,
} as const;

/** What one tab holds at the default text size: icon, gap, one caption line, padding. */
export const TabContentHeight =
  TabMetrics.iconSize +
  TabMetrics.gap +
  TabMetrics.captionLineHeight +
  2 * TabMetrics.paddingY;

/** The tab's name: a string `tabBarLabel`, else the route's title, else its route name. */
function tabLabel(options: TabOptions, routeName: string): string {
  return typeof options.tabBarLabel === 'string'
    ? options.tabBarLabel
    : (options.title ?? routeName);
}

interface TabButtonProps {
  route: TabRoute;
  options: TabOptions;
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
}

function TabButton({ route, options, focused, navigation }: TabButtonProps) {
  const label = tabLabel(options, route.name);
  const icon = TAB_ICONS[route.name];

  // Mirrors React Navigation's default bar: listeners may veto the press (a screen with
  // unsaved edits, for instance) before anything moves.
  const onPress = () => {
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const onLongPress = () => {
    navigation.emit({ type: 'tabLongPress', target: route.key });
  };

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
      {focused ? (
        <View
          testID={`tab-mark-${route.name}`}
          className="bg-accent"
          style={styles.mark}
        />
      ) : null}
      {icon ? (
        <Icon
          name={icon}
          weight={focused ? 'fill' : 'regular'}
          size={TabMetrics.iconSize}
          tone={focused ? 'accent' : 'muted'}
        />
      ) : null}
      <Text
        type="caption"
        tone={focused ? 'accent' : 'muted'}
        className={focused ? 'text-center font-bold' : 'text-center'}>
        {label}
      </Text>
    </Tappable>
  );
}

export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  // Lets `useBottomTabBarHeight()` report the real height to any screen that floats a
  // control above the bar (the globe's controls).
  const reportHeight = use(BottomTabBarHeightCallbackContext);

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
      className="flex-row border-border bg-background"
      style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => (
        <TabButton
          key={route.key}
          route={route}
          options={descriptors[route.key].options}
          focused={state.index === index}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The divider's width, the only one: the `border-border` class carries its colour.
  bar: {
    borderTopWidth: BorderHairline,
  },
  // A caller style wins over `Tappable`'s, whose minimum height grows with the font
  // scale: here the minimum is the touch target and the content grows the tab.
  tab: {
    minHeight: MinTouchTarget,
    gap: TabMetrics.gap,
    paddingHorizontal: TabMetrics.paddingX,
    paddingVertical: TabMetrics.paddingY,
  },
  // Hangs from the divider over the icon, out of the layout: it costs the bar no height.
  mark: {
    position: 'absolute',
    top: 0,
    width: TabMetrics.markWidth,
    height: TabMetrics.markHeight,
    borderBottomLeftRadius: TabMetrics.markHeight,
    borderBottomRightRadius: TabMetrics.markHeight,
  },
});
