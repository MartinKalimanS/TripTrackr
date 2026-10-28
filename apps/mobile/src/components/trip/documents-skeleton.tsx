/**
 * `DocumentsSkeleton` - the documents list while the store has not answered (feature 005, T552;
 * FR-064, FR-066; UI-SPEC 9.3 "Skeletons mirror their content"): three ticket-shaped blocks
 * with the geometry of the real ticket (104 dp at the least, the 24 dp corner, 12 dp between
 * them), so nothing moves when the documents arrive. It is never the empty state.
 *
 *   <DocumentsSkeleton label="Loading documents" />
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`); every shape is hidden from
 * assistive technology and carries no text, so the largest text size cannot clip it. Under
 * reduced motion the shimmer is off (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import { Space } from '@/theme';

import { TICKET_MIN_HEIGHT } from './document-ticket';

const PLACEHOLDER_TICKETS = 3;

export function DocumentsSkeleton({ label }: Pick<SkeletonRegionProps, 'label'>) {
  return (
    <LoadingRegion label={label} testID="documents-skeleton">
      <ShimmerGroup>
        <View style={{ gap: Space[3] }}>
          {Array.from({ length: PLACEHOLDER_TICKETS }, (_, index) => (
            <Bone
              key={index}
              testID={`documents-skeleton-ticket-${index}`}
              className="rounded-3xl"
              style={{ height: TICKET_MIN_HEIGHT }}
            />
          ))}
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}
