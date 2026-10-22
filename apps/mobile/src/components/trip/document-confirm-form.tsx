/**
 * Check a boarding pass's details — tasks.md T118 (FR-035; Constitution IV);
 * research D-21, D-33; restyled for Atlas by 004 T443 (contract C4-10 rules 3 and 8;
 * FR-005, FR-009, FR-024, FR-025, FR-029, FR-030, FR-037).
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
 * The inputs are `Field`s (label on top, the error as words beneath, `testID` on the
 * input) and the closing row is two `Button`s laid out as `FormActions` lays its own
 * (a wrapping row, both growing): "Not now" (a text button, the dismissal) and "Confirm
 * details", the screen's one primary while the form is open. `FormActions` itself is not
 * used because it names its buttons "Cancel" and `<prefix>-cancel`, and this form's
 * pre-004 names and ids ("Not now", `document-confirm-not-now`, with its hint) are part of
 * the testID and accessible-name baseline (FR-037), whose extractor reads literals only.
 * The form sits in the document screen's keyboard-aware scroll view (`Screen
 * keyboardAware`), which pads the page by the keyboard's height, so the primary action can
 * always be scrolled above the keyboard; the last field's return key says "Done" so the
 * keyboard can be put away to reach it. The shared sticky action row (T438) can replace
 * the closing row later without touching the fields.
 *
 * The form sits beside the document's image and holds a passenger's name, so
 * it blocks screen capture like every document surface (FR-034).
 *
 * Visibility posture: owner-only. The fields go to the local store and, from
 * there, to the owner's own account only.
 */
import type { DocumentParsedFields } from '@triptrackr/contracts';
import { Controller, useForm, type Control } from 'react-hook-form';
import { View } from 'react-native';

import { DateField } from '@/components/trip/date-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
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
        <Field
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
        <Field
          testID="document-confirm-passenger-name"
          label="Passenger name"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="SURNAME/GIVEN NAME"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          error={fieldMessage(fieldState.error, DOCUMENT_FIELD_COPY.passenger_name)}
        />
      )}
    />
  );
}

type ConfirmActionsProps = { onNotNow: () => void; onConfirm: () => void };

/** "Not now" then "Confirm details", the one primary; they share a line and wrap together. */
function ConfirmActions({ onNotNow, onConfirm }: ConfirmActionsProps) {
  return (
    <View className="mt-2 flex-row flex-wrap gap-3">
      <Button
        testID="document-confirm-not-now"
        variant="text"
        accessibilityLabel="Not now"
        accessibilityHint="Keeps the details as a suggestion you still need to check"
        onPress={onNotNow}
        className="grow max-w-full">
        Not now
      </Button>
      <Button
        testID="document-confirm-save"
        variant="primary"
        accessibilityLabel="Confirm details"
        onPress={onConfirm}
        className="grow max-w-full">
        Confirm details
      </Button>
    </View>
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
    <Card testID="document-confirm-form" variant="tile">
      <View className="gap-4">
        <View className="gap-1">
          <Text type="headline">Flight details</Text>
          <Text testID="document-confirm-intro" type="callout" tone="muted">
            {intro}
          </Text>
        </View>

        <FlightNumberField control={control} />
        <FlightDateField control={control} />
        <PassengerNameField control={control} />

        <InlineError testID="document-confirm-error" message={error} />

        <ConfirmActions onNotNow={onNotNow} onConfirm={() => void confirm()} />
      </View>
    </Card>
  );
}
