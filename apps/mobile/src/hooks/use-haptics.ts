/**
 * `useHaptics()` - brief haptic feedback (feature 004; FR-020, contract C4-7, research
 * D4-10), over `expo-haptics` (https://docs.expo.dev/versions/v57.0.0/sdk/haptics.md).
 *
 *   const haptics = useHaptics();
 *   haptics.selection();   // a chip or segment changed
 *   haptics.success();     // a save or create finished
 *   haptics.warning();     // a destructive confirmation
 *
 * Three guarantees, so a caller never has to think about them:
 * - Reduced motion: while `useAppearance().prefersLessMotion` is true every function is
 *   a no-op (FR-020). The setting is read live, never once at mount (design-tokens C4-4).
 * - Unsupported devices: a device without a haptic engine, or a platform that rejects
 *   the call, is swallowed. A haptic is a courtesy and must never break the press that
 *   asked for it.
 * - Fire and forget: the functions return nothing, so callers do not await a vibration.
 *
 * The returned object is stable while the setting does not change.
 */
import * as ExpoHaptics from 'expo-haptics';

import { useAppearance } from '@/hooks/use-appearance';

export interface Haptics {
  /** A selection changed (chip, segment). */
  selection: () => void;
  /** An action succeeded (save, create). */
  success: () => void;
  /** A destructive action is about to happen. */
  warning: () => void;
}

/** Runs a haptic call, swallowing a synchronous throw and a rejected promise alike. */
function play(run: () => Promise<void>): void {
  try {
    run().catch(() => undefined);
  } catch {
    // Unsupported device: nothing to do, and nothing the caller can act on.
  }
}

const ACTIVE: Haptics = {
  selection: () => play(() => ExpoHaptics.selectionAsync()),
  success: () =>
    play(() =>
      ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    play(() =>
      ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning),
    ),
};

const SILENT: Haptics = {
  selection: () => undefined,
  success: () => undefined,
  warning: () => undefined,
};

export function useHaptics(): Haptics {
  const { prefersLessMotion } = useAppearance();
  return prefersLessMotion ? SILENT : ACTIVE;
}
