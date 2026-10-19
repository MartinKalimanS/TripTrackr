/**
 * `useGlobeActions` - the globe without dragging or sight (feature 005, T537; FR-017; contract
 * C5-24): the map's accessibility actions, which a screen reader offers on the globe's one
 * announced element (`GlobeView` forwards them to its `MapView`):
 *
 *   const { accessibilityActions, onAccessibilityAction } = useGlobeActions({ ... });
 *   <GlobeView accessibilityActions={accessibilityActions}
 *              onAccessibilityAction={onAccessibilityAction} ... />
 *
 * - "Next trip" and "Previous trip" step through the trips that have a place on the map,
 *   earliest first (`globe-actions.ts`), starting from the trip the globe is focused on. A step
 *   flies the camera to the trip (a jump under reduced motion) and says its name aloud, since the
 *   map itself is silent. Each step is the traveller moving the globe (`onMoved`), so the idle
 *   spin stops and the recentre control appears.
 * - "Recentre the globe" and "Open countries" are the Home's: the Home recentres the camera and
 *   raises the sheet to the Countries list. The traveller hears that the globe was recentred.
 *
 * Every trip on the globe also stays reachable from the Trips screen (feature 003): these are an
 * additional way, not the only one. Nothing is stored and nothing is sent.
 */
import { useMemo, useRef, type RefObject } from 'react';
import { AccessibilityInfo, type AccessibilityActionEvent } from 'react-native';

import type { GlobeTrip } from '@/features/globe/globe-data';
import { placedTrips, stepTrip } from '@/features/globe/globe-actions';
import { flyMove } from '@/features/globe/globe-moves';

import type { GlobeHandle } from './globe-view';

/** The actions, named for the platform's action menu (the label is what is spoken). */
export const GLOBE_ACTIONS = [
  { name: 'nextTrip', label: 'Next trip' },
  { name: 'previousTrip', label: 'Previous trip' },
  { name: 'recentre', label: 'Recentre the globe' },
  { name: 'openCountries', label: 'Open countries' },
] as const;

export interface GlobeActionsOptions {
  trips: readonly GlobeTrip[];
  /** The trips the globe is focused on (`focusTripIds`): where "next" starts from. */
  focus: readonly string[];
  today: string;
  handle: RefObject<Pick<GlobeHandle, 'setCamera'> | null>;
  /** False under reduced motion: the camera jumps. */
  animated: boolean;
  onRecentre: () => void;
  onOpenCountries: () => void;
  /** The traveller moved the globe with an action. */
  onMoved: () => void;
}

export interface GlobeActions {
  accessibilityActions: typeof GLOBE_ACTIONS;
  onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}

export function useGlobeActions({
  trips,
  focus,
  today,
  handle,
  animated,
  onRecentre,
  onOpenCountries,
  onMoved,
}: GlobeActionsOptions): GlobeActions {
  const places = useMemo(() => placedTrips(trips, today), [trips, today]);
  const cursor = useRef<string | null>(focus[0] ?? null);

  const step = (direction: 1 | -1) => {
    const place = stepTrip(places, cursor.current, direction);
    if (place === null) return;
    cursor.current = place.tripId;
    handle.current?.setCamera(flyMove(place.coordinate, animated));
    AccessibilityInfo.announceForAccessibility(place.title);
    onMoved();
  };

  const onAccessibilityAction = ({ nativeEvent }: AccessibilityActionEvent) => {
    switch (nativeEvent.actionName) {
      case 'nextTrip':
        return step(1);
      case 'previousTrip':
        return step(-1);
      case 'recentre':
        onRecentre();
        return AccessibilityInfo.announceForAccessibility('Globe recentred');
      case 'openCountries':
        return onOpenCountries();
      default:
        return undefined;
    }
  };

  return { accessibilityActions: GLOBE_ACTIONS, onAccessibilityAction };
}
