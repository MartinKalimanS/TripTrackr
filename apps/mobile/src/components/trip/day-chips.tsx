/**
 * `DayChips` - the strip of days under the areas (tasks.md T544; contract C5-20; spec FR-040,
 * FR-070, FR-071, FR-074; screens.md "Trip").
 *
 *   <DayChips days={tripDays(stops)} selected={day} onSelect={setDay} />
 *
 * "All" first, then one chip per day: the day's number as "D3" and its date as "14 Oct", in
 * the device's language (`dayChipText`). Choosing a chip reports its day index (`onSelect(3)`),
 * and "All" reports `null`; the screen highlights and scrolls to that day's stops. A trip with
 * no stops has no days, and then nothing is drawn at all (FR-040, FR-042).
 *
 * It is a radio group: each chip is a `radio` named "Day 3, 14 October" ("All days"), and
 * exactly one is checked, so the choice is the radio's state and not its fill alone (FR-070).
 * The chosen chip is the ink fill with the on-ink label, the rest cream with a hairline: both
 * come from the chip family's own table (`chipLook`), so the pairs are the ones the contrast
 * gate measures, a held chip included.
 *
 * Each chip is 56 dp each way at least and grows with the text (a minimum, never a height); the
 * labels are capped at 1.3 like every chip (FR-074); the strip scrolls sideways with no bar
 * and bleeds to both screen edges (the screen's own side padding comes back as the content's).
 * `PinnedStrip` is what keeps the one strip under the collapsed bar.
 */
import { ScrollView, View } from 'react-native';

import { Tappable } from '@/components/ui/tappable';
import { Text, type TextTone } from '@/components/ui/text';
import { chipLook, type ChipLook } from '@/components/ui/chip-look';
import { useColors, type PaletteKey } from '@/components/ui/theme-tokens';
import { dayChipText, type TripDay } from '@/features/trips/trip-days';
import { cornerOf, Space } from '@/theme';

export interface DayChipsProps {
  days: readonly TripDay[];
  /** The chosen day's index, or `null` for "All". */
  selected: number | null;
  onSelect: (day: number | null) => void;
}

/** The chip's minimum, each way (the prototype's 56 by 56). */
const CHIP_MIN = 56;
const ALL_MIN_WIDTH = 48;
/** The chip's padding (the prototype's 6 by 10). */
const CHIP_PAD_X = 10;
const CHIP_PAD_Y = 6;
/** The strip's own air above and below, for a focus ring and a press, taken back by a negative margin. */
const RING_AIR = Space[1];
/** The screen's side padding, which the strip bleeds through and gives back. */
const BLEED = Space[5];

const COLOR_KEYS: readonly PaletteKey[] = [
  'ink',
  'surfaceSecondary',
  'pressed',
  'hairline',
  'focus',
];

const LABEL_TONE: Record<ChipLook['label'], TextTone> = {
  ink: 'default',
  onInk: 'onInk',
};

interface FaceProps {
  /** `all` or the day's index: the chip is `trip-day-<slug>`, its face `trip-day-<slug>-face`. */
  slug: string;
  selected: boolean;
  pressed: boolean;
  minWidth: number;
  code: string;
  caption?: string;
}

/** What a chip draws: the fill and edge of its look, the code, and a caption under it. */
function Face({ slug, selected, pressed, minWidth, code, caption }: FaceProps) {
  const colors = useColors(COLOR_KEYS);
  const look = chipLook({ selected, dashed: false, pressed });
  const tone = LABEL_TONE[look.label];
  return (
    <View
      testID={`trip-day-${slug}-face`}
      style={[
        cornerOf('lg'),
        {
          minWidth,
          minHeight: CHIP_MIN,
          paddingHorizontal: CHIP_PAD_X,
          paddingVertical: CHIP_PAD_Y,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: look.edgeWidth,
          borderColor: colors[look.edge],
          backgroundColor: look.fill ? colors[look.fill] : undefined,
        },
      ]}>
      <Text variant="callout" capped tone={tone}>
        {code}
      </Text>
      {caption ? (
        <Text
          variant="caption"
          capped
          tone={tone === 'onInk' ? 'onInk' : pressed ? 'default' : 'muted'}
          numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

interface ChipProps extends Omit<FaceProps, 'selected' | 'pressed'> {
  name: string;
  selected: boolean;
  onPress: () => void;
}

/** One radio: the control is bare (it paints nothing), the face inside paints every state. */
function DayChip({ name, selected, onPress, ...face }: ChipProps) {
  return (
    <Tappable
      testID={`trip-day-${face.slug}`}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ selected, checked: selected }}
      onPress={onPress}
      style={[cornerOf('lg'), { backgroundColor: 'transparent', minHeight: CHIP_MIN }]}>
      {({ pressed }) => <Face {...face} selected={selected} pressed={pressed} />}
    </Tappable>
  );
}

export function DayChips({ days, selected, onSelect }: DayChipsProps) {
  if (days.length === 0) return null;
  return (
    <View testID="trip-days" accessibilityRole="radiogroup">
      <ScrollView
        testID="trip-days-scroll"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -BLEED, marginVertical: -RING_AIR }}
        contentContainerStyle={{
          gap: Space[2],
          paddingHorizontal: BLEED,
          paddingVertical: RING_AIR,
        }}>
        <DayChip
          slug="all"
          name="All days"
          code="All"
          minWidth={ALL_MIN_WIDTH}
          selected={selected === null}
          onPress={() => onSelect(null)}
        />
        {days.map((day) => {
          const text = dayChipText(day);
          return (
            <DayChip
              key={day.index}
              slug={String(day.index)}
              name={text.name}
              code={text.code}
              caption={text.date}
              minWidth={CHIP_MIN}
              selected={selected === day.index}
              onPress={() => onSelect(day.index)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
