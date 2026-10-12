/**
 * `useHaptics()` - brief haptic feedback (feature 004: FR-020, contract C4-7, research
 * D4-10; feature 005: FR-062, contract C5-30, research D5-14), over `expo-haptics`
 * (https://docs.expo.dev/versions/v57.0.0/sdk/haptics.md, 57.0.3).
 *
 *   const haptics = useHaptics();
 *   haptics.tap();         a primary press                      (light impact)
 *   haptics.select();      a chip, segment or choice changed    (selection; `selection` is its old name)
 *   haptics.sheetSnap();   the Home sheet settled on a detent   (selection)
 *   haptics.tabChange();   a tab changed                        (selection)
 *   haptics.success();     a save or create finished            (success notification)
 *   haptics.warning();     a destructive confirmation           (warning notification)
 *   haptics.error();       something failed                     (error notification)
 *   haptics.stamp();       a passport stamp landed              (heavy impact)
 *   haptics.impact('light' | 'heavy');                          (`tap`, `stamp`)
 *
 * A caller says WHAT happened; the hook says how it feels on this platform. On iOS (and on
 * an Android native client that has no `performAndroidHapticsAsync`) the names map to the
 * cross-platform calls as written above. On Android they map to the platform's own haptic
 * constants through `performAndroidHapticsAsync`, which the docs recommend over the
 * `Vibrator` the other calls simulate on Android (it needs no VIBRATE permission): `select`
 * and `sheetSnap` are `Segment_Tick`, `tap` and `tabChange` are `Virtual_Key`, `success` is
 * `Confirm`, `error` is `Reject`, and `warning` and `stamp` are `Long_Press` (the firmest
 * constant the platform offers; there is no heavy-impact one). The Android values are the
 * starting point of device check V6 (T512), which tunes them on a phone.
 *
 * Four guarantees, so a caller never has to think about them:
 * - Reduced motion: while `useAppearance().prefersLessMotion` is true every function is a
 *   no-op (FR-062, FR-073). The setting is read live, never once at mount (design-tokens C4-4).
 * - Unsupported devices: a device without a haptic engine, a platform that rejects the call, a
 *   native client without the Android enum: all swallowed. A haptic is a courtesy and must
 *   never break the press that asked for it.
 * - Fire and forget: the functions return nothing, so callers do not await a vibration.
 * - Debounced: the same name asked again within 80 ms by the same component is dropped (D5-14),
 *   so a drag that settles repeatedly cannot machine-gun the motor. The window belongs to the
 *   hook's owner and to the name: two components never silence each other, and a failure right
 *   after a tap is still felt. Callers still never play one during a scroll.
 *
 * The returned object is stable while the setting does not change. `Haptics` is the type of
 * the three feature 004 names (callers and test doubles written against them keep compiling);
 * `SemanticHaptics` is the whole map, and what the hook returns.
 */
import * as ExpoHaptics from 'expo-haptics';
import { useMemo } from 'react';
import { Platform } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';

export type HapticName =
  | 'tap'
  | 'select'
  | 'sheetSnap'
  | 'tabChange'
  | 'success'
  | 'warning'
  | 'error'
  | 'stamp';

/**
 * The three names of feature 004: what every existing caller reads (`keyof Haptics` in
 * `button.tsx`) and what their test doubles implement, so this interface does not grow.
 */
export interface Haptics {
  /** A selection changed (chip, segment, choice). */
  selection: () => void;
  /** An action succeeded (save, create). */
  success: () => void;
  /** A destructive action is about to happen. */
  warning: () => void;
}

/** The semantic map of feature 005: the three names above plus the new ones. */
export interface SemanticHaptics extends Haptics {
  /** A primary press: a light impact. */
  tap: () => void;
  /** A selection changed (chip, segment, choice): the new name of `selection`, the same haptic. */
  select: () => void;
  /** The Home sheet settled on a detent. */
  sheetSnap: () => void;
  /** A tab changed. */
  tabChange: () => void;
  /** An action failed. */
  error: () => void;
  /** A stamp landed: a heavy impact. */
  stamp: () => void;
  /** `light` is `tap`, `heavy` is `stamp`. */
  impact: (kind: 'light' | 'heavy') => void;
}

