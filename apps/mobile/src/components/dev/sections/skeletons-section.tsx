/**
 * Skeletons (feature 005, T524; contract C5-28): every placeholder the app draws, each in its
 * own frame, each announcing exactly ONE `progressbar` with its shapes hidden from assistive
 * technology. The shimmer runs at 1.4 s; under reduced motion it is still.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Scrim } from '@/components/ui/scrim';
import {
  AreaSkeleton,
  HomeSkeleton,
  TripDetailSkeleton,
  TripListSkeleton,
} from '@/components/ui/screen-skeletons';
import { PhotoBone, ShimmerGroup } from '@/components/ui/skeleton';
import {
  ListSkeleton,
  LoadingRegion,
  RowSkeleton,
  TripCardSkeleton,
} from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';

import { Frame, Section } from '../gallery-parts';

interface BoxProps {
  /** The name in the frame's id: `gallery-skeleton-<name>`. */
  name: string;
  height?: number;
  children: ReactNode;
}

/** One skeleton in a clipped frame: the frame is what a test counts progressbars in. */
function Box({ name, height, children }: BoxProps) {
  return (
    <View className="gap-2">
      <Text variant="eyebrow" tone="muted">
        {name}
      </Text>
      {height ? (
        <Frame height={height} testID={`gallery-skeleton-${name}`}>
          {children}
        </Frame>
      ) : (
        <View testID={`gallery-skeleton-${name}`}>{children}</View>
      )}
    </View>
  );
}

function PhotoSkeleton() {
  return (
    <LoadingRegion label="Loading photograph" gap="min-h-[160px]">
      <ShimmerGroup>
        <PhotoBone className="min-h-[160px] w-full rounded-2xl" />
      </ShimmerGroup>
    </LoadingRegion>
  );
}

export function SkeletonsSection() {
  return (
    <Section
      id="skeletons"
      title="Skeletons"
      note="One progressbar each. With Reduce Motion on, the shimmer is still.">
      <Box name="trips">
        <TripListSkeleton rows={2} testID="gallery-trips-skeleton" />
      </Box>
      <Box name="trip" height={420}>
        <TripDetailSkeleton testID="gallery-trip-skeleton" />
      </Box>
      <Box name="areas">
        <AreaSkeleton rows={2} testID="gallery-area-skeleton" />
      </Box>
      <Box name="home" height={420}>
        <Scrim kind="sky" />
        <HomeSkeleton
          discRadius={110}
          discCentreY={170}
          greetingName="Marti"
          testID="gallery-home-skeleton"
        />
      </Box>
      <Box name="cards">
        <ListSkeleton variant="card" rows={2} testID="gallery-list-card-skeleton" />
      </Box>
      <Box name="rows">
        <ListSkeleton variant="row" rows={3} testID="gallery-list-row-skeleton" />
      </Box>
      <Box name="card">
        <TripCardSkeleton testID="gallery-card-skeleton" />
      </Box>
      <Box name="row">
        <RowSkeleton testID="gallery-row-skeleton" />
      </Box>
      <Box name="photo">
        <PhotoSkeleton />
      </Box>
    </Section>
  );
}
