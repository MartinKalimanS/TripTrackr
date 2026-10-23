/**
 * `useReachAllDistance` - a list a screen reader can walk end to end (feature 005, T560;
 * FR-016, FR-017, SC-015).
 *
 * A `FlashList` recycles what is off screen, so at any moment only the rows near the window are
 * mounted. A screen reader walks what is mounted: the countries and the trips past the window
 * do not exist for it until it scrolls, and the traveller cannot tell how many there are. While
 * a screen reader is on, the list is asked to keep everything it holds mounted (its
 * `drawDistance`); with none it keeps its default, which is what keeps a long list light.
 *
 *   const drawDistance = useReachAllDistance(items.length);
 *   <FlashList ... {...(drawDistance === undefined ? null : { drawDistance })} />
 *
 * It is for the lists that SC-015 names (the Countries list and the Trips tab): a country or a
 * trip is a handful of rows to a few hundred, never the thousand expense rows. One
 * `AccessibilityInfo` subscription per mounted list.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** More than the tallest row (a card at the largest text size), so the sum is never short. */
const ROW_BUDGET = 240;

/** Whether VoiceOver or TalkBack is running, live; `active` false subscribes to nothing. */
export function useScreenReaderEnabled(active = true): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (mounted) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [active]);
  return active && enabled;
}

/** The distance that mounts all `count` rows while a screen reader is on; `undefined` otherwise. */
export function useReachAllDistance(count: number, active = true): number | undefined {
  const screenReader = useScreenReaderEnabled(active);
  return screenReader ? Math.max(count, 1) * ROW_BUDGET : undefined;
}
