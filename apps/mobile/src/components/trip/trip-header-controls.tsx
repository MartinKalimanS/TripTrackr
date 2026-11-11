/**
 * The trip screen's header controls (feature 005, F5; UI-SPEC section 6 and 10; spec 015 FR-001,
 * FR-009): the Back disc at the start and MORE at the end.
 *
 *   <TripHeaderProvider>  (the layout wraps the stack in it)
 *     headerLeft:  <TripHeaderBack />
 *     headerRight: <TripHeaderTools />
 *
 * Over the picture the two are 44 dp glass discs; once the solid bar has taken the hero's place
 * (`trip-collapsed.png`) they are bare glyphs in ink, so the same controls change look, not
 * identity: one "Back", one "More". The screen says when the bar is complete through
 * `useReportCollapsed`; the controls read it through the provider, and without a provider
 * (a test of the screen alone) they stay glass.
 *
 * More opens the trip's options (rename, home currency, delete). The header only asks: the screen,
 * which holds the trip and the local store, shows the sheet through `useTripOptionsState`. The
 * pictured Share is not drawn until the app can share a trip (spec 015 FR-009 retires Q-11).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { HeaderBackButton } from '@/components/ui/header-back-button';
import { IconButton } from '@/components/ui/icon-button';
import { Space } from '@/theme';

interface HeaderState {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Whether the trip's options sheet is asked for. */
  optionsOpen: boolean;
  setOptionsOpen: (open: boolean) => void;
}

const NOT_COLLAPSED: HeaderState = {
  collapsed: false,
  setCollapsed: () => undefined,
  optionsOpen: false,
  setOptionsOpen: () => undefined,
};

const HeaderStateContext = createContext<HeaderState>(NOT_COLLAPSED);

/** Holds whether the collapsed bar is complete, for the navigator's header and the screen. */
export function TripHeaderProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const value = useMemo(
    () => ({ collapsed, setCollapsed, optionsOpen, setOptionsOpen }),
    [collapsed, optionsOpen],
  );
  return (
    <HeaderStateContext.Provider value={value}>{children}</HeaderStateContext.Provider>
  );
}

/**
 * Tells the header, from the UI thread, when the bar is complete (`progress` is 1) and when it
 * is not any more. It reports changes only, never every frame.
 */
export function useReportCollapsed(progress: SharedValue<number>): void {
  const { setCollapsed } = useContext(HeaderStateContext);
  useAnimatedReaction(
    () => progress.value >= 1,
    (now, before) => {
      if (now !== before) scheduleOnRN(setCollapsed, now);
    },
    [setCollapsed],
  );
}

export function TripHeaderBack() {
  const { collapsed } = useContext(HeaderStateContext);
  return <HeaderBackButton variant={collapsed ? 'ghost' : 'glass'} />;
}

/** For the trip screen: whether its options are asked for, and how to put them away. */
export function useTripOptionsState(): { open: boolean; close: () => void } {
  const { optionsOpen, setOptionsOpen } = useContext(HeaderStateContext);
  return { open: optionsOpen, close: () => setOptionsOpen(false) };
}

export function TripHeaderTools() {
  const { collapsed, setOptionsOpen } = useContext(HeaderStateContext);
  return (
    <View testID="trip-header-tools" style={{ flexDirection: 'row', gap: Space[2] }}>
      <IconButton
        testID="trip-more"
        icon="ellipsis"
        variant={collapsed ? 'ghost' : 'glass'}
        accessibilityLabel="More"
        accessibilityHint="Rename, change currency or delete this trip"
        onPress={() => setOptionsOpen(true)}
      />
    </View>
  );
}
