/**
 * `DocumentViewSkeleton` - the document viewer while the store has not answered (feature 005,
 * T559; FR-064; UI-SPEC 9.3 "Skeletons mirror their content"): the scan's card at the picture's
 * default proportions (4 by 3, the 16 dp round of the hero) and four rows of the details group
 * under it, so nothing moves when the document arrives. It replaces the spinner this screen drew
 * for the wait; it is never the "not on this device" state.
 *
 *   <DocumentViewSkeleton label="Loading the document" />
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`), the name the spinner had; every
 * shape is hidden from assistive technology and carries no text, so the largest text size
 * cannot clip it. Under reduced motion the shimmer is off (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import { Space } from '@/theme';

const ROWS = 4;

export function DocumentViewSkeleton({
  label = 'Loading the document',
}: Pick<SkeletonRegionProps, 'label'>) {
  return (
    <LoadingRegion label={label} testID="document-view-skeleton">
      <ShimmerGroup>
        <View style={{ gap: Space[4] }}>
          <Bone className="aspect-[4/3] w-full rounded-2xl" />
          <View style={{ gap: Space[3] }}>
            {Array.from({ length: ROWS }, (_, index) => (
              <View key={index} className="min-h-14 flex-row items-center gap-3">
                <Bone className="h-4 w-1/3 rounded-lg" />
                <Bone className="h-4 flex-1 rounded-lg" />
              </View>
            ))}
          </View>
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}
