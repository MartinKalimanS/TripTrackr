/**
 * `Sheet` - the Home sheet (feature 005, T534; contract C5-22; FR-012, FR-017, FR-027,
 * FR-062; research D5-03): a persistent, NON-modal sheet of three detents over a full-bleed
 * globe, built here on Reanimated and Gesture Handler instead of `@gorhom/bottom-sheet`
 * (D5-03 has the reasons).
 *
 *   <Sheet detents={sheetHeights(geometry, rowHeight)} detent={detent}
 *     onDetentChange={setDetent} onSettle={fitCamera} handleLabel="Countries and trips"
 *     renderBody={({ detent }) => <HomeBody detent={detent} />} />
 *
 * - It is CONTROLLED: `detent` is what the parent says, and every move the traveller makes
 *   (a drag, a tap on the handle, an accessibility step, Android's back) is reported through
 *   `onDetentChange` at once, for the parent to pass back. A parent that changes `detent` on
 *   its own (a country was chosen: lower to half) moves the sheet and hears no `onDetentChange`.
 * - ONE settle: `onSettle(detent)` runs once per move, when the spring has come to rest (the
 *   Home re-fits the camera there, once, never per frame), with a selection haptic. It does
 *   not run on mount, and a spring that a finger interrupts never reaches it.
 * - It moves by `translateY` of a sheet as tall as `full` (plus a skirt that covers the gap the
 *   rubber band opens), so dragging is one transform per frame on the UI thread and no layout;
 *   see `sheet-motion.ts` (the value and the spring) and `sheet-pans.ts` (the gestures).
 * - Reduced motion: a release or a tap JUMPS to the detent with no spring (the drag itself
 *   still follows the finger, which is not decoration), and the settle still reports.
 * - The handle (`home-sheet-handle`) is an `adjustable` control: a 96 by 48 dp target over a
 *   36 by 5 grabber (32 by 4 on Android), named by `handleLabel`, with the detent as its value
 *   ("Peek", "Half", "Full") and `increment` and `decrement` actions ("More" and "Less") that
 *   step one detent. A tap cycles peek, half, full and back to peek. It carries the focus ring.
 * - A pan on the handle and on the header region always moves the sheet; a pan on the body
 *   shares the finger with the list inside it. The list is wrapped in `SheetScrollable`, and
 *   takes `useSheetScroll()`'s `scrollProps`: it scrolls only when the sheet has SETTLED at
 *   full (`scrollEnabled` changes once per settle, never per frame), does not bounce, and
 *   hands the finger to the sheet when it is at its top and the finger moves down.
 *   Outside a sheet both are inert, so the same list works on its own.
 * - On Android the back gesture lowers the sheet one detent (full to half to peek) while the
 *   screen is focused, and leaves peek to the route; `handleBack={false}` switches that off.
 *
 * Placement: a sibling of the globe, `position: absolute`, over the screen's whole area with
 * `pointerEvents="box-none"` (`home-sheet-overlay`), so a touch above the sheet reaches the map
 * and a touch in it never does. Its bottom edge is the screen's; the content is padded by the
 * caller (the tab zone) and sits under the handle.
 *
 * Ids: `home-sheet`, `home-sheet-overlay`, `home-sheet-handle`, `home-sheet-grabber`,
 * `home-sheet-body`. 60 frames a second over the live globe is device check T509.
 */
import { useFocusEffect } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue } from 'react-native-reanimated';

import { Radii } from '@/theme';

import { focusRingStyle, useFocusRing } from './focus-ring';
import { useLiftStyle } from './lift';
import { GRAB_ZONE, RUBBER_BAND_LIMIT, detentLabel, cycleDetent } from './sheet-geometry';
import type { SheetDetent, SheetHeights } from './sheet-geometry';
import { useSheetMotion, useSheetStyle, type SheetMotion } from './sheet-motion';
import { sheetPan, type PanState } from './sheet-pans';
import { useColors } from './theme-tokens';

export type { SheetDetent, SheetHeights } from './sheet-geometry';

export interface SheetProps {
  /** The visible height of each detent, in dp: `sheetHeights()`. */
  detents: SheetHeights;
  /** The detent the parent wants. Controlled. */
  detent: SheetDetent;
  /** The traveller moved the sheet: pass `detent` back. */
  onDetentChange?: (detent: SheetDetent) => void;
  /** The sheet came to rest on `detent`: re-fit the camera. Once per move. */
  onSettle?: (detent: SheetDetent) => void;
  /** What the handle is called for a screen reader. */
  handleLabel: string;
  /** A region under the handle that also drags the sheet (a title, a row of controls). */
  header?: ReactNode;
  /** The content. `detent` is where the sheet is going, `settled` where it last rested. */
  renderBody: (info: { detent: SheetDetent; settled: SheetDetent }) => ReactNode;
  /** Lower the sheet with Android's back button. Default true. */
  handleBack?: boolean;
}

export type SheetScrollProps = Pick<
  ScrollViewProps,
  'scrollEnabled' | 'onScroll' | 'scrollEventThrottle' | 'bounces' | 'overScrollMode'
>;

export interface SheetScroll {
  /** Spread onto the body's ScrollView or FlashList. */
  scrollProps: SheetScrollProps;
  /** The list's own gesture, which the body pan runs simultaneously with. */
  gesture: ReturnType<typeof Gesture.Native>;
}

const SheetScrollContext = createContext<SheetScroll | null>(null);

/** The scroll wiring of the sheet this list is in, or `null` outside one. */
export function useSheetScroll(): SheetScroll | null {
  return useContext(SheetScrollContext);
}

