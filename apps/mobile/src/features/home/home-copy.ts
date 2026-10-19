/**
 * What the Home sheet's trip cards say, in words (feature 005, T535; FR-014, FR-070, FR-076,
 * FR-077): the line under a live trip's title, and the one accessible name a card or row
 * carries so a screen reader hears everything the card shows without reading its decoration.
 * Status is always a word here ("active", "planned"), never a colour (FR-070).
 */
import { plannedLine, inDays, monthYear } from './home-format';
import type { HomeTrip } from './home-trips';

/** "Day 3 of 8 · Sintra", or "Day 3 of 8" when the place is not known. */
export function liveLine(trip: HomeTrip): string {
  if (trip.dayOf === null) return '';
  const day = `Day ${trip.dayOf.day} of ${trip.dayOf.of}`;
  return trip.place === null ? day : `${day} \u00b7 ${trip.place}`;
}

/** The line under a card's title: the live line, or the planned one. */
export function tripLine(trip: HomeTrip, languageTag: string): string {
  return trip.status === 'active'
    ? liveLine(trip)
    : plannedLine(trip.startsOn, trip.daysToGo, languageTag);
}

/**
 * The name of a card or row: "Portugal Road Trip, active, day 3 of 8, in Sintra",
 * "Iceland Ring Road, planned, Jan 2027, in 94 days".
 */
export function tripLabel(trip: HomeTrip, languageTag: string): string {
  if (trip.status === 'active') {
    const parts = [trip.title, 'active'];
    if (trip.dayOf !== null) parts.push(`day ${trip.dayOf.day} of ${trip.dayOf.of}`);
    if (trip.place !== null) parts.push(`in ${trip.place}`);
    return parts.join(', ');
  }
  const parts = [trip.title, 'planned'];
  if (trip.startsOn !== null) parts.push(monthYear(trip.startsOn, languageTag));
  if (trip.daysToGo !== null) parts.push(inDays(trip.daysToGo, languageTag));
  return parts.join(', ');
}
