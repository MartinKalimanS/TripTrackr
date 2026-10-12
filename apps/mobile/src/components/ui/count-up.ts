/**
 * The engine of `AnimatedNumber` (feature 005; FR-060, FR-077; research D5-11): the easing, the
 * figure format and `useCountUp`, the hook that returns the number to draw this frame.
 *
 * Why a small interval and not a Reanimated shared value: the digits are drawn by an ordinary
 * React `Text` (a `TextInput` with animated props would be the alternative, and it flickers on
 * Android Fabric and announces nothing, D5-11), so every frame needs the JavaScript thread
 * anyway, and a UI-thread clock would only add a worklet hop per frame for the same render.
 * The interval runs at about 30 frames a second, only while a count is under way, and takes its
 * progress from the elapsed time (`Date.now()`), never from a tick count: a slow frame costs
 * smoothness, not time, and the count ends exactly when its duration says. The curve is
 * `Easing.out(Easing.cubic)` of Reanimated, written out (`easeOutCubic`): the same number at
 * every point, with no import of a native runtime into a component that does not need one,
 * which also keeps every screen's test free of a Reanimated double.
 *
 * Reduced motion and unsupported cases are the caller's: `enabled: false` returns the target
 * at once and sets no timer.
 */
import { useEffect, useRef, useState } from 'react';

/** About 30 frames a second: smooth for digits, and a re-render of one small `Text` each. */
export const FRAME_MS = 33;

/** `Easing.out(Easing.cubic)`: fast at first, gentle at the end. `t` is clamped to 0..1. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - (1 - clamped) ** 3;
}

/**
 * Where a count from `from` to `to` is `elapsedMs` into a run of `durationMs`: the start before
 * the clock starts, the target exactly once it has run (or when there is no duration).
 */
export function countUpValue(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  if (elapsedMs <= 0) return from;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}

type Formatter = Pick<Intl.NumberFormat, 'format'>;

const formatters = new Map<string, Formatter>();

const PLAIN: Formatter = { format: (value) => String(Math.round(Number(value))) };

/** `Intl` constructors are slow on Hermes and a count draws ~21 frames: one per locale and options. */
function formatterFor(locale: string, options: Intl.NumberFormatOptions): Formatter {
  const key = `${locale}|${JSON.stringify(options)}`;
  const known = formatters.get(key);
  if (known) return known;
  const attempt = (tag: string): Formatter | null => {
    try {
      return new Intl.NumberFormat(tag, options);
    } catch {
      return null;
    }
  };
  // An unknown locale is read as English; options Intl refuses leave the plain integer.
  const made = attempt(locale) ?? attempt('en') ?? PLAIN;
  formatters.set(key, made);
  return made;
}

/**
 * A figure as the device writes it: a whole number grouped by the locale ("12,346", "12.346")
 * unless `options` ask for more (`maximumFractionDigits`, `notation`, `style: 'percent'`...).
 * For non-negative figures: counts, distances, years.
 */
export function formatFigure(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatterFor(locale, { maximumFractionDigits: 0, ...options }).format(value);
}

export interface CountUpOptions {
  /** False under reduced motion: the target at once, no timer. */
  enabled: boolean;
  durationMs: number;
  /** Wait this long before the count starts (the 80 ms stagger of three figures). */
  delayMs: number;
}

/**
 * The number to draw. It counts from 0 to `target` on mount, and on a new target it counts on
 * from the figure last drawn (a count in flight is replaced, never stacked). With
 * `enabled: false` it is the target on every render, and switching `enabled` live neither
 * restarts nor strands a count.
 */
export function useCountUp(
  target: number,
  { enabled, durationMs, delayMs }: CountUpOptions,
): number {
  const [frame, setFrame] = useState(enabled ? 0 : target);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const drawn = useRef(enabled ? 0 : target);

  // A change of `enabled` settles on the target during this render, so a count that was
  // interrupted cannot leave a stale figure behind when motion comes back.
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    setFrame(target);
  }

  useEffect(() => {
    if (!enabled) {
      drawn.current = target;
      return undefined;
    }
    const from = drawn.current;
    if (from === target) return undefined;
    const startAt = Date.now() + delayMs;
    const timer = setInterval(() => {
      const value = countUpValue(from, target, Date.now() - startAt, durationMs);
      drawn.current = value;
      setFrame(value);
      if (value === target) clearInterval(timer);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [enabled, target, durationMs, delayMs]);

  return enabled ? frame : target;
}
