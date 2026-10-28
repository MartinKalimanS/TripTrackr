/**
 * The trip screen's header controls (feature 005, F5; UI-SPEC section 6 and 10; owner answer
 * Q-11): the Back disc at the start and, as pictured (`trip.png`), SHARE and MORE at the end.
 *
 *   <TripHeaderProvider>  (the layout wraps the stack in it)
 *     headerLeft:  <TripHeaderBack />
 *     headerRight: <TripHeaderTools />
 *
 * Over the picture the three are 44 dp glass discs; once the solid bar has taken the hero's
 * place (`trip-collapsed.png`) they are bare glyphs in ink, so the same controls change look, not
 * identity: one "Back", one of each. The screen says when the bar is complete through
 * `useReportCollapsed`; the controls read it through the provider, and without a provider
 * (a test of the screen alone) they stay glass.
 *
 * Share and More are coming-soon controls (`coming-soon-trip-share`, `coming-soon-trip-more`):
 * the picture draws them, the app has neither capability, and their only effect is one toast.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { Space } from '@/theme';

interface HeaderState {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const NOT_COLLAPSED: HeaderState = { collapsed: false, setCollapsed: () => undefined };

const HeaderStateContext = createContext<HeaderState>(NOT_COLLAPSED);

/** Holds whether the collapsed bar is complete, for the navigator's header and the screen. */
export function TripHeaderProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(() => ({ collapsed, setCollapsed }), [collapsed]);
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

export function TripHeaderTools() {
  const { collapsed } = useContext(HeaderStateContext);
  const variant = collapsed ? 'ghost' : 'glass';
  return (
    <View testID="trip-header-tools" style={{ flexDirection: 'row', gap: Space[2] }}>
      <ComingSoonButton name="trip-share" label="Share" icon="share" variant={variant} />
      <ComingSoonButton
        name="trip-more"
        label="More"
        thing="Trip actions"
        icon="ellipsis"
        variant={variant}
      />
    </View>
  );
}
