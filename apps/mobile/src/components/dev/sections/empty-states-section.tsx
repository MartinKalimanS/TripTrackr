/**
 * The states of a screen (feature 005, T524; contract C5-28): the four empty states
 * (`plain`, `ghost-stamp`, `frames`, `filtered`), an error with its retry and the loading
 * state. An empty state offers a secondary action unless the screen has no primary of its own.
 */
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';

import { Section } from '../gallery-parts';

const noop = () => undefined;

export function EmptyStatesSection() {
  return (
    <Section
      id="empty-states"
      title="Empty, error, loading"
      note="Four empty states. Words and a glyph carry the meaning, never colour.">
      <EmptyState
        variant="plain"
        icon="map"
        title="No offline maps yet"
        detail="Download a city to use its map without a signal."
        testID="gallery-empty-plain"
      />
      <EmptyState
        variant="ghost-stamp"
        title="Your passport is empty"
        detail="Your first trip earns your first stamp."
        action={{ label: 'Plan a trip', onPress: noop, primary: true }}
        testID="gallery-empty-ghost-stamp"
      />
      <EmptyState
        variant="frames"
        title="No photographs yet"
        detail="Photos you add to a trip appear here."
        action={{ label: 'Add photos', onPress: noop }}
        testID="gallery-empty-frames"
      />
      <EmptyState
        variant="filtered"
        title="Nothing matches"
        detail="Try another filter or clear the search."
        action={{ label: 'Clear filters', onPress: noop }}
        testID="gallery-empty-filtered"
      />
      <ErrorState
        title="We could not load your trips"
        detail="Your trips are safe on this device."
        onRetry={noop}
        testID="gallery-error"
      />
      <LoadingState title="Opening your journal" testID="gallery-loading" />
    </Section>
  );
}
