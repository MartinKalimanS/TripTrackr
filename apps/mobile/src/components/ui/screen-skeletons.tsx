/**
 * The four screen skeletons (feature 005; contract C5-28; screens.md; FR-064, FR-066):
 * what a screen shows while its first load resolves, shaped from the real geometry of the
 * screen so nothing jumps when the content arrives.
 *
 *   <TripListSkeleton />                      a hero (16:10), a ticket, a year, rows
 *   <TripDetailSkeleton />                    hero, status row, four tiles, day chips, stops
 *   <AreaSkeleton rows={4} label="Loading notes" />     a header and rows
 *   <HomeSkeleton discRadius={175} greetingName="Marta" />   a disc and a sheet
 *
 * Each is ONE announced `progressbar` region named by `label` (the screen's own words;
 * `LoadingRegion` of `state-view.tsx`, the region of every skeleton) with every shape
 * hidden from assistive technology, so a screen of forty boxes is one busy region and not
 * forty anonymous focus stops. Each shimmers through ONE `ShimmerGroup` at its root and
 * is still under reduced motion (`skeleton.tsx`). They carry no text except the greeting
 * of `HomeSkeleton`, which is hidden with the rest, so the largest text size cannot clip
 * them; the content that replaces them reflows as usual.
 *
 * Default ids: `trips-skeleton`, `trip-skeleton`, `area-skeleton`, `home-skeleton`.
 * Default names: "Loading trips", "Loading trip", "Loading", "Loading your globe".
 * Dimensions are the screens' own (hero 16:10 and 24 dp, ticket 96 dp, row thumb 64 dp,
 * area tile 72 dp, day chip 56 dp, stop node 28 dp, sheet radius 28 dp); the Home sky is
 * the screen's (`Scrim`), not drawn here. Colours are semantic classes only.
 */
import { View, type ViewStyle } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import { Radii } from '@/theme';

import { useLiftStyle } from './lift';
import { areaColumns } from './reflow';
import { Bone, PhotoBone, ShimmerGroup, wholeCount } from './skeleton';
import { LoadingRegion, type SkeletonRegionProps } from './state-view';
import { Text } from './text';

/** A sheet's top corners: 28 dp on the continuous curve, square below. */
const SHEET_TOP: ViewStyle = {
  borderTopLeftRadius: Radii.sheet,
  borderTopRightRadius: Radii.sheet,
  borderCurve: 'continuous',
};

// ------------------------------------------------------------------ trips

function TripRowBones() {
  return (
    <View className="flex-row items-center gap-4">
      <Bone className="size-16 rounded-2xl" />
      <View className="flex-1 gap-2">
        <Bone className="h-5 w-3/4 rounded-lg" />
        <Bone className="h-4 w-1/2 rounded-lg" />
      </View>
    </View>
  );
}

export type TripListSkeletonProps = SkeletonRegionProps & {
  /** Rows after the hero and the ticket; default 3. A fraction is truncated. */
  rows?: number;
};

