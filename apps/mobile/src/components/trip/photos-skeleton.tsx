/**
 * `PhotosSkeleton` - the gallery while the store has not answered (feature 005, T549; FR-064,
 * FR-066; UI-SPEC 9.3 "Skeletons mirror their content"): a day header (the numeral's block and
 * two lines) over a mosaic drawn from the SAME geometry as the real one (`mosaicCells`, 114 dp
 * tiles on a 390 dp phone, gap 4, the 16 dp corner), so nothing moves when the photographs
 * arrive. It is never the empty state.
 *
 *   <PhotosSkeleton width={350} label="Loading photos" />
 *
 * ONE announced `progressbar` named `label` (`LoadingRegion`); every shape inside is hidden from
 * assistive technology. It carries no text, so the largest text size cannot clip it, and under
 * reduced motion the shimmer is off (`ShimmerGroup`).
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion, type SkeletonRegionProps } from '@/components/ui/state-view';
import {
  frameOf,
  mosaicCells,
  mosaicHeight,
  tileSize,
} from '@/features/photos/photo-mosaic';
import { Space } from '@/theme';

/** The photographs the placeholder mosaic stands for: the large tile, then two rows. */
const PLACEHOLDER_TILES = 6;

export type PhotosSkeletonProps = SkeletonRegionProps & {
  /** The mosaic's width in dp, as the real one will have. */
  width: number;
};

function DayBones({ width }: { width: number }) {
  const size = tileSize(width);
  const cells = mosaicCells(PLACEHOLDER_TILES);

  return (
    <View style={{ paddingBottom: Space[6] }}>
      <View
        className="flex-row items-center"
        style={{ gap: Space[3], marginBottom: Space[3] }}>
        <Bone className="h-10 w-[52px] rounded-lg" />
        <View className="gap-1">
          <Bone className="h-[22px] w-24 rounded-lg" />
          <Bone className="h-5 w-36 rounded-lg" />
        </View>
      </View>
      <View style={{ width, height: mosaicHeight(cells, size) }}>
        {cells.map((cell) => (
          <Bone
            key={cell.index}
            className="absolute rounded-2xl"
            style={frameOf(cell, size)}
          />
        ))}
      </View>
    </View>
  );
}

export function PhotosSkeleton({ width, label, testID }: PhotosSkeletonProps) {
  return (
    <LoadingRegion label={label} testID={testID}>
      <ShimmerGroup>
        <DayBones width={width} />
      </ShimmerGroup>
    </LoadingRegion>
  );
}
