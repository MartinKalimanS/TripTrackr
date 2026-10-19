/**
 * The trip cards of the Trips tab (feature 005, T524; contract C5-19): the hero card of the
 * active trip, the ticket of a planned one, and the row of a past one with and without
 * changes waiting to sync. Every cover is generated (no photograph, no network).
 */

import { TicketCard } from '@/components/trip/ticket-card';
import { TripHeroCard } from '@/components/trip/trip-hero-card';
import { TripRow } from '@/components/trip/trip-row';

import { galleryPastTrip, galleryPlannedTrip, galleryTrip } from '../fixtures';
import { Labelled, Section } from '../gallery-parts';

const noop = () => undefined;

export function TripsSection() {
  return (
    <Section
      id="trips"
      title="Trip cards"
      note="Hero, ticket and row. At scale 2 the ticket stacks and the row shrinks its thumbnail.">
      <Labelled label="Hero · active, day 3 of 8">
        <TripHeroCard trip={galleryTrip()} onPress={noop} />
      </Labelled>
      <Labelled label="Ticket · planned, in 94 days">
        <TicketCard trip={galleryPlannedTrip()} onPress={noop} />
      </Labelled>
      <Labelled label="Row · past, and past with changes waiting">
        <TripRow trip={galleryPastTrip(false)} onPress={noop} />
        <TripRow trip={galleryPastTrip(true)} onPress={noop} />
      </Labelled>
    </Section>
  );
}
