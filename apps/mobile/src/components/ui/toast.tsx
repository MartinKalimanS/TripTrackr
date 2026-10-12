/**
 * `Toast` and `useToast` - the Undo toast over the HeroUI Toast (feature 005; contract
 * C5-28; research D5-14; FR-066, FR-067). Screens import them from here and never the kit's.
 *
 *   const toast = useToast();
 *   toast.show({ message: 'Trip deleted', action: { label: 'Undo', onPress: restore } });
 *
 * What the kit gives (read from `heroui-native/src/components/toast` and `providers/toast`):
 * the provider (root layout) holds the stack, the gestures and the timers; a toast is any
 * component handed to `toast.show({ component, duration, id })`; the root is a `View` with
 * `role="status"` and `aria-live="polite"`, so it is announced politely and never as an
 * alert; the default duration is 4 seconds and an explicit `id` is shown once; a root
 * renders its children twice (the second, invisible, measures the height), so whatever is
 * inside is built twice. What the adapter adds:
 *
 * - The look: the `toast-surface` fill and `toast-ink` text (a dark navy toast in every
 *   theme: 6.07:1 and better for the action's `accent-press` ink, P7), 16 dp continuous
 *   corners and the second lift, a 52 dp minimum with the words wrapping beside the action,
 *   placed at the bottom. How far above the pill it sits is the PROVIDER's (`insets.bottom`
 *   of its config, set once in the root layout), not each toast's.
 * - ONE action: the kit's `Toast.Action` as a 48 dp ghost button named by its label ("Undo")
 *   whose label is `accent-press`. Pressing it runs the caller's `onPress` and dismisses the
 *   toast. No second action and no close button: the toast leaves by itself.
 * - It goes after 5 seconds (`TOAST_DURATION_MS`; `durationMs` overrides; the kit's timer does
 *   it) and shows that as a 3 dp countdown bar along the bottom edge, which shrinks toward the
 *   start edge and is decorative (hidden from assistive technology, no touch).
 * - Reduced motion: no countdown bar (a bar that moves is motion) and the toast root gets
 *   `animation="disable-all"`, so the kit slides and fades nothing, and nor does its action.
 *   The toast still leaves on time.
 *
 * `useToast()` is the same object for the life of the component, however the kit's stack
 * changes, so an effect may depend on it. `show` returns the kit's id and `hide(id?)` hides
 * one toast, or the last when there is no id. `testID`s: the root is `toast-<id>`, the bar
 * `toast-<id>-countdown`, the action the caller's `action.testID`.
 */
import {
  Button as KitButton,
  Toast as KitToast,
  useToast as useKitToast,
} from 'heroui-native';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, I18nManager, View } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import { cornerOf } from '@/theme';

import { useLiftStyle } from './lift';

/** The toast leaves after this long. */
export const TOAST_DURATION_MS = 5000;

export type ToastAction = {
  label: string;
  onPress: () => void;
  testID?: string;
};

export type ToastOptions = {
  message: string;
  /** The one action: "Undo". */
  action?: ToastAction;
  /** Shown once while an id is on screen. */
  id?: string;
  /** Default 5 seconds. */
  durationMs?: number;
};

/** What the kit hands a toast component, the part that reaches the root. */
type KitToastProps = Pick<
  ComponentProps<typeof KitToast>,
  'index' | 'total' | 'heights' | 'maxVisibleToasts' | 'hide' | 'show'
> & { id: string };

export type ToastProps = KitToastProps &
  Pick<ToastOptions, 'message' | 'action'> & { durationMs: number };

const ACTION_LABEL = 'text-accent-press font-body-semibold text-[14px] leading-[20px]';

/** A 3 dp bar along the bottom edge that runs down over the life of the toast. */
function CountdownBar({ durationMs, testID }: { durationMs: number; testID: string }) {
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const run = Animated.timing(progress, {
      toValue: 0,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [durationMs, progress]);
  return (
    <View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute bottom-0 left-0 right-0 h-[3px]">
      <Animated.View
        className="h-full w-full bg-accent-press opacity-90"
        style={{
          transform: [{ scaleX: progress }],
          transformOrigin: I18nManager.isRTL ? 'right' : 'left',
        }}
      />
    </View>
  );
}

/** The toast itself, as the kit renders it: pass it what the kit hands a component. */
export function Toast({ message, action, durationMs, ...kit }: ToastProps) {
  const { prefersLessMotion } = useAppearance();
  const lift = useLiftStyle('lift2');
  const testID = `toast-${kit.id}`;
  return (
    <KitToast
      {...kit}
      testID={testID}
      placement="bottom"
      variant="default"
      animation={prefersLessMotion ? 'disable-all' : undefined}
      className="min-h-[52px] flex-row items-center gap-3 bg-toast-surface py-2 pe-2 ps-4"
      style={[cornerOf('lg'), lift]}>
      <KitToast.Description className="flex-1 font-body text-[14px] leading-[20px] text-toast-ink">
        {message}
      </KitToast.Description>
      {action ? (
        <KitToast.Action
          size="md"
          variant="ghost"
          accessibilityLabel={action.label}
          testID={action.testID}
          onPress={() => {
            action.onPress();
            kit.hide(kit.id);
          }}>
          <KitButton.Label className={ACTION_LABEL}>{action.label}</KitButton.Label>
        </KitToast.Action>
      ) : null}
      {prefersLessMotion ? null : (
        <CountdownBar durationMs={durationMs} testID={`${testID}-countdown`} />
      )}
    </KitToast>
  );
}

export interface AppToast {
  /** Shows a toast and returns its id. */
  show: (options: ToastOptions) => string;
  /** Hides one toast, or the last one when there is no id. */
  hide: (id?: string) => void;
}

export function useToast(): AppToast {
  const { toast } = useKitToast();
  // The kit's object changes with its stack; a ref keeps ours the same and the calls fresh.
  const kit = useRef(toast);
  useEffect(() => {
    kit.current = toast;
  }, [toast]);
  return useMemo<AppToast>(
    () => ({
      show: ({ message, action, id, durationMs = TOAST_DURATION_MS }) =>
        kit.current.show({
          id,
          duration: durationMs,
          component: (props) => (
            <Toast {...props} message={message} action={action} durationMs={durationMs} />
          ),
        }),
      hide: (id) => kit.current.hide(id),
    }),
    [],
  );
}