export function TripListSkeleton({
  rows = 3,
  label = 'Loading trips',
  testID = 'trips-skeleton',
}: TripListSkeletonProps) {
  return (
    <LoadingRegion label={label} testID={testID}>
      <ShimmerGroup className="gap-4">
        <PhotoBone className="aspect-[16/10] w-full rounded-3xl" />
        <Bone className="h-24 w-full rounded-3xl" />
        <Bone className="mt-2 h-5 w-24 rounded-lg" />
        <View className="gap-3">
          {Array.from({ length: wholeCount(rows, 3) }, (_, index) => (
            <TripRowBones key={index} />
          ))}
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}

// ------------------------------------------------------------------ trip

function StatusRowBones() {
  return (
    <View className="flex-row items-center justify-between">
      <Bone className="h-9 w-40 rounded-full" />
      <Bone className="h-9 w-20 rounded-full" />
    </View>
  );
}

/** The four area tiles: one row, or two rows of two at large text (`areaColumns`). */
function AreaTileBones() {
  const { fontScale } = useAppearance();
  const columns = areaColumns(fontScale);
  return (
    <View className="gap-2">
      {Array.from({ length: 4 / columns }, (_, row) => (
        <View key={row} className="flex-row gap-2">
          {Array.from({ length: columns }, (_, column) => (
            <Bone key={column} className="min-h-[72px] flex-1 rounded-2xl" />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayChipBones() {
  return (
    <View className="flex-row gap-2">
      {Array.from({ length: 5 }, (_, index) => (
        <Bone key={index} className="size-14 rounded-2xl" />
      ))}
    </View>
  );
}

function StopsHeaderBones() {
  return (
    <View className="flex-row items-center justify-between">
      <Bone className="h-6 w-24 rounded-lg" />
      <Bone className="h-9 w-32 rounded-full" />
    </View>
  );
}

function StopBones() {
  return (
    <View className="flex-row items-start gap-3">
      <Bone className="size-7 rounded-full" />
      <View className="flex-1 gap-2">
        <Bone className="h-5 w-1/2 rounded-lg" />
        <Bone className="h-4 w-3/4 rounded-lg" />
      </View>
      <Bone className="size-14 rounded-2xl" />
    </View>
  );
}

export type TripDetailSkeletonProps = SkeletonRegionProps & {
  /** The picture at the top. Leave it out when the screen already shows the cover. */
  hero?: boolean;
};

export function TripDetailSkeleton({
  hero = true,
  label = 'Loading trip',
  testID = 'trip-skeleton',
}: TripDetailSkeletonProps) {
  return (
    <LoadingRegion label={label} testID={testID}>
      <ShimmerGroup>
        {hero ? <PhotoBone className="min-h-[236px] w-full" /> : null}
        <View
          className={`gap-3 bg-surface px-5 pt-4 ${hero ? '-mt-7' : ''}`}
          style={hero ? SHEET_TOP : undefined}>
          <StatusRowBones />
          <AreaTileBones />
          <DayChipBones />
          <StopsHeaderBones />
          <StopBones />
          <StopBones />
          <StopBones />
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}

// ------------------------------------------------------------------ areas

function AreaRowBones() {
  return (
    <View className="flex-row items-center gap-3">
      <Bone className="size-12 rounded-full" />
      <View className="flex-1 gap-2">
        <Bone className="h-4 w-2/3 rounded-lg" />
        <Bone className="h-3 w-1/2 rounded-lg" />
      </View>
      <Bone className="h-5 w-16 rounded-lg" />
    </View>
  );
}

export type AreaSkeletonProps = SkeletonRegionProps & {
  /** Rows under the header; default 4. */
  rows?: number;
};

export function AreaSkeleton({
  rows = 4,
  label = 'Loading',
  testID = 'area-skeleton',
}: AreaSkeletonProps) {
  return (
    <LoadingRegion label={label} testID={testID}>
      <ShimmerGroup className="gap-5">
        <View className="gap-2">
          <Bone className="h-7 w-1/2 rounded-lg" />
          <Bone className="h-4 w-1/3 rounded-lg" />
        </View>
        <View className="gap-4">
          {Array.from({ length: wholeCount(rows, 4) }, (_, index) => (
            <AreaRowBones key={index} />
          ))}
        </View>
      </ShimmerGroup>
    </LoadingRegion>
  );
}

// ------------------------------------------------------------------ home

function StatBones({ first }: { first: boolean }) {
  return (
    <View className={`flex-1 gap-2 px-3 ${first ? 'ps-0' : 'border-s border-separator'}`}>
      <Bone className="h-10 w-2/3 rounded-2xl" />
      <Bone className="h-3.5 w-full rounded-lg" />
    </View>
  );
}

function Greeting({ name, date }: { name?: string; date?: string }) {
  return (
    <View className="gap-0.5 px-5 pt-1">
      {date ? (
        <Text variant="eyebrow" tone="muted">
          {date}
        </Text>
      ) : (
        <Bone className="h-4 w-24 rounded-lg" />
      )}
      {name ? (
        <Text variant="display">
          {'Hello, '}
          <Text variant="accent" tone="accent">
            {name}
          </Text>
        </Text>
      ) : (
        <Bone className="h-10 w-56 rounded-xl" />
      )}
    </View>
  );
}

/**
 * The sheet at the half detent as `home-loading.png` draws it: as tall as the real one when it is
 * given the height, the 36 by 5 grabber 10 dp into a 28 dp zone, 4 dp before the figures, 20 dp
 * at the sides and 16 dp between the rows.
 */
function HomeSheetBones({ height }: { height?: number }) {
  const lift = useLiftStyle('lift2');
  return (
    <View
      className="absolute inset-x-0 bottom-0 gap-4 border border-b-0 border-separator bg-surface px-5 pb-26"
      testID="home-skeleton-sheet"
      style={[SHEET_TOP, lift, height === undefined ? null : { height }]}>
      <View className="-mb-3 h-7 items-center">
        <View className="mt-[10px] h-[5px] w-9 rounded-full bg-grab" />
      </View>
      <View className="flex-row">
        <StatBones first />
        <StatBones first={false} />
        <StatBones first={false} />
      </View>
      <View className="flex-row items-center gap-3 rounded-3xl border border-separator bg-surface-secondary p-2">
        <Bone className="size-16 rounded-2xl" />
        <View className="flex-1 gap-2">
          <Bone className="h-5 w-4/5 rounded-lg" />
          <Bone className="h-4 w-1/2 rounded-lg" />
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <Bone className="size-12 rounded-xl" />
        <View className="flex-1 gap-2">
          <Bone className="h-5 w-2/3 rounded-lg" />
          <Bone className="h-4 w-1/2 rounded-lg" />
        </View>
      </View>
    </View>
  );
}

export type HomeSkeletonProps = SkeletonRegionProps & {
  /** The radius of the disc the globe will mount in (from `globeFit('half')`); default 175. */
  discRadius?: number;
  /** Where the disc's centre is from the top of the screen; default 330. */
  discCentreY?: number;
  /** The name from the previous session, for the greeting; a bone stands in without one. */
  greetingName?: string;
  /** The day's eyebrow ("WED 14 OCT"), shown over the greeting; a bone stands in without one. */
  greetingDate?: string;
  /** The height of the half detent, so the skeleton sheet is as tall as the real one. */
  sheetHeight?: number;
};

export function HomeSkeleton({
  discRadius = 175,
  discCentreY = 330,
  greetingName,
  greetingDate,
  sheetHeight,
  label = 'Loading your globe',
  testID = 'home-skeleton',
}: HomeSkeletonProps) {
  const size = discRadius * 2;
  return (
    <LoadingRegion label={label} testID={testID} className="flex-1" gap="flex-1">
      <ShimmerGroup className="flex-1">
        <Greeting name={greetingName} date={greetingDate} />
        <View
          className="absolute inset-x-0 items-center"
          style={{ top: discCentreY - discRadius }}>
          <Bone className="rounded-full" style={{ width: size, height: size }} />
        </View>
        <HomeSheetBones height={sheetHeight} />
      </ShimmerGroup>
    </LoadingRegion>
  );
}
