/**
 * The shimmering placeholder every skeleton is built from (feature 005; contract C5-28;
 * research D5-14; FR-064, FR-066), over the kit's `SkeletonGroup` and its Item.
 *
 *   <ShimmerGroup className="gap-4">
 *     <Bone className="h-24 w-full rounded-3xl" />
 *     <PhotoBone className="aspect-[16/10] w-full rounded-3xl" />
 *   </ShimmerGroup>
 *
 * - `Bone` is one placeholder box: the `skeleton` fill (the kit's own is a 30 percent
 *   muted mix, which the cream palette replaces) in the shape its classes give it. It
 *   carries no role, name or focus: a skeleton is announced once, by its region
 *   (`LoadingRegion` in `state-view.tsx`), and its shapes are hidden.
 * - `ShimmerGroup` is the kit's group with the Sunrise motion (`useSkeletonMotion`): a 1.4 s
 *   shimmer whose highlight is the `skeletonHighlight` colour, handed to every Bone below it
 *   through the kit's context, so a shape needs only ONE group at its root. A Bone outside a
 *   group is a kit error, as the kit's own Item is.
 * - Reduced motion: when the traveller asked for less motion the group is `variant="none"`
 *   and `animation="disable-all"`, so there is no shimmer and no fade either (the kit's
 *   `ReduceMotion.System` only follows the OS flag read once at launch; this follows
 *   `useAppearance`, which is live). The provider's own `animation: 'disable-all'` (root
 *   layout) disables the same through the kit's context.
 * - `PhotoBone` is a photograph's placeholder and carries a pin glyph in the middle of it
 *   (C5-28), decorative and not a touch target.
 *
 * Colours are semantic classes and `useThemeColor`, never a literal.
 */
import { SkeletonGroup, useThemeColor, type ThemeColor } from 'heroui-native';
import { useMemo, type ComponentProps } from 'react';
import { View } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { Icon, type IconName } from './icon';

type GroupProps = ComponentProps<typeof SkeletonGroup>;
type ItemProps = ComponentProps<typeof SkeletonGroup.Item>;

/** What a group is told about motion: shimmer, or nothing at all. */
export type SkeletonMotion = Pick<GroupProps, 'variant' | 'animation'>;

const STILL: SkeletonMotion = { variant: 'none', animation: 'disable-all' };

/** The shimmer of C5-9 (1.4 s, linear) in the highlight colour, or none under reduced motion. */
export function useSkeletonMotion(): SkeletonMotion {
  const { prefersLessMotion } = useAppearance();
  const highlightColor = useThemeColor('skeleton-highlight' as ThemeColor);
  return useMemo(
    () =>
      prefersLessMotion
        ? STILL
        : {
            variant: 'shimmer',
            animation: { shimmer: { duration: Motion.shimmerMs, highlightColor } },
          },
    [prefersLessMotion, highlightColor],
  );
}

/** The kit's group, shimmering as the traveller's settings allow. */
export function ShimmerGroup(props: GroupProps) {
  const motion = useSkeletonMotion();
  return <SkeletonGroup {...motion} {...props} />;
}

/** One placeholder box; its classes give it its shape. Inside a `ShimmerGroup`. */
export function Bone({ className, ...rest }: ItemProps) {
  return (
    <SkeletonGroup.Item
      className={className ? `bg-skeleton ${className}` : 'bg-skeleton'}
      {...rest}
    />
  );
}

const PIN: IconName = 'map-pin';

export type PhotoBoneProps = ItemProps & {
  /** Layout classes for the box that holds the bone and its glyph (a `flex-1`). */
  wrapperClassName?: string;
};

/** A photograph's placeholder: a bone with a decorative pin glyph centred on it. */
export function PhotoBone({ wrapperClassName, testID, ...bone }: PhotoBoneProps) {
  return (
    <View className={wrapperClassName}>
      <Bone testID={testID} {...bone} />
      <View
        testID={testID ? `${testID}-glyph` : undefined}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-0 items-center justify-center opacity-50">
        <Icon name={PIN} size={24} tone="muted" />
      </View>
    </View>
  );
}

/** A whole count of at least zero: a fraction is truncated, anything else is `fallback`. */
export function wholeCount(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}
