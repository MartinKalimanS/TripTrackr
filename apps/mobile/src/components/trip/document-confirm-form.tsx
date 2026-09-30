/**
 * Check a boarding pass's details — tasks.md T118 (FR-035; Constitution IV);
 * research D-21, D-33.
 *
 * The three fields the barcode yielded — flight number, flight date, passenger
 * name — are offered pre-filled for the traveller to check against the pass;
 * when nothing could be read the same form is empty, on today's date, for
 * typing them in. Nothing extracted is fact until the traveller confirms it
 * (that is `Confirm details`); `Not now` leaves the proposal as it was.
 *
 * A `react-hook-form` whose resolver pipes the values into the wire's
 * `DocumentParsedFields` (document-form.ts), so this form accepts exactly what
 * the API and sync accept. "ac 0834" is normalised to "AC834" on the way; a
 * value that is still not a flight number is refused in words beside its field
 * and nothing is stored. The screen owns the write, so a failed one is shown
 * here (`error`) with what was typed still in place.
 *
 * The form sits beside the document's image and holds a passenger's name, so
 * it blocks screen capture like every document surface (FR-034).
 *
 * Visibility posture: owner-only. The fields go to the local store and, from
 * there, to the owner's own account only.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { Controller, useForm, type Control } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DateField } from '@/components/trip/date-field';
import { InlineError } from '@/components/ui/inline-error';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  DOCUMENT_FIELD_COPY,
  documentFieldsResolver,
  initialFieldValues,
  type DocumentFieldsFormValues,
} from '@/features/documents/document-form';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';
import { todayIso } from '@/features/trips/stop-dates';
import { fieldMessage } from '@/lib/form-copy';

export type DocumentConfirmFormProps = {
  /** The proposal to check, or null for manual entry. */
  fields: DocumentParsedFields | null;
  /** One sentence on where the fields came from and what to do with them. */
  intro: string;
  /** A failed write, in words, with the typed values left in place. */
  error: string | null;
  onConfirm: (fields: DocumentParsedFields) => void;
  onNotNow: () => void;
};

type FieldsControl = Control<DocumentFieldsFormValues, unknown, DocumentParsedFields>;

function FlightNumberField({ control }: { control: FieldsControl }) {
  return (
    <Controller
      control={control}
      name="flight_number"
      render={({ field, fieldState }) => (
        <TextField
          testID="document-confirm-flight-number"
          label="Flight number"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="AC834"
          autoCapitalize="characters"
          autoCorrect={false}
          error={fieldMessage(fieldState.error, DOCUMENT_FIELD_COPY.flight_number)}
        />
      )}
    />
  );
}

function FlightDateField({ control }: { control: FieldsControl }) {
  return (
    <Controller
      control={control}
      name="flight_date"
      render={({ field, fieldState }) => (
        <DateField
          testID="document-confirm-flight-date"
          label="Flight date"
          value={field.value}
          onChange={field.onChange}
          error={fieldMessage(fieldState.error, DOCUMENT_FIELD_COPY.flight_date)}
        />
      )}
    />
  );
}

function PassengerNameField({ control }: { control: FieldsControl }) {
  return (
    <Controller
      control={control}
      name="passenger_name"
      render={({ field, fieldState }) => (
        <TextField
          testID="document-confirm-passenger-name"
          label="Passenger name"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="SURNAME/GIVEN NAME"
          autoCapitalize="characters"
          autoCorrect={false}
          error={fieldMessage(fieldState.error, DOCUMENT_FIELD_COPY.passenger_name)}
        />
      )}
    />
  );
}

export function DocumentConfirmForm({
  fields,
  intro,
  error,
  onConfirm,
  onNotNow,
}: DocumentConfirmFormProps) {
  useScreenCaptureGuard();
  const { control, handleSubmit } = useForm<
    DocumentFieldsFormValues,
    unknown,
    DocumentParsedFields
  >({
    resolver: documentFieldsResolver,
    defaultValues: initialFieldValues(fields, todayIso()),
  });
  const confirm = handleSubmit(onConfirm);

  return (
    <View testID="document-confirm-form" style={styles.form}>
      <ThemedText type="smallBold">Flight details</ThemedText>
      <ThemedText testID="document-confirm-intro" type="small" themeColor="textMuted">
        {intro}
      </ThemedText>

      <FlightNumberField control={control} />
      <FlightDateField control={control} />
      <PassengerNameField control={control} />

      <InlineError testID="document-confirm-error" message={error} />

      <View style={styles.actions}>
        <PressableSurface
          testID="document-confirm-not-now"
          accessibilityLabel="Not now"
          accessibilityHint="Keeps the details as a suggestion you still need to check"
          treatment="flat"
          onPress={onNotNow}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Not now
          </ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="document-confirm-save"
          accessibilityLabel="Confirm details"
          depth={2}
          onPress={() => void confirm()}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Confirm details
          </ThemedText>
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
