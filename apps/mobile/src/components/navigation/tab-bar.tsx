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
 *   on its top edge (`border-t border-border`, a hairline, 3:1 against the canvas) marks
 *   where it starts. A tab never has a surface, a fill or a border of its own.
 * - Its content is at most 56 dp at the default text size: the divider plus a tab of the
 *   platform's minimum touch target (44 dp iOS, 48 dp Android), which holds a 20 dp icon
 *   and a one-line caption. Nothing caps the height, so a larger text size grows the
 *   tabs (`Tappable` scales its minimum with the font scale) and the label wraps instead
 *   of being cut off (FR-029).
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
import { BorderHairline } from '@/constants/theme';

type TabRoute = BottomTabBarProps['state']['routes'][number];
type TabOptions = BottomTabBarProps['descriptors'][string]['options'];

/** One tab's symbols, named for BOTH platforms (`Icon` accepts nothing else). */
interface TabIcons {
  rest: IconName;
  selected: IconName;
}

/**
 * The icon of each tab route: the outline at rest and the filled SF Symbol when selected.
 * The Android symbol is the same in both states: `expo-symbols` draws Material Symbols
 * from one static font (https://docs.expo.dev/versions/v57.0.0/sdk/symbols.md), which has
 * no fill axis, so on Android the weight, the accent and the mark carry the selection.
 * A route missing here gets a label but no icon rather than a crash.
 */
const TAB_ICONS: Record<string, TabIcons> = {
  index: {
    rest: { ios: 'globe.europe.africa', android: 'globe' },
    selected: { ios: 'globe.europe.africa.fill', android: 'globe' },
  },
  trips: {
    rest: { ios: 'suitcase', android: 'luggage' },
    selected: { ios: 'suitcase.fill', android: 'luggage' },
  },
  profile: {
    rest: { ios: 'person.crop.circle', android: 'account_circle' },
    selected: { ios: 'person.crop.circle.fill', android: 'account_circle' },
  },
};

const MarkWidth = 24;
const MarkHeight = 3;

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
  const icons = TAB_ICONS[route.name];

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
      className="flex-1 items-center gap-0.5 px-2 py-1">
      {focused ? (
        <View
          testID={`tab-mark-${route.name}`}
          className="bg-accent"
          style={styles.mark}
        />
      ) : null}
      {icons ? (
        <Icon
          name={focused ? icons.selected : icons.rest}
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
      className="flex-row border-t border-border bg-background"
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
  // The divider's width: Tailwind's `border-t` is 1 px, the bar draws a hairline.
  bar: {
    borderTopWidth: BorderHairline,
  },
  // Hangs from the divider over the icon, out of the layout: it costs the bar no height.
  mark: {
    position: 'absolute',
    top: 0,
    width: MarkWidth,
    height: MarkHeight,
    borderBottomLeftRadius: MarkHeight,
    borderBottomRightRadius: MarkHeight,
  },
});
