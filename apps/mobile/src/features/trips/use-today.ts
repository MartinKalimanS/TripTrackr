/**
 * `useToday` - the local calendar day as state (feature 005, T539/T540 review; FR-031 "Active
 * · Day N of M"; research D-25: a calendar day is local, never UTC).
 *
 * A trip card's status, "Day 3 of 8" and "Starts in 94 days" are functions of today. A tab
 * screen stays mounted for as long as the app lives, so a day read once, when the store last
 * changed, is a day behind after midnight and after a night in the background. This hook says
 * when the day changes, two ways, because neither is enough alone:
 *
 *   - a timer to one second past the next local midnight, for an app left open across it
 *     (and again after each, so it keeps turning over);
 *   - the return to the foreground, because timers do not run while the app is away: it reads
 *     the clock then and starts the timer again.
 *
 * It reads the clock and nothing else: no store, no network, nothing kept (D5-17).
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayIso } from './stop-dates';

/** Milliseconds to one second past the next local midnight (a calendar step, so DST-safe). */
export function msUntilNextDay(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return next.getTime() - now.getTime();
}

export function useToday(): string {
  const [today, setToday] = useState(todayIso);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => setToday(todayIso());
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msUntilNextDay());
    };

    arm();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refresh();
      arm();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
