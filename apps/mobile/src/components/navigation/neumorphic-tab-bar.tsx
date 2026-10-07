/**
 * The tab bar — research D-17, feature 002 FR-003 (T076), tasks.md R009;
 * flattened by feature 003 (User Story 3, FR-013 to FR-016).
 *
 * FR-003 forbids platform-supplied styling on any tab, which rules out both
 * the native tab bar and a re-coloured React Navigation default. This bar is
 * composed from `PressableSurface` in its `bare` mode, so every guarantee the
 * primitive makes that does not need a surface — the minimum touch target
 * (FR-011), the focus ring (FR-012), discrete press feedback (FR-018) — holds
 * for each tab without being restated here.
 *
 * What feature 003 removed is the per-tab raised pill and its compliance
 * border: the bar is the screen's own colour, one divider line (the `border`
 * token, 3:1 or better against the canvas) marks where it starts, and each
 * tab is its glyph. The selected tab says so with accent colour, a heavier
 * label and a short mark above its icon — never colour alone (002 FR-010).
 * Icons and labels use the muted and primary inks, which clear the text
 * contrast floor on this background in both themes (002 FR-008).
 *
 * It receives the `BottomTabBarProps` the JS `Tabs` navigator passes to a
 * custom `tabBar` (https://docs.expo.dev/router/advanced/tabs.md, "Tab bar
 * options"). The bar sits in the navigator's flex column below the screens, so
 * screens are never hidden behind it and need no bottom inset of their own —
 * the scaffold's `BottomTabInset` constant went with the template.
 */
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { use, type ComponentProps } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { BorderHairline, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { resolveInk } from '@/theme/ink';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/**
 * One icon per tab route, named for BOTH platforms: a bare string is an SF
 * Symbol and renders on iOS only (v57 expo-symbols reference, "Cross-platform
 * symbols"). A route missing here gets a label but no icon rather than a crash.
 */
const TAB_ICONS: Record<string, SymbolName> = {
  index: { ios: 'globe', android: 'globe' },
  trips: { ios: 'suitcase.fill', android: 'luggage' },
  profile: { ios: 'person.crop.circle', android: 'account_circle' },
};

const IconSize = 20;
const MarkWidth = 24;
const MarkHeight = 3;

export function NeumorphicTabBar({
  state,
  descriptors,
  navigation,
  insets,
}: BottomTabBarProps) {
  const { tokens, prefersMoreContrast } = useAppearance();
  // Lets `useBottomTabBarHeight()` report the real height to any screen that
  // floats a control above the bar (the globe's controls in US3).
  const reportHeight = use(BottomTabBarHeightCallbackContext);

  const onLayout = (event: LayoutChangeEvent) => {
    reportHeight?.(event.nativeEvent.layout.height);
  };

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      onLayout={onLayout}
      style={[
        styles.bar,
        {
          backgroundColor: tokens.canvas,
          borderTopColor: tokens.border,
          // Clears the home indicator / gesture bar. The inset is what the
          // navigator resolved for this device, so it is right on both platforms.
          paddingBottom: insets.bottom,
        },
      ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name);

        // Mirrors React Navigation's default bar: listeners may veto the press
        // (a screen with unsaved edits, for instance) before anything moves.
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

        const icon = TAB_ICONS[route.name];

        return (
          <PressableSurface
            key={route.key}
            testID={options.tabBarButtonTestID ?? `tab-${route.name}`}
            accessibilityRole="tab"
            accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
            accessibilityState={{ selected: focused }}
            bare
            radius="sm"
            onPress={onPress}
            onLongPress={onLongPress}
            style={styles.tab}>
            {focused ? (
              <View
                testID={`tab-mark-${route.name}`}
                style={[styles.mark, { backgroundColor: tokens.accent }]}
              />
            ) : null}
            {icon ? (
              <SymbolView
                name={icon}
                size={IconSize}
                // Accent for the selected tab, muted ink otherwise — promoted to
                // primary under increased contrast like every other muted ink (FR-013).
                tintColor={
                  focused
                    ? tokens.accent
                    : resolveInk(tokens, 'muted', prefersMoreContrast)
                }
              />
            ) : null}
            <ThemedText
              type={focused ? 'smallBold' : 'small'}
              themeColor={focused ? 'textPrimary' : 'textMuted'}
              numberOfLines={1}
              style={styles.label}>
              {label}
            </ThemedText>
          </PressableSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: BorderHairline,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  // Over the icon, out of the layout: it costs the bar no height.
  mark: {
    position: 'absolute',
    top: 0,
    width: MarkWidth,
    height: MarkHeight,
    borderRadius: MarkHeight,
  },
  label: {
    textAlign: 'center',
  },
});
