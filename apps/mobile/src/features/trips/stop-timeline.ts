/**
 * What the timeline draws on and between a trip's stops - tasks.md T545 (spec FR-041;
 * data-model section 9 `StopLeg`; research D5-17): which stop is done, which one the traveller
 * is at ("Now") and which come next, and the great-circle distance between consecutive stops.
 *
 * Pure over what the stops already carry and the day it is told today is: the distance is
 * `haversineKm` of `features/globe/great-circle.ts` (the globe's own geometry, which this does
 * not touch), a stop whose city this device has not cached is unplaced and never guessed
 * (Constitution IV), and a leg touching one is `null` rather than bridged over it. Private,
 * local, never transmitted, nothing stored: a derived view of the traveller's own stops.
 */
import { differenceInCalendarDays } from 'date-fns';

import { haversineKm } from '@/features/globe/great-circle';

import { fromIsoDate, isIsoDate, todayIso } from './stop-dates';

export type StopNodeState = 'done' | 'now' | 'next';

export interface StateStop {
  id: string;
  arrive_date: string;
  depart_date: string;
}

/**
 * The state of every stop by id. The stop the traveller is at is the one whose dates cover
 * today; on a travel day, when one stop is left and the next reached, and when stops overlap,
 * the LATER one in the list wins (as `restingCoordinate` of the globe decides). A stop that has
 * begun and is not that one is done; one that has not begun is next. With nothing covering
 * today (between two stops) none is now.
 */
export function stopStates(
  stops: readonly StateStop[],
  today: string = todayIso(),
): Record<string, StopNodeState> {
  const covering = stops.filter(
    (stop) => stop.arrive_date <= today && today <= stop.depart_date,
  );
  const current = covering[covering.length - 1];
  return Object.fromEntries(
    stops.map((stop): [string, StopNodeState] => {
      if (stop === current) return [stop.id, 'now'];
      return [stop.id, stop.arrive_date <= today ? 'done' : 'next'];
    }),
  );
}

export interface LegStop {
  id: string;
  lat: number | null;
  lng: number | null;
}

export interface StopLeg {
  fromStopId: string;
  toStopId: string;
  /** `null` if either end is unplaced. */
  km: number | null;
}

/** A coordinate that is a real position, as the globe reads one (`globe-data.ts`). */
function placed(stop: LegStop): [number, number] | null {
  const { lat, lng } = stop;
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return Math.abs(lng) <= 180 && Math.abs(lat) <= 90 ? [lng, lat] : null;
}

/** One leg per pair of consecutive stops, in the order given. */
export function stopLegs(stops: readonly LegStop[]): StopLeg[] {
  return stops.slice(1).map((to, index) => {
    const from = stops[index] as LegStop;
    const start = placed(from);
    const end = placed(to);
    return {
      fromStopId: from.id,
      toStopId: to.id,
      km: start && end ? haversineKm(start, end) : null,
    };
  });
}

/**
 * Whether the traveller moves on between two stops, so a dotted segment with a distance is
 * drawn: both ends placed and at least a kilometre apart. Less than that is one stay, joined
 * by the solid line alone.
 */
export function hasTransit(leg: StopLeg | undefined): leg is StopLeg & { km: number } {
  return leg !== undefined && leg.km !== null && Math.round(leg.km) >= 1;
}

/** The calendar nights of a stay, or `null` for dates that are not one. */
export function stopNights(stop: StateStop): number | null {
  if (!isIsoDate(stop.arrive_date) || !isIsoDate(stop.depart_date)) return null;
  if (stop.arrive_date > stop.depart_date) return null;
  return differenceInCalendarDays(
    fromIsoDate(stop.depart_date),
    fromIsoDate(stop.arrive_date),
  );
}

/** "Same day", "1 night", "2 nights"; nothing for an unknown stay. */
export function nightsLabel(nights: number | null): string | null {
  if (nights === null) return null;
  if (nights === 0) return 'Same day';
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}
