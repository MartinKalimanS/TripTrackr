/**
 * Calendar-day field — tasks.md T068/T069.
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
 * Values are the wire's `IsoDate` strings; conversion stays in stop-dates.ts.
 */
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Colors, Spacing } from '@/constants/theme';
import { formatIsoDate, fromIsoDate, toIsoDate } from '@/features/trips/stop-dates';
import { useAppearance } from '@/hooks/use-appearance';

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

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  error,
  testID,
}: DateFieldProps) {
  const { theme } = useAppearance();
  const [pickerOpen, setPickerOpen] = useState(false);
  const palette = Colors[theme];
  const minimum = minimumDate ? fromIsoDate(minimumDate) : undefined;

  const pick = (date: Date) => {
    setPickerOpen(false);
    onChange(toIsoDate(date));
  };

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromIsoDate(value),
        mode: 'date',
        minimumDate: minimum,
        onValueChange: (_event, date) => pick(date),
      });
      return;
    }
    setPickerOpen((current) => !current);
  };

  return (
    <View style={styles.container}>
      <ThemedText type="small">{label}</ThemedText>
      <PressableSurface
        testID={testID}
        treatment="recessed"
        radius="sm"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatIsoDate(value) }}
        accessibilityHint="Opens a calendar"
        onPress={open}
        style={
          error
            ? { ...styles.field, borderColor: palette.danger, borderWidth: 2 }
            : styles.field
        }>
        <ThemedText>{formatIsoDate(value)}</ThemedText>
      </PressableSurface>
      {pickerOpen ? (
        <DateTimePicker
          testID={testID ? `${testID}-picker` : undefined}
          value={fromIsoDate(value)}
          mode="date"
          display="inline"
          minimumDate={minimum}
          onValueChange={(_event, date) => pick(date)}
          onDismiss={() => setPickerOpen(false)}
        />
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: palette.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  field: {
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
