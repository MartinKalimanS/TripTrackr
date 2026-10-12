/**
 * A `react-native-reanimated` double for the suites that drive a gesture-built component
 * (the Home sheet, feature 005 T534), where the two doubles that exist are not enough:
 * `jest.setup.ts` keeps the minimal stand-in (`FadeIn`, `Easing`, `Keyframe`), and the
 * library's own `mock` entry point (`reanimated-full.ts`) gives a shared value that is a new
 * object on every render and an animated style read once, at render.
 *
 * This one models the three things such a component is judged by:
 * - a shared value is KEPT across renders (a ref), with `.value` and `.get()` / `.set()`;
 * - an animated style is read LIVE: its keys are getters that run the style function again,
 *   so a test reads `translateY` after a gesture without a re-render, exactly as the UI thread
 *   would draw it on the next frame (and a re-render proves JS ran);
 * - a spring does not finish by itself: `withSpring` hands back an animation that the shared
 *   value takes up when it is ASSIGNED. The value does not move until the suite calls
 *   `__live.finish()`, which sets every pending value to its target and calls its callback
 *   with `finished: true`; an assignment, or `cancelAnimation`, drops the animation and calls
 *   its callback with `finished: false`, as the real library does. `__live.springs` lists every
 *   spring that was started, with the configuration it was given.
 *
 * Nothing else of Reanimated is modelled: a suite that needs more adds it here, once.
 */
import { useRef } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

type Callback = ((finished: boolean) => void) | undefined;

interface Animation {
  readonly isMockAnimation: true;
  readonly kind: 'spring' | 'timing';
  readonly to: number;
  readonly config: Record<string, unknown> | undefined;
  readonly callback: Callback;
}

interface Cell {
  current: unknown;
  running: Animation | null;
}

const live = {
  /** Every animation started since the last reset, in order. */
  springs: [] as {
    kind: string;
    to: number;
    config: Record<string, unknown> | undefined;
  }[],
  cells: new Set<Cell>(),
  /** Takes every running animation to its target and tells its callback. */
  finish() {
    for (const cell of live.cells) {
      const animation = cell.running;
      if (animation === null) continue;
      cell.running = null;
      cell.current = animation.to;
      animation.callback?.(true);
    }
  },
  /** How many animations are running. */
  running() {
    return [...live.cells].filter((cell) => cell.running !== null).length;
  },
  reset() {
    live.springs.length = 0;
    live.cells.clear();
  },
};

function isAnimation(value: unknown): value is Animation {
  return typeof value === 'object' && value !== null && 'isMockAnimation' in value;
}

function stop(cell: Cell): void {
  const animation = cell.running;
  cell.running = null;
  animation?.callback?.(false);
}

function assign(cell: Cell, next: unknown): void {
  stop(cell);
  if (isAnimation(next)) {
    cell.running = next;
    live.springs.push({ kind: next.kind, to: next.to, config: next.config });
    return;
  }
  cell.current = next;
}

function createShared<T>(initial: T) {
  const cell: Cell = { current: initial, running: null };
  live.cells.add(cell);
  const shared = {
    get value(): T {
      return cell.current as T;
    },
    set value(next: T) {
      assign(cell, next);
    },
    get: (): T => cell.current as T,
    set: (next: T | ((current: T) => T)) =>
      assign(
        cell,
        typeof next === 'function'
          ? (next as (current: T) => T)(cell.current as T)
          : next,
      ),
    __cell: cell,
  };
  return shared;
}

const animation =
  (kind: Animation['kind']) =>
  (to: number, config?: Record<string, unknown>, callback?: Callback): Animation => ({
    isMockAnimation: true,
    kind,
    to,
    config,
    callback,
  });

module.exports = {
  __esModule: true,
  __live: live,
  default: {
    View,
    Text,
    ScrollView,
    Image,
    createAnimatedComponent: <T>(component: T) => component,
  },
  useSharedValue: <T>(initial: T) => {
    const ref = useRef<ReturnType<typeof createShared<T>> | null>(null);
    if (ref.current === null) ref.current = createShared(initial);
    return ref.current;
  },
  useAnimatedStyle: (factory: () => Record<string, unknown>) => {
    const style: Record<string, unknown> = {};
    for (const key of Object.keys(factory())) {
      Object.defineProperty(style, key, {
        enumerable: true,
        get: () => factory()[key],
      });
    }
    return style;
  },
  useReducedMotion: () => false,
  // Gesture Handler asks for these when Reanimated is installed: an event handler that is never
  // fed (the suite drives the gestures with its own jest-utils) and a state setter.
  useEvent: () => () => undefined,
  setGestureState: () => undefined,
  withSpring: animation('spring'),
  withTiming: animation('timing'),
  cancelAnimation: (shared: { __cell?: Cell }) => {
    if (shared.__cell) stop(shared.__cell);
  },
  runOnJS: <F extends (...args: never[]) => unknown>(fn: F) => fn,
  Easing: new Proxy({}, { get: () => () => ({}) }),
};
