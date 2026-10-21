/**
 * Calendar-day field — tasks.md T068/T069; on the Atlas adapters since feature 004 (T436;
 * contract C4-8; FR-009, FR-024, FR-025, FR-026, FR-029, FR-030, FR-037).
 *
 * Wraps `@react-native-community/datetimepicker` (the v57 SDK page defers to
 * the library's README for the API; installed 9.1.0, which prefers
 * `onValueChange` / `onDismiss` over the deprecated `onChange`):
 *
 *   - Android: the imperative `DateTimePickerAndroid.open()` dialog, so no
 *     picker view is ever left mounted (the component form re-opens the
 *     dialog on every re-render there).
 *   - iOS: an inline calendar revealed beneath the field until a day is
 *     chosen. The system control is the one platform-supplied surface the
 *     design allows, because Apple's HIG expects it and a bespoke calendar is
 *     out of scope.
 *
 * It sits among `Field`s (the stop editor, the add-expense sheet, the document confirm
 * form), so it looks like one: the label on top in the same weight, a box with the field's
 * fill and its 3:1 boundary (`bg-field`, `border-field-border`), as tall as a `Field` and
 * the platform target floor and growing with the text size (a `Tappable`, so the pressed
 * fill, the focus ring and the busy-or-disabled guards are its). The day is a `numeric`
 * text (tabular figures, FR-004) that wraps beside a calendar glyph instead of clipping at
 * the largest text size. A refusal is WORDS under the field, an `alert` (`<testID>-error`),
 * with the boundary and the label turned danger as the kit's own field does: never colour
 * alone (FR-025).
 *
 * What did not change (FR-030, FR-037): the props, `testID` on the pressable and
 * `<testID>-picker` on the iOS calendar, the name (the label), the value ("12 May 2026" in
 * words), the hint "Opens a calendar", and the Android dialog.
 *
 * Values are the wire's `IsoDate` strings; conversion stays in stop-dates.ts (the picked
 * day is the local calendar day, never a UTC conversion).
 */
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { fieldMinHeight } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { formatIsoDate, fromIsoDate, toIsoDate } from '@/features/trips/stop-dates';
import { AtlasSpacing } from '@/theme';

export type DateFieldProps = {
  label: string;
  /** `YYYY-MM-DD`. */
  value: string;
  onChange: (iso: string) => void;
  /** `YYYY-MM-DD`; the picker will not offer earlier days. */
  minimumDate?: string;
  /** Conveyed by message text as well as colour (FR-010). */
  error?: string;
  testID?: string;
};

const CALENDAR: IconName = 'calendar';

/** The field's fill and boundary; while refused, the boundary is the danger ink. */
const BOX = 'bg-field border';
const BOUNDARY = { ok: 'border-field-border', refused: 'border-danger' } as const;

/**
 * The Android dialog: imperative, so no picker view is left mounted. Shared with the stop
 * editor's date block, so both open the SAME dialog (its "Previous month", "Next month" and
 * day cells are what the Maestro flows tap).
 */
export function openDayDialog(
  value: string,
  minimum: Date | undefined,
  onPick: (date: Date) => void,
) {
  DateTimePickerAndroid.open({
    value: fromIsoDate(value),
    mode: 'date',
    minimumDate: minimum,
    onValueChange: (_event, date) => onPick(date),
  });
}

/** The day, or the calendar, or neither: what a press does on this platform. */
function useCalendar(
  value: string,
  minimum: Date | undefined,
  onChange: (iso: string) => void,
) {
  const [open, setOpen] = useState(false);

  const pick = (date: Date) => {
    setOpen(false);
    onChange(toIsoDate(date));
  };

  const toggle = () => {
    if (Platform.OS === 'android') {
      openDayDialog(value, minimum, pick);
      return;
    }
    setOpen((current) => !current);
  };

  return { open, pick, toggle, dismiss: () => setOpen(false) };
}

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  error,
  testID,
}: DateFieldProps) {
  const { fontScale } = useWindowDimensions();
  const minimum = minimumDate ? fromIsoDate(minimumDate) : undefined;
  const calendar = useCalendar(value, minimum, onChange);
  const refused = Boolean(error);
  const day = formatIsoDate(value);

  return (
    <View className="gap-1.5">
      <Text className="font-medium" tone={refused ? 'danger' : 'default'}>
        {label}
      </Text>
      <Tappable
        testID={testID}
        accessibilityLabel={label}
        accessibilityValue={{ text: day }}
        accessibilityHint="Opens a calendar"
        onPress={calendar.toggle}
        className={`${BOX} ${refused ? BOUNDARY.refused : BOUNDARY.ok}`}
        style={[styles.field, { minHeight: fieldMinHeight(fontScale) }]}>
        <Text type="numeric" className="shrink font-normal">
          {day}
        </Text>
        <Icon name={CALENDAR} size={20} tone="muted" />
      </Tappable>
      {calendar.open ? (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={fromIsoDate(value)}
          mode="date"
          display="inline"
          minimumDate={minimum}
          onValueChange={(_event, date) => calendar.pick(date)}
          onDismiss={calendar.dismiss}
        />
      ) : null}
      {error ? (
        <Text
          testID={testID ? `${testID}-error` : undefined}
          accessibilityRole="alert"
          type="callout"
          tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** `Tappable` centres its content; a field starts it at the edge, the glyph at the end. */
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: AtlasSpacing.two,
    paddingHorizontal: AtlasSpacing.twelve,
  },
});
