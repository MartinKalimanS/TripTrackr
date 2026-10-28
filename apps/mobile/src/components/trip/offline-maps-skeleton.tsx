/**
 * `OfflineMapsSkeleton` - the offline maps list while something loads (feature 005, F11;
 * FR-064, FR-066; UI-SPEC 9.3 "Skeletons mirror their content"): the storage card's block, a
 * section heading and rows with a 72 dp tile and two lines, the same geometry as the real
 * list (`CityPackCard`, `StorageBar`), so nothing moves when the cities arrive. It is never the
 * empty state.
 *
 *   <OfflineMapsSkeleton label="Checking saved maps" rows={2} />
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`); every shape inside is hidden
 * from assistive technology. It carries no text, so the largest text size cannot clip it, and
 * under reduced motion the shimmer is off (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import { Space } from '@/theme';

import { MAP_TILE_SIZE } from './offline-map-tile';

export type OfflineMapsSkeletonProps = Omit<SkeletonRegionProps, 'testID'> & {
  /** How many rows stand for the cities. Default 2. */
  rows?: number;
};

function RowBones() {
  return (
    <View
      className="flex-row items-center"
      style={{ columnGap: Space[4], paddingVertical: Space[3], minHeight: 88 }}>
      <Bone
        className="rounded-xl"
        style={{ width: MAP_TILE_SIZE, height: MAP_TILE_SIZE }}
      />
      <View className="flex-1" style={{ gap: Space[2] }}>
        <Bone className="h-[22px] w-40 rounded-lg" />
        <Bone className="h-5 w-24 rounded-lg" />
        <Bone className="h-7 w-32 rounded-full" />
      </View>
    </View>
  );
}

export function OfflineMapsSkeleton({ label, rows = 2 }: OfflineMapsSkeletonProps) {
  return (
    <LoadingRegion label={label}>
      <ShimmerGroup>
        <Bone className="h-[104px] rounded-3xl" />
        <Bone
          className="h-[22px] w-32 rounded-lg"
          style={{ marginTop: Space[6], marginBottom: Space[2] }}
        />
        {Array.from({ length: Math.max(1, rows) }, (_, index) => (
          <RowBones key={index} />
        ))}
      </ShimmerGroup>
    </LoadingRegion>
  );
}
