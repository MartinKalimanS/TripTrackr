/**
 * `AreaHeader` - the header every everyday area opens with (feature 005, T548; FR-044;
 * UI-SPEC section 9.2; prototype `.nav` and `.lt` in `extra.css`; pictures `more/photos`,
 * `notes`, `documents`, `offline-maps`). Photos, Spending, Notes, Documents and Offline maps
 * adopt it unchanged, so the five look the same.
 *
 *   <AreaHeader
 *     title="Photos" subtitle="Portugal Road Trip · 128 photos"
 *     titleTestID="photos-title" subtitleTestID="photos-subtitle"
 *     actions={<><ComingSoonButton name="photos-select" label="Select photos" icon="checks"
 *                variant="tonal" /><ComingSoonButton name="photos-more" label="More"
 *                icon="ellipsis" variant="tonal" /></>} />
 *
 *   <AreaHeader title="Documents" subtitle="Portugal Road Trip · 5 saved" privacy actions={more} />
 *
 * Props: `title`, `subtitle` (one line, ends in an ellipsis when too long), `privacy` (the
 * "Only you" `PrivacyChip`, for what only the traveller can see), `actions` (the controls at the
 * end of the bar, after the chip, drawn by the screen: the pictured search and more buttons are
 * `ComingSoonButton`s with `variant="tonal"`), `onBack` (default: the router's back, or home when
 * there is nothing to go back to), `testID`, `titleTestID`, `subtitleTestID`.
 *
 * The bar: Back at the start, the chip and the actions at the end, 44 dp tall at the least and
 * 8 dp between its controls, 20 dp from the sides (16 dp on Android: `areaMargin`), below the status bar (the screen hides the
 * navigator's header: `headerShown: false` for the route in `trip/[id]/_layout.tsx`). Back is the
 * tonal 44 dp disc of `HeaderBackButton` (cream with a hairline), named exactly "Back". Under it
 * the title (`title` role, 28 / 32, an accessibility header) and the subtitle (`label`, muted).
 *
 * Neither the title nor the subtitle is a fixed height: both reflow at every text size; the
 * discs do not scale (a bar is a row of 44 dp targets). Colours are the adapters' tokens.
 */
import { useContext, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ScreenMargin, Space } from '@/theme';

import { HeaderBackButton } from './header-back-button';
import { PrivacyChip } from './privacy-chip';
import { Text } from './text';

export interface AreaHeaderProps {
  title: string;
  subtitle?: string | null;
  /** Draws the "Only you" chip at the end of the bar. */
  privacy?: boolean;
  /** The controls at the end of the bar. */
  actions?: ReactNode;
  /** Replaces the default back. */
  onBack?: () => void;
  testID?: string;
  titleTestID?: string;
  subtitleTestID?: string;
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The side margin of an area: 20 dp, 16 dp on Android (UI-SPEC 2.3); the list below uses it too. */
export function areaMargin(os: string = Platform.OS): number {
  return os === 'android' ? ScreenMargin.androidList : ScreenMargin.default;
}

export function AreaHeader({
  title,
  subtitle,
  privacy = false,
  actions,
  onBack,
  testID,
  titleTestID,
  subtitleTestID,
}: AreaHeaderProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const margin = areaMargin();

  return (
    <View
      testID={testID}
      style={{
        paddingTop: insets.top + Space[1],
        paddingStart: margin + insets.left,
        paddingEnd: margin + insets.right,
        paddingBottom: Space[2],
      }}>
      <View className="min-h-11 flex-row items-center justify-between gap-2">
        <HeaderBackButton onPress={onBack} />
        {privacy || actions ? (
          <View className="flex-row items-center gap-2">
            {privacy ? <PrivacyChip /> : null}
            {actions}
          </View>
        ) : null}
      </View>
      <View className="pt-2">
        <Text variant="title" testID={titleTestID}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="label"
            tone="muted"
            numberOfLines={1}
            ellipsizeMode="tail"
            testID={subtitleTestID}
            className="mt-1">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
