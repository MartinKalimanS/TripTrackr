/**
 * `useNow` - the time the gallery judges "just synced" at (tasks.md T549; `isJustSynced`).
 *
 * Reading the clock while rendering is impure, and setting state from an effect cascades
 * renders, so the time lives in a tiny external store: the hook reads it with
 * `useSyncExternalStore` and refreshes it, in an effect, whenever `changed` does (a
 * photograph's upload landing changes the photographs). A tick therefore never outlives its
 * few minutes by more than the time between two changes, and never shows for a photograph
 * from long ago. The store is shared and has no timer: nothing runs while nothing changes.
 */
import { useEffect, useSyncExternalStore } from 'react';

let current = Date.now();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => current;

/** Reads the clock now and tells every subscriber. */
export function refreshNow(): void {
  current = Date.now();
  listeners.forEach((listener) => listener());
}

/** The time of the last refresh; refreshed on mount and whenever `changed` changes. */
export function useNow(changed: unknown): number {
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    refreshNow();
  }, [changed]);
  return now;
}
