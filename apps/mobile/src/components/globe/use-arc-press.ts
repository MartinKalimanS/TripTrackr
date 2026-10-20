/**
 * Tapping a connection or a stop marker opens its trip — T096, FR-047.
 *
 * Mapbox hands a source's `onPress` every rendered feature inside the hit box
 * (`@rnmapbox/maps` ShapeSource, `OnPressEvent.features`). Where connections
 * of several trips overlap, the active one opens first, then a planned one,
 * then a past one (spec Edge Cases, "Globe"); among equals, the first feature
 * reported wins. A feature without a trip id — anything that is not ours — is
 * ignored rather than guessed at.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Structural: what the handler reads from a Mapbox press, so tests need no SDK. */
export type PressedFeature = { properties?: Record<string, unknown> | null };
export type GlobePressEvent = { features: readonly PressedFeature[] };

const PRIORITY = new Map<unknown, number>([
  ['active', 0],
  ['planning', 1],
  ['past', 2],
]);

export function tripIdFromPress(features: readonly PressedFeature[]): string | null {
  let best: { id: string; rank: number } | null = null;
  for (const { properties } of features) {
    const id = properties?.trip_id;
    if (typeof id !== 'string') continue;
    const rank = PRIORITY.get(properties?.status) ?? PRIORITY.size;
    if (!best || rank < best.rank) best = { id, rank };
  }
  return best?.id ?? null;
}

export function useArcPress(): (event: GlobePressEvent) => void {
  const router = useRouter();
  return useCallback(
    (event: GlobePressEvent) => {
      const tripId = tripIdFromPress(event.features);
      if (tripId) router.push(`/trip/${tripId}`);
    },
    [router],
  );
}