/**
 * Wraps the body's scroller (ONE child: the ScrollView or FlashList itself) so the sheet's
 * pan and the list share the finger. A plain pass-through outside a sheet.
 */
export function SheetScrollable({ children }: { children: ReactElement }) {
  const scroll = useSheetScroll();
  if (scroll === null) return children;
  return <GestureDetector gesture={scroll.gesture}>{children}</GestureDetector>;
}

/** The skirt below the sheet that the rubber band lifts into view. */
const SKIRT = RUBBER_BAND_LIMIT + 16;
const HANDLE_WIDTH = 96;
const HANDLE_HEIGHT = 48;
const HANDLE_ACTIONS = [
  { name: 'increment', label: 'More' },
  { name: 'decrement', label: 'Less' },
] as const;
const COLORS = ['surface', 'hairline', 'focus'] as const;
const SCROLL_THROTTLE_MS = 16;

function usePanState(): PanState {
  return {
    scrollY: useSharedValue(0),
    taking: useSharedValue(0),
    anchor: useSharedValue(0),
    origin: useSharedValue(0),
    startedAt: useSharedValue(0),
    last: useSharedValue(0),
    atTop: useSharedValue(0),
  };
}

/** Android's back: one detent down while focused, and peek is left to the route. */
function useSheetBack(enabled: boolean, motion: SheetMotion) {
  const latest = useRef(motion);
  useEffect(() => {
    latest.current = motion;
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android' || !enabled) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        const { current, step, moveTo } = latest.current;
        if (current() === 'peek') return false;
        moveTo(step(-1));
        return true;
      });
      return () => subscription.remove();
    }, [enabled]),
  );
}

interface HandleProps {
  detent: SheetDetent;
  label: string;
  motion: SheetMotion;
  focusColor: string;
}

function Handle({ detent, label, motion, focusColor }: HandleProps) {
  const focus = useFocusRing();
  const android = Platform.OS === 'android';
  const stepTo = (direction: 1 | -1) => {
    const next = motion.step(direction);
    if (next !== motion.current()) motion.moveTo(next);
  };
  return (
    <Pressable
      testID="home-sheet-handle"
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: detentLabel(detent) }}
      accessibilityActions={HANDLE_ACTIONS}
      onAccessibilityAction={({ nativeEvent }) =>
        stepTo(nativeEvent.actionName === 'increment' ? 1 : -1)
      }
      onPress={() => motion.moveTo(cycleDetent(motion.current()))}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      style={[styles.handle, focus.focused ? focusRingStyle(focusColor) : null]}>
      <View
        testID="home-sheet-grabber"
        className="rounded-full bg-grab"
        style={android ? styles.grabberAndroid : styles.grabber}
      />
    </Pressable>
  );
}

export function Sheet(props: SheetProps) {
  const { detents, detent, handleLabel, header, renderBody, handleBack = true } = props;
  const motion = useSheetMotion(props);
  const state = usePanState();
  const colors = useColors(COLORS);
  const lift = useLiftStyle('lift2');
  const animated = useSheetStyle(motion);
  useSheetBack(handleBack, motion);

  const ui = {
    detents,
    visible: motion.visible,
    driveTo: motion.driveTo,
    announce: motion.announce,
  };
  const scrollGesture = useMemo(
    () => Gesture.Native().withTestId('home-sheet-scroll'),
    [],
  );
  const scroll = useMemo<SheetScroll>(
    () => ({
      scrollProps: {
        scrollEnabled: motion.settled === 'full',
        onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
          state.scrollY.set(event.nativeEvent.contentOffset.y),
        scrollEventThrottle: SCROLL_THROTTLE_MS,
        bounces: false,
        overScrollMode: 'never',
      },
      gesture: scrollGesture,
    }),
    [motion.settled, scrollGesture, state.scrollY],
  );

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radii.sheet,
    borderTopRightRadius: Radii.sheet,
    borderCurve: 'continuous',
    height: detents.full + SKIRT,
    paddingBottom: SKIRT,
    ...lift,
  } as const;

  return (
    <View testID="home-sheet-overlay" pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        testID="home-sheet"
        pointerEvents="auto"
        style={[styles.sheet, surface, animated]}>
        <GestureDetector gesture={sheetPan('home-sheet-drag', ui, state, false)}>
          <View collapsable={false}>
            <View style={styles.zone} />
            {header}
          </View>
        </GestureDetector>
        <SheetScrollContext.Provider value={scroll}>
          <GestureDetector
            gesture={sheetPan('home-sheet-body-pan', ui, state, true, scrollGesture)}>
            <View testID="home-sheet-body" collapsable={false} style={styles.body}>
              {renderBody({ detent, settled: motion.settled })}
            </View>
          </GestureDetector>
        </SheetScrollContext.Provider>
        <GestureDetector gesture={sheetPan('home-sheet-handle-drag', ui, state, false)}>
          <View collapsable={false} style={styles.handleSlot}>
            <Handle
              detent={detent}
              label={handleLabel}
              motion={motion}
              focusColor={colors.focus}
            />
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFill,
  sheet: { position: 'absolute', left: 0, right: 0, bottom: -SKIRT },
  zone: { height: GRAB_ZONE },
  body: { flex: 1, overflow: 'hidden' },
  // The 96 by 48 target sits over the first 48 dp of the sheet, above the content (it is the
  // last child), and is centred; the header and the body start under the 28 dp grab zone.
  handleSlot: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -HANDLE_WIDTH / 2,
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
  },
  handle: { width: HANDLE_WIDTH, height: HANDLE_HEIGHT, alignItems: 'center' },
  grabber: { width: 36, height: 5, marginTop: 10 },
  grabberAndroid: { width: 32, height: 4, marginTop: 10 },
});
