/**
 * What the passport part of the You screen shows while the store has not answered (feature 005,
 * F13, T557; FR-064, FR-066; contract C5-28; UI-SPEC section 9.3): the shapes of the period
 * switch, the passport card, the recap entry and the stamps page at their real sizes, so nothing
 * jumps when the figures arrive. ONE announced `progressbar` ("Loading your passport") with
 * every shape hidden from assistive technology, one shimmer group, still under reduced motion.
 * The identity block and the groups below do not wait for it: they come from the session, so
 * Sign out is reachable at all times.
 */
import { View } from 'react-native';

import { Bone, ShimmerGroup } from '@/components/ui/skeleton';
import { LoadingRegion } from '@/components/ui/state-view';

export function PassportSkeleton() {
  return (
    <LoadingRegion label="Loading your passport" testID="passport-skeleton" gap="gap-4">
      <ShimmerGroup className="gap-4">
        <Bone className="h-11 w-full rounded-full" />
        <Bone className="h-[268px] w-full rounded-3xl" />
        <Bone className="h-[72px] w-full rounded-3xl" />
        <View className="gap-3">
          <Bone className="h-[300px] w-full rounded-3xl" />
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}
