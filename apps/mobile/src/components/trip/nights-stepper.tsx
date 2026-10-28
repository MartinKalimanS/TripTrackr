/**
 * The Nights stepper of the stop editor (feature 005, UI-SPEC 9.1): a cream tile with
 * "Nights" and where the stay ends on the left, and on the right a 44 dp round button on each
 * side of the count in bold ("-  4  +").
 *
 * It stores nothing. The count is DERIVED from the two dates (`nightsBetween`) and a press
 * only asks the form for a new departure (`departureAfterNights`): fewer nights bring the
 * departure in, more push it out, the arrival never moves, so the dates remain the one record
 * of the stay. The count never goes below 0 (arriving and leaving the same day is a valid
 * stop) nor above `MAX_NIGHTS`; the button at the end is dimmed and announced unavailable.
 * The subtitle is the departure day ("Ends 19 Oct"), a fact of the dates: the picture's
 * "Fits your trip" would claim a check the app does not make.
 *
 * Ids: `stop-editor-nights` (the tile), `-less`, `-more` and `-value`. The buttons
 * are named "Fewer nights" and "More nights"; the count is a polite live region named
 * "4 nights" ("1 night"), so a change is announced. At large text the tile wraps and the
 * stepper drops under the words instead of squeezing them (FR-029).
 */
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { MinTouchTarget } from '@/constants/theme';
import { Space, cornerOf } from '@/theme';

export const MAX_NIGHTS = 365;

export type NightsStepperProps = {
  /** Whole nights between the dates; below 0 is shown as 0. */
  nights: number;
  /** The departure day in words ("19 Oct"). */
  endsOn: string;
  /** The new count the traveller asked for. */
  onChange: (nights: number) => void;
};

const COLOR_KEYS = ['surface', 'ink', 'hairline'] as const;
const TABULAR = { fontVariant: ['tabular-nums' as const] };
const VALUE_MIN_WIDTH = 36;

const nightsWord = (count: number) => (count === 1 ? 'night' : 'nights');

type RoundProps = {
  testID: string;
  label: string;
  icon: 'minus' | 'plus';
  disabled: boolean;
  onPress: () => void;
};

function RoundButton({ testID, label, icon, disabled, onPress }: RoundProps) {
  const colors = useColors(COLOR_KEYS);
  return (
    <Tappable
      testID={testID}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        cornerOf('full'),
        {
          width: MinTouchTarget,
          height: MinTouchTarget,
          minHeight: MinTouchTarget,
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: colors.ink,
        },
      ]}>
      <Icon name={icon} size={20} />
    </Tappable>
  );
}

export function NightsStepper({ nights, endsOn, onChange }: NightsStepperProps) {
  const colors = useColors(COLOR_KEYS);
  const count = Math.max(0, nights);

  return (
    <View
      testID="stop-editor-nights"
      className="bg-surface-secondary"
      style={[
        cornerOf('md'),
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: Space[3],
          minHeight: 64,
          paddingVertical: Space[2],
          paddingLeft: Space[4],
          paddingRight: Space[2],
          borderWidth: 1,
          borderColor: colors.hairline,
        },
      ]}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 120 }}>
        <Text variant="callout">Nights</Text>
        <Text variant="label" tone="muted">
          {`Ends ${endsOn}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space[1] }}>
        <RoundButton
          testID="stop-editor-nights-less"
          label="Fewer nights"
          icon="minus"
          disabled={count <= 0}
          onPress={() => onChange(count - 1)}
        />
        <Text
          testID="stop-editor-nights-value"
          variant="headline"
          accessibilityLabel={`${count} ${nightsWord(count)}`}
          accessibilityLiveRegion="polite"
          style={[TABULAR, { minWidth: VALUE_MIN_WIDTH, textAlign: 'center' }]}>
          {count}
        </Text>
        <RoundButton
          testID="stop-editor-nights-more"
          label="More nights"
          icon="plus"
          disabled={count >= MAX_NIGHTS}
          onPress={() => onChange(count + 1)}
        />
      </View>
    </View>
  );
}
