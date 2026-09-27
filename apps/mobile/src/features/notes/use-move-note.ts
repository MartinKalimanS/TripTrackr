/**
 * Moving a note between anchor levels — tasks.md T085 (FR-018, FR-019).
 *
 * The three levels are one shape (data-model.md §4), so a move is an update
 * of two nullable anchors and nothing else: the body and `created_at` are
 * untouched by construction. The levels a note can move to are derived from
 * the trip's stops — its countries and its cities — plus "the whole trip",
 * which is the trip's sole country with no city.
 *
 * `noteAnchored` from the contracts is the rule: a target with neither anchor
 * is not offered, and the repository refuses it anyway.
 */
import { noteAnchored } from '@triptrackr/contracts';
import { useCallback, useMemo } from 'react';

import type { NoteAnchor } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';

import { useNoteActions } from './use-notes';

export type AnchorLevel = 'trip' | 'country' | 'city';

export interface AnchorTarget extends NoteAnchor {
  level: AnchorLevel;
  /** "Italy", "Firenze, Italy" — what the picker shows. */
  label: string;
  /** Stable key for lists: `country:1`, `city:101`. */
  key: string;
}

/** Which level a note currently sits at (FR-017). */
export function levelOf(anchor: NoteAnchor): AnchorLevel {
  if (anchor.city_id !== null) return 'city';
  return 'country';
}

/**
 * Pure: every level the trip's stops make available. One entry per distinct
 * country (the "country" level — or "trip" when the trip has a single
 * country) and one per distinct city.
 */
export function anchorTargets(stops: readonly StopWithPlace[]): AnchorTarget[] {
  const countries = new Map<number, string>();
  const cities = new Map<number, { name: string; country: string; countryId: number }>();

  for (const stop of stops) {
    // A stop whose city is not in the cache has no country id to offer.
    const cityName = stop.city_name ?? `City #${stop.city_id}`;
    const countryName = stop.country_name ?? 'Unknown country';
    const countryId = stop.country_id ?? null;
    if (countryId !== null && !countries.has(countryId))
      countries.set(countryId, countryName);
    if (!cities.has(stop.city_id)) {
      cities.set(stop.city_id, {
        name: cityName,
        country: countryName,
        countryId: countryId ?? 0,
      });
    }
  }

  const single = countries.size === 1;
  const countryTargets: AnchorTarget[] = [...countries].map(([id, name]) => ({
    level: single ? 'trip' : 'country',
    key: `country:${id}`,
    label: single ? `Whole trip (${name})` : name,
    country_id: id,
    city_id: null,
  }));
  const cityTargets: AnchorTarget[] = [...cities].map(([id, city]) => ({
    level: 'city',
    key: `city:${id}`,
    label: `${city.name}, ${city.country}`,
    country_id: city.countryId || null,
    city_id: id,
  }));

  return [...countryTargets, ...cityTargets].filter((target) =>
    noteAnchored.check(target),
  );
}

export function isCurrentAnchor(target: NoteAnchor, note: NoteAnchor): boolean {
  return target.country_id === note.country_id && target.city_id === note.city_id;
}

/** The move itself: a local write, dirtied for sync, body and creation date kept. */
export function useMoveNote() {
  const { updateNote } = useNoteActions();
  const move = useCallback(
    (noteId: string, target: NoteAnchor) =>
      updateNote(noteId, { country_id: target.country_id, city_id: target.city_id }),
    [updateNote],
  );
  return useMemo(() => ({ move }), [move]);
}
