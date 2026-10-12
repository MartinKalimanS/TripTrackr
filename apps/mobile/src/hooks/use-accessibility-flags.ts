/**
 * `useAccessibilityFlags()` - the platform's accessibility flags and nothing else
 * (feature 005, T519; contract C4-4's shared store).
 *
 *   const { prefersLessMotion, prefersMoreContrast } = useAccessibilityFlags();
 *
 * `useAppearance` composes the shared store with two per-component subscriptions, the
 * colour scheme and the window's font scale, and a derived object. A control repeated down
 * a list (a `Button`, an icon button, a chip) needs only the flags: whether to drop the
 * press scale, and whether the primary's edge ring is its 2 dp contrast width. This hook
 * reads the store alone, through `useSyncExternalStore`, so it adds no listener, no
 * colour-scheme subscription and no allocation per component. The snapshot is the store's
 * own frozen object, stable until a flag changes.
 */
import { useSyncExternalStore } from 'react';

import {
  getAppearanceServerSnapshot,
  getAppearanceSnapshot,
  subscribeToAppearance,
  type AppearanceSnapshot,
} from '@/hooks/appearance-store';

export function useAccessibilityFlags(): AppearanceSnapshot {
  return useSyncExternalStore(
    subscribeToAppearance,
    getAppearanceSnapshot,
    getAppearanceServerSnapshot,
  );
}
