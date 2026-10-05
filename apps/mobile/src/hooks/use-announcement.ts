/**
 * Says a message out loud to a screen reader when it appears (feature 002
 * FR-017; contract C13).
 *
 * Android has live regions: a container marked `accessibilityLiveRegion`
 * speaks its own changes. iOS has none — the prop is ignored there — so the
 * same message has to be announced explicitly, through
 * `AccessibilityInfo.announceForAccessibility`
 * (https://reactnative.dev/docs/accessibilityinfo). Doing both on Android
 * would speak it twice, so this announces on iOS only and leaves Android to
 * the live region the caller sets.
 *
 * A new `key` announces again even when the wording is unchanged: two
 * conflicts with the same sentence are still two events.
 */
import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Speak `message` now, where the platform has no live region to do it. */
export function announceWhereNoLiveRegion(message: string): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
}

export function useAnnouncement(
  message: string | null,
  key: string | null = message,
): void {
  useEffect(() => {
    if (message && key !== null) announceWhereNoLiveRegion(message);
  }, [message, key]);
}