/** The same name asked again within this many ms by the same owner is dropped. */
export const HAPTIC_DEBOUNCE_MS = 80;

interface Feel {
  /** The cross-platform call: iOS, and Android without the haptic engine. */
  portable: () => Promise<void>;
  /** The Android constant, looked up when played: a client without the enum must not break import. */
  android: () => ExpoHaptics.AndroidHaptics;
}

/** A notification, its type looked up when played (like the Android constants below). */
const notify = (type: 'Success' | 'Warning' | 'Error') => () =>
  ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType[type]);

const FEELS: Record<HapticName, Feel> = {
  tap: {
    portable: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
    android: () => ExpoHaptics.AndroidHaptics.Virtual_Key,
  },
  select: {
    portable: () => ExpoHaptics.selectionAsync(),
    android: () => ExpoHaptics.AndroidHaptics.Segment_Tick,
  },
  sheetSnap: {
    portable: () => ExpoHaptics.selectionAsync(),
    android: () => ExpoHaptics.AndroidHaptics.Segment_Tick,
  },
  tabChange: {
    portable: () => ExpoHaptics.selectionAsync(),
    android: () => ExpoHaptics.AndroidHaptics.Virtual_Key,
  },
  success: {
    portable: notify('Success'),
    android: () => ExpoHaptics.AndroidHaptics.Confirm,
  },
  warning: {
    portable: notify('Warning'),
    android: () => ExpoHaptics.AndroidHaptics.Long_Press,
  },
  error: {
    portable: notify('Error'),
    android: () => ExpoHaptics.AndroidHaptics.Reject,
  },
  stamp: {
    portable: () => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Heavy),
    android: () => ExpoHaptics.AndroidHaptics.Long_Press,
  },
};

/** The call for `name` on this platform. Throws when the device or client cannot. */
function perform(name: HapticName): Promise<void> {
  const feel = FEELS[name];
  const hasEngine = typeof ExpoHaptics.performAndroidHapticsAsync === 'function';
  return Platform.OS === 'android' && hasEngine
    ? ExpoHaptics.performAndroidHapticsAsync(feel.android())
    : feel.portable();
}

/** Runs a haptic call, swallowing a synchronous throw and a rejected promise alike. */
function play(name: HapticName): void {
  try {
    perform(name).catch(() => undefined);
  } catch {
    // Unsupported device: nothing to do, and nothing the caller can act on.
  }
}

/**
 * A set of haptics with its own 80 ms windows, one per name. The only state is when each
 * name last played; the clock is read when a haptic is asked for, so a test can move it.
 */
export function createHaptics(now: () => number = () => Date.now()): SemanticHaptics {
  const lastPlayed = new Map<HapticName, number>();
  const fire = (name: HapticName) => () => {
    const at = now();
    const before = lastPlayed.get(name);
    if (before !== undefined && at - before < HAPTIC_DEBOUNCE_MS) return;
    lastPlayed.set(name, at);
    play(name);
  };
  const tap = fire('tap');
  const select = fire('select');
  const stamp = fire('stamp');
  return {
    tap,
    select,
    selection: select,
    sheetSnap: fire('sheetSnap'),
    tabChange: fire('tabChange'),
    success: fire('success'),
    warning: fire('warning'),
    error: fire('error'),
    stamp,
    impact: (kind) => (kind === 'heavy' ? stamp() : tap()),
  };
}

const SILENT: SemanticHaptics = (() => {
  const nothing = () => undefined;
  return {
    tap: nothing,
    select: nothing,
    selection: nothing,
    sheetSnap: nothing,
    tabChange: nothing,
    success: nothing,
    warning: nothing,
    error: nothing,
    stamp: nothing,
    impact: nothing,
  };
})();

export function useHaptics(): SemanticHaptics {
  const { prefersLessMotion } = useAppearance();
  return useMemo(
    () => (prefersLessMotion ? SILENT : createHaptics()),
    [prefersLessMotion],
  );
}
