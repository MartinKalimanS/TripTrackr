/**
 * The dates of a stop in the stop editor as pictured (feature 005, UI-SPEC 9.1; `add-stop*.png`): Arrival and
 * Departure are the two halves of ONE cream block with a dashed joint between them, each half
 * a caption over the day in words ("Thu 15 Oct").
 *
 * Behaviour is `DateField`'s, unchanged (FR-030, FR-037): each half is a button with the id
 * the flows know (`stop-editor-arrive`, `stop-editor-depart`), named by its label ("Arrival",
 * "Departure": the app's words win over the picture's "Arrive" and "Depart"), valued with the
 * full day ("12 May 2026"), hinted "Opens a calendar"; on Android it opens the same system
 * dialog (`openDayDialog`), on iOS ONE inline calendar (`<id>-picker`) opens under the block,
 * for one half at a time. Values are wire `IsoDate` strings; every conversion is
 * `stop-dates.ts`'s, so a picked day is the local calendar day.
 *
 * A refusal is words under the block (`<depart id>-error`, an alert) and the boundary and the
 * departure caption turn danger: never colour alone (FR-025). At large text (1.15 and up) the
 * halves stack, the joint gives way to a hairline, and nothing clips (FR-029).
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { fieldMinHeight } from '@/components/ui/field';
import { isLargeText } from '@/components/ui/reflow';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import {
  formatIsoDate,
  formatStopDay,
  fromIsoDate,
  toIsoDate,
} from '@/features/trips/stop-dates';
import { useFontScale } from '@/hooks/use-font-scale';
import { Space, cornerOf } from '@/theme';

import { openDayDialog } from './date-field';

export type StopDatesBlockProps = {
  /** `YYYY-MM-DD`. */
  arrive: string;
  /** `YYYY-MM-DD`. */
  depart: string;
  onArrive: (iso: string) => void;
  onDepart: (iso: string) => void;
  /** Words for a refused pair; shown under the block. */
  error?: string;
};

type Half = 'arrive' | 'depart';

const JOINT_WIDTH = 24;
const JOINT_COLORS = ['subtle', 'hairline', 'danger', 'border'] as const;
const TABULAR = { fontVariant: ['tabular-nums' as const] };
const HINT = 'Opens a calendar';

/** Which half is open, and what a press of either does on this platform. */
function useHalves(props: StopDatesBlockProps) {
  const [open, setOpen] = useState<Half | null>(null);
  const spec = {
    arrive: { value: props.arrive, minimum: undefined, change: props.onArrive },
    depart: {
      value: props.depart,
      minimum: fromIsoDate(props.arrive),
      change: props.onDepart,
    },
  };

  const pick = (half: Half, date: Date) => {
    setOpen(null);
    spec[half].change(toIsoDate(date));
  };

  const toggle = (half: Half) => {
    if (Platform.OS === 'android') {
      openDayDialog(spec[half].value, spec[half].minimum, (date) => pick(half, date));
      return;
    }
    setOpen((current) => (current === half ? null : half));
  };

  return { open, spec, pick, toggle, dismiss: () => setOpen(null) };
}

type SegmentProps = {
  testID: string;
  label: string;
  value: string;
  refused: boolean;
  stacked: boolean;
  trailing: boolean;
  onPress: () => void;
};

function Segment({
  testID,
  label,
  value,
  refused,
  stacked,
  trailing,
  onPress,
}: SegmentProps) {
  const alignRight = trailing && !stacked;
  return (
    <Tappable
      testID={testID}
      accessibilityLabel={label}
      accessibilityValue={{ text: formatIsoDate(value) }}
      accessibilityHint={HINT}
      onPress={onPress}
      style={{
        flex: stacked ? undefined : 1,
        alignItems: alignRight ? 'flex-end' : 'flex-start',
        paddingVertical: Space[2],
        paddingHorizontal: Space[4],
      }}>
      <Text variant="caption" tone={refused ? 'danger' : 'muted'}>
        {label}
      </Text>
      <Text variant="callout" style={TABULAR} className={alignRight ? 'text-right' : ''}>
        {formatStopDay(value)}
      </Text>
    </Tappable>
  );
}

/** The dashed joint between the halves (a hairline between stacked halves). */
function Joint({ stacked }: { stacked: boolean }) {
  const colors = useColors(JOINT_COLORS);
  if (stacked) {
    return <View style={{ height: 1, backgroundColor: colors.hairline }} />;
  }
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        alignSelf: 'center',
        width: JOINT_WIDTH,
        borderTopWidth: 2,
        borderStyle: 'dashed',
        borderColor: colors.subtle,
      }}
    />
  );
}

export function StopDatesBlock(props: StopDatesBlockProps) {
  const { arrive, depart, error } = props;
  const fontScale = useFontScale();
  const colors = useColors(JOINT_COLORS);
  const stacked = isLargeText(fontScale);
  const halves = useHalves(props);
  const refused = Boolean(error);
  const openValue = halves.open ? halves.spec[halves.open] : null;

  return (
    <View className="gap-1.5">
      <View
        testID="stop-editor-dates"
        className="bg-field"
        style={[
          cornerOf('md'),
          {
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'stretch' : 'center',
            minHeight: fieldMinHeight(fontScale),
            borderWidth: 1,
            borderColor: refused ? colors.danger : colors.border,
          },
        ]}>
        <Segment
          testID="stop-editor-arrive"
          label="Arrival"
          value={arrive}
          refused={false}
          stacked={stacked}
          trailing={false}
          onPress={() => halves.toggle('arrive')}
        />
        <Joint stacked={stacked} />
        <Segment
          testID="stop-editor-depart"
          label="Departure"
          value={depart}
          refused={refused}
          stacked={stacked}
          trailing
          onPress={() => halves.toggle('depart')}
        />
      </View>
      {halves.open && openValue ? (
        <DateTimePicker
          testID={`stop-editor-${halves.open}-picker`}
          value={fromIsoDate(openValue.value)}
          mode="date"
          display="inline"
          minimumDate={openValue.minimum}
          onValueChange={(_event, date) => halves.pick(halves.open as Half, date)}
          onDismiss={halves.dismiss}
        />
      ) : null}
      {error ? (
        <Text
          testID="stop-editor-depart-error"
          accessibilityRole="alert"
          type="callout"
          tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
