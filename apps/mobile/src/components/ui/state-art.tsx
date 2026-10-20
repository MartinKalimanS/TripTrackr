/**
 * The art above the words of an empty state (feature 005; contract C5-28; research D5-14;
 * FR-064; owner answer Q-8: empty frames, not commissioned illustrations).
 *
 *   <StateArt variant="frames" testID="photos-empty-art" />
 *
 * - `plain` draws nothing.
 * - `ghost-stamp` is a 96 dp circle drawn in a dashed 2 dp `field-border` line, the outline
 *   of a passport stamp not yet earned: a trip with no stops, an empty passport. (The
 *   `GhostStamp` of `stamp.tsx` is the same idea drawn in SVG; this one needs nothing but a
 *   `View`, so an empty state never waits on the SVG layer.)
 * - `frames` is three tilted empty photo frames, 84 by 108 dp: the cream `surface-secondary`
 *   fill, a photo glyph, a 3 dp `surface` border and the second lift; the left one turned -9 degrees about
 *   its bottom right, the right one 8 degrees about its bottom left, the middle one straight
 *   and 8 dp higher, on top. No stock photographs.
 * - `filtered` is a magnifier in a 64 dp cream roundel: a filter or a search with no result.
 *
 * All of it is decorative: the words under it say everything, so it is hidden from assistive
 * technology on both platforms and takes no touch. `testID` names the art, and the frames are
 * `<testID>-frame-0` to `-2`. Colours are semantic classes, the lift is the token's.
 */
import type { ReactElement } from 'react';
import { View, type ViewStyle } from 'react-native';

import { cornerOf } from '@/theme';

import { Icon, type IconName } from './icon';
import { useLiftStyle } from './lift';

export type EmptyVariant = 'plain' | 'ghost-stamp' | 'frames' | 'filtered';

const HIDDEN = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  pointerEvents: 'none',
} as const;

const PHOTO: IconName = 'image';
const MAGNIFIER: IconName = 'search';

/** Position, tilt and stacking of the three frames, in dp. */
const FRAMES: readonly ViewStyle[] = [
  { left: 0, top: 0, transform: [{ rotate: '-9deg' }], transformOrigin: '80% 100%' },
  { left: 68, top: -8, zIndex: 2 },
  { right: 0, top: 0, transform: [{ rotate: '8deg' }], transformOrigin: '20% 100%' },
];

function Frames({ testID }: { testID?: string }) {
  const lift = useLiftStyle('lift2');
  return (
    <View testID={testID} {...HIDDEN} className="mb-2 h-28 w-[220px] self-center">
      {FRAMES.map((placement, index) => (
        <View
          key={index}
          testID={testID ? `${testID}-frame-${index}` : undefined}
          className="absolute h-[108px] w-[84px] items-center justify-center rounded-2xl border-[3px] border-surface bg-surface-secondary"
          style={[cornerOf('lg'), placement, lift]}>
          <Icon name={PHOTO} size={24} tone="muted" />
        </View>
      ))}
    </View>
  );
}

export function StateArt({
  variant,
  testID,
}: {
  variant: EmptyVariant;
  testID?: string;
}): ReactElement | null {
  switch (variant) {
    case 'ghost-stamp':
      return (
        <View
          testID={testID}
          {...HIDDEN}
          className="mb-2 size-24 rounded-full border-2 border-dashed border-field-border"
        />
      );
    case 'frames':
      return <Frames testID={testID} />;
    case 'filtered':
      return (
        <View
          testID={testID}
          {...HIDDEN}
          className="mb-1 size-16 items-center justify-center rounded-full border border-separator bg-surface-secondary">
          <Icon name={MAGNIFIER} size={24} tone="muted" />
        </View>
      );
    default:
      return null;
  }
}
