/**
 * `SegmentedPill` - a row of exclusive choices in one capsule (feature 005, T520; contract
 * C5-16; FR-020, FR-025, FR-026, FR-055, FR-063, FR-071, FR-074): the trips filter ("All",
 * "Active 1", "Planned", "Past") and the passport period ("All time", "2026", "2025").
 *
 *   <SegmentedPill
 *     options={[{ key: 'active', label: 'Active', count: 1, testID: 'filter-active',
 *                 accessibilityLabel: 'Active, 1' }, ...]}
 *     selectedKey={filter} onSelect={setFilter} testID="trips-filter" />
 *
 * - The track is a capsule with padding 4 on `surfaceSecondary` with a hairline; a segment is
 *   a capsule too, so the thumb is the track minus 8 (concentric). The selected segment is
 *   the `ink` fill with an `onInk` label; an unselected one has no fill and a `muted` label
 *   (gated on the cream track), and while held the `pressed` fill with an INK label (only ink
 *   is gated on it). The selection is the thumb itself, a fill and not a hue, so it survives
 *   greyscale (P18: `ink` on paper is 14.6:1).
 * - Roles: `tablist` and `tab` (the default, for a filter that changes what a list shows) or
 *   `radiogroup` and `radio` (`role="radiogroup"`, for a choice that is a value). A tab
 *   announces `{ selected }`; a radio `{ selected, checked }`. Every option carries its own
 *   `testID` and `accessibilityLabel` (required: "Active, 1" says the count the figure
 *   shows), so the ids of a screen's filter are the screen's, not this file's.
 * - A segment is 36 dp at least (32 with `size="sm"`), with slop above and below up to the
 *   platform floor, and grows with the text size (a minimum, never a height). The segments
 *   share the track equally; a label wraps (`shrink`) instead of clipping, and is capped at
 *   1.3 like every pill (FR-074). A count is shown beside the label in tabular figures.
 * - A change (not a re-press of the selected segment) plays the selection haptic, through
 *   `useHaptics` (silent under reduced motion), as `ChipGroup` does.
 * - Focus draws the 2.5 dp ring of `focus-ring.ts`, 2 dp outside the segment.
 */
import { Pressable, View, type AccessibilityState, type ViewStyle } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useHaptics } from '@/hooks/use-haptics';
import { Space, cornerOf } from '@/theme';

import { assertAccessibleName } from './adapter-guards';
import { segmentLook, type SegmentLook } from './chip-look';
import { focusRingStyle, useFocusRing } from './focus-ring';
import { Text, type TextTone } from './text';
import { useColors } from './theme-tokens';

export interface SegmentOption {
  key: string;
  label: string;
  /** Shown beside the label in tabular figures; say it in `accessibilityLabel` too. */
  count?: number;
  testID: string;
  /** Required: what a screen reader says ("Active, 1"). */
  accessibilityLabel: string;
  /** Said after the name, for a segment that does not do what it says yet ("Not available yet"). */
  accessibilityHint?: string;
}

export interface SegmentedPillProps {
  options: readonly SegmentOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** `tablist` (default) or `radiogroup`. */
  role?: 'tablist' | 'radiogroup';
  /** `md` is 36 dp, `sm` 32 dp. */
  size?: 'md' | 'sm';
  /** Names the group (Android reads it; iOS ignores a label on a container). */
  accessibilityLabel?: string;
  testID?: string;
}

const MIN_HEIGHT = { md: 36, sm: 32 } as const;
const TRACK_PADDING = Space[1];
/** The prototype's `.seg button`: `padding: 6px 8px; gap: 6px`. */
const SEGMENT_GAP = 6;
const SEGMENT_PADDING_Y = 6;

const LABEL_TONE: Record<SegmentLook['label'], TextTone> = {
  onInk: 'onInk',
  ink: 'default',
  muted: 'muted',
};

const COLOR_KEYS = ['ink', 'pressed', 'surfaceSecondary', 'hairline', 'focus'] as const;
type Colors = Record<(typeof COLOR_KEYS)[number], string>;

function trackStyle(colors: Colors): ViewStyle {
  return {
    flexDirection: 'row',
    padding: TRACK_PADDING,
    ...cornerOf('full'),
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.hairline,
  };
}

interface SegmentStyleInput {
  look: SegmentLook;
  colors: Colors;
  size: 'md' | 'sm';
  focused: boolean;
}

function segmentStyle({ look, colors, size, focused }: SegmentStyleInput): ViewStyle {
  return {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: MIN_HEIGHT[size],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SEGMENT_GAP,
    paddingVertical: SEGMENT_PADDING_Y,
    paddingHorizontal: Space[2],
    ...cornerOf('full'),
    ...(look.fill ? { backgroundColor: colors[look.fill as keyof Colors] } : null),
    ...(focused ? focusRingStyle(colors.focus) : null),
  };
}

interface SegmentProps {
  option: SegmentOption;
  selected: boolean;
  radio: boolean;
  size: 'md' | 'sm';
  colors: Colors;
  onPress: () => void;
}

function Segment({ option, selected, radio, size, colors, onPress }: SegmentProps) {
  const focus = useFocusRing();
  const slop = (MinTouchTarget - MIN_HEIGHT[size]) / 2;
  const state: AccessibilityState = radio
    ? { selected, checked: selected }
    : { selected };

  return (
    <Pressable
      testID={option.testID}
      accessibilityRole={radio ? 'radio' : 'tab'}
      accessibilityLabel={option.accessibilityLabel}
      accessibilityHint={option.accessibilityHint}
      accessibilityState={state}
      onPress={onPress}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
      style={({ pressed }) =>
        segmentStyle({
          look: segmentLook({ selected, pressed }),
          colors,
          size,
          focused: focus.focused,
        })
      }>
      {({ pressed }) => {
        const tone = LABEL_TONE[segmentLook({ selected, pressed }).label];
        return (
          <>
            <Text variant="label" strong capped tone={tone} className="shrink">
              {option.label}
            </Text>
            {option.count === undefined ? null : (
              <Text
                variant="label"
                strong
                capped
                tone={tone}
                style={{ fontVariant: ['tabular-nums'] }}>
                {String(option.count)}
              </Text>
            )}
          </>
        );
      }}
    </Pressable>
  );
}

export function SegmentedPill({
  options,
  selectedKey,
  onSelect,
  role = 'tablist',
  size = 'md',
  accessibilityLabel,
  testID,
}: SegmentedPillProps) {
  for (const option of options)
    assertAccessibleName('SegmentedPill', option.accessibilityLabel);

  const haptics = useHaptics();
  const colors = useColors(COLOR_KEYS);

  const select = (key: string) => {
    if (key !== selectedKey) haptics.selection();
    onSelect(key);
  };

  return (
    <View
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      style={trackStyle(colors)}>
      {options.map((option) => (
        <Segment
          key={option.key}
          option={option}
          selected={option.key === selectedKey}
          radio={role === 'radiogroup'}
          size={size}
          colors={colors}
          onPress={() => select(option.key)}
        />
      ))}
    </View>
  );
}
