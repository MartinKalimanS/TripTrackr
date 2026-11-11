/**
 * Searching trips by name, on the device (spec 015, T1506, FR-010). Case and accents are ignored and
 * every word of the query must appear somewhere in the name, so "trip portugal" finds
 * "Portugal Road Trip". Nothing is sent anywhere: the list is the local store's.
 */
import type { TripCardModel } from '@/features/trips/trip-card-model';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function searchTrips(
  cards: readonly TripCardModel[],
  query: string,
): readonly TripCardModel[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return cards;
  return cards.filter((card) => {
    const title = fold(card.title);
    return words.every((word) => title.includes(word));
  });
}
