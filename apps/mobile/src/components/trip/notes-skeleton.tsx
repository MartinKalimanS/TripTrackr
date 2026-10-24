/**
 * `NotesSkeleton` - the notes list while the store has not answered (T551; FR-064, FR-066;
 * UI-SPEC 9.3 "Skeletons mirror their content"): a day heading and two note-shaped tiles (the
 * title, three lines of excerpt, the foot row), drawn with the real card's geometry (padding
 * 16, radius 16, 12 between), so nothing moves when the notes arrive. Never the empty state.
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`); every shape is hidden. It
 * carries no text, so the largest text size cannot clip it; the shimmer is off under reduced
 * motion (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import { Space } from '@/theme';

function NoteBones() {
  return (
    <View
      className="rounded-2xl border border-separator bg-surface-secondary"
      style={{ padding: Space[4], gap: Space[2] }}>
      <Bone className="h-[22px] w-2/3 rounded-lg" />
      <Bone className="h-5 w-full rounded-lg" />
      <Bone className="h-5 w-full rounded-lg" />
      <Bone className="h-5 w-1/2 rounded-lg" />
      <Bone className="h-4 w-2/5 rounded-lg" style={{ marginTop: Space[2] }} />
    </View>
  );
}

export function NotesSkeleton({ label }: Pick<SkeletonRegionProps, 'label'>) {
  return (
    <LoadingRegion label={label}>
      <ShimmerGroup>
        <View style={{ gap: Space[3] }}>
          <View style={{ paddingTop: Space[2] }}>
            <Bone className="h-[22px] w-24 rounded-lg" />
          </View>
          <NoteBones />
          <NoteBones />
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}
