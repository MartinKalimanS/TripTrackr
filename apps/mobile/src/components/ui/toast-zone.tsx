/**
 * `ToastZone` and `useToastVisible` - where a tab screen's toasts stand (feature 005, F4;
 * `trips-toast.png`; UI-SPEC 3.4 "Toast": 16 dp from the sides, 8 dp above the tab zone).
 *
 *   // (tabs)/trips/_layout.tsx
 *   <ToastZone bottom={tabZone}><Stack /></ToastZone>
 *   // a screen below it
 *   const toastUp = useToastVisible();   // lifts the "Plan a trip" button above the toast
 *
 * The kit places every toast from ONE set of insets, those of the provider that shows it, and
 * the root's are the platform default (a few dp above the bottom edge: behind the floating
 * pill). A tab screen that floats controls above the pill wraps itself in a provider of its
 * own: a nested provider takes over `useToast` for everything below it (the header and the
 * screens of a stack), shows its toasts in the picture's place and says when one is up.
 * Outside a zone nothing changes: the root's provider still answers.
 *
 * Only the position is the zone's; the look of the toast is `toast.tsx`'s.
 */
import { ToastProvider, useToast as useKitToast } from 'heroui-native';
import { useContext, useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

/** The toast stands this far above the zone the tab pill takes (`.toast` bottom). */
export const TOAST_ABOVE_ZONE = Spacing.two;
/** And this far from each side (`.toast` left and right). */
export const TOAST_SIDE_MARGIN = Spacing.three;

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/** The kit's insets for a toast above a zone of `bottom` dp. Pure. */
export function toastZoneInsets(bottom: number, sides: { left: number; right: number }) {
  return {
    top: 0,
    bottom: bottom + TOAST_ABOVE_ZONE,
    left: TOAST_SIDE_MARGIN + sides.left,
    right: TOAST_SIDE_MARGIN + sides.right,
  };
}

export interface ToastZoneProps {
  /** The zone the floating tab pill takes at the bottom, in dp. */
  bottom: number;
  children: ReactNode;
}

export function ToastZone({ bottom, children }: ToastZoneProps) {
  // The provider is expo-router's; outside one (a component test) there is no inset.
  const { left, right } = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const insets = useMemo(
    () => toastZoneInsets(bottom, { left, right }),
    [bottom, left, right],
  );
  return <ToastProvider insets={insets}>{children}</ToastProvider>;
}

/** Whether a toast of the nearest provider is on screen now. */
export function useToastVisible(): boolean {
  return useKitToast().isToastVisible;
}
