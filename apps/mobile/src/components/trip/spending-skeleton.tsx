/**
 * `SpendingSkeleton` - the spending screen while the store has not answered (feature 005, T550;
 * FR-064, FR-066; UI-SPEC 9.3 "Skeletons mirror their content"): the label and the big amount, the
 * pill, the bars of the chart (the plot's 96 dp and the 32 dp columns), the category bar and its
 * legend, a day header and three rows (40 dp disc, two lines, an amount). Drawn from the same
 * dimensions as the real thing so nothing moves when the figures arrive. It is never the empty
 * state.
 *
 *   <SpendingSkeleton label="Loading expenses" />
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`); every shape inside is hidden from
 * assistive technology. It carries no text, so the largest text size cannot clip it, and under
 * reduced motion the shimmer is off (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import { Space } from '@/theme';

import { PLOT_HEIGHT } from './day-bars';

const BAR_HEIGHTS = [1, 0.8, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1];

function HeroBones() {
  return (
    <View style={{ gap: Space[2], paddingBottom: Space[5] }}>
      <Bone className="h-5 w-28 rounded-lg" />
      <Bone className="h-[60px] w-48 rounded-lg" />
      <Bone className="h-7 w-44 rounded-2xl" />
    </View>
  );
}

function ChartBones() {
  return (
    <View
      className="border-t border-separator"
      style={{ paddingTop: Space[3], paddingBottom: Space[5], gap: Space[3] }}>
      <Bone className="h-6 w-20 rounded-lg" />
      <View
        className="flex-row items-end justify-between"
        style={{ height: PLOT_HEIGHT + 38 }}>
        {BAR_HEIGHTS.map((share, index) => (
          <View key={index} className="items-center" style={{ width: 32, gap: Space[1] }}>
            <Bone
              className="w-full rounded-lg"
              style={{ height: Math.max(4, share * PLOT_HEIGHT) }}
            />
            <Bone className="h-5 w-6 rounded" />
            <Bone className="h-[18px] w-7 rounded" />
          </View>
        ))}
      </View>
    </View>
  );
}

function CategoryBones() {
  return (
    <View style={{ paddingBottom: Space[5], gap: Space[3] }}>
      <Bone className="h-3 w-full rounded-full" />
      <View className="flex-row flex-wrap" style={{ gap: Space[4] }}>
        <Bone className="h-6 w-28 rounded-lg" />
        <Bone className="h-6 w-32 rounded-lg" />
        <Bone className="h-6 w-36 rounded-lg" />
      </View>
    </View>
  );
}

function RowBones() {
  return (
    <View
      className="flex-row items-center"
      style={{ minHeight: 64, gap: Space[3], paddingVertical: Space[2] }}>
      <Bone className="size-10 rounded-full" />
      <View className="flex-1 gap-2">
        <Bone className="h-5 w-3/4 rounded-lg" />
        <Bone className="h-4 w-1/2 rounded-lg" />
      </View>
      <Bone className="h-5 w-16 rounded-lg" />
    </View>
  );
}

export function SpendingSkeleton({ label, testID }: SkeletonRegionProps) {
  return (
    <LoadingRegion label={label} testID={testID}>
      <ShimmerGroup>
        <HeroBones />
        <ChartBones />
        <CategoryBones />
        <View className="border-t border-separator" style={{ paddingTop: Space[3] }}>
          <Bone className="h-6 w-40 rounded-lg" style={{ marginBottom: Space[1] }} />
          <RowBones />
          <RowBones />
          <RowBones />
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}
