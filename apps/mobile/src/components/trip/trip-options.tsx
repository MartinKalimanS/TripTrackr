/**
 * Trip options: rename a trip, change its home currency, or delete it (spec 015, User Story 1;
 * FR-001 to FR-003). Opened by the trip header's "More".
 *
 *   <TripOptions visible={open} trip={trip} onSave={rename} onDelete={remove} onClose={close} />
 *
 * One sheet, two faces. The first is the form: the trip's name and home currency, validated by the
 * same resolver as "New trip" so what is saved is what the server accepts, with Save in the sticky
 * footer above the keyboard (contract C4-10 rule 8) and "Delete trip" set apart under the fields.
 * The second is the question Delete asks before anything is removed: it names the trip and what
 * goes with it, and only its own "Delete trip" calls `onDelete` (FR-002).
 *
 * It decides nothing: saving, deleting and leaving the screen are the caller's.
 * Visibility posture: private; it shows the signed-in traveller's own trip and sends nothing.
 */
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { CurrencyPicker } from '@/components/trip/currency-picker';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormModal } from '@/components/ui/form-modal';
import { FormSheet } from '@/components/ui/form-sheet';
import { Text } from '@/components/ui/text';
import {
  TRIP_FIELD_COPY,
  tripFormResolver,
  type TripFormValues,
} from '@/features/trips/trip-form';
import { fieldMessage } from '@/lib/form-copy';
import { Space } from '@/theme';

export type TripOptionsTrip = { id: string; title: string; home_currency: string };

export type TripOptionsProps = {
  visible: boolean;
  trip: TripOptionsTrip;
  onSave: (values: TripFormValues) => void;
  onDelete: () => void;
  onClose: () => void;
};

const ID = 'trip-options';
const DELETE_DETAIL =
  'Its stops, photos, notes, expenses and documents are deleted with it. This cannot be undone.';

type ConfirmProps = { title: string; onConfirm: () => void; onKeep: () => void };

/** The question asked before a trip is deleted. The destructive button is the only one that acts. */
function DeleteConfirm({ title, onConfirm, onKeep }: ConfirmProps) {
  return (
    <View testID={`${ID}-delete-question`} style={{ gap: Space[4] }}>
      <View accessible accessibilityRole="alert" style={{ gap: Space[2] }}>
        <Text variant="title">{`Delete “${title}”?`}</Text>
        <Text variant="body" tone="muted">
          {DELETE_DETAIL}
        </Text>
      </View>
      <Button
        testID={`${ID}-delete-confirm`}
        variant="destructive"
        icon="trash"
        accessibilityLabel="Delete trip"
        onPress={onConfirm}>
        Delete trip
      </Button>
      <Button
        testID={`${ID}-delete-keep`}
        variant="secondary"
        accessibilityLabel="Keep trip"
        onPress={onKeep}>
        Keep trip
      </Button>
    </View>
  );
}

type FormProps = Omit<TripOptionsProps, 'visible'>;

function TripOptionsForm({ trip, onSave, onDelete, onClose }: FormProps) {
  const [asking, setAsking] = useState(false);
  const { control, handleSubmit } = useForm<TripFormValues>({
    resolver: tripFormResolver,
    defaultValues: { title: trip.title, home_currency: trip.home_currency },
  });
  const save = handleSubmit((values) => onSave(values));

  return (
    <FormSheet
      host="modal"
      testID={ID}
      title="Trip options"
      gap={Space[6]}
      footerRule
      actions={{
        testIDPrefix: ID,
        saveLabel: 'Save changes',
        onCancel: onClose,
        onSave: () => void save(),
        saveDisabled: asking,
      }}>
      {asking ? (
        <DeleteConfirm
          title={trip.title}
          onConfirm={onDelete}
          onKeep={() => setAsking(false)}
        />
      ) : (
        <>
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <Field
                testID={`${ID}-title`}
                label="Trip name"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={() => void save()}
                maxLength={200}
                error={fieldMessage(fieldState.error, TRIP_FIELD_COPY.title)}
              />
            )}
          />
          <Controller
            control={control}
            name="home_currency"
            render={({ field, fieldState }) => (
              <CurrencyPicker
                value={field.value}
                onChange={field.onChange}
                error={fieldMessage(fieldState.error, TRIP_FIELD_COPY.home_currency)}
              />
            )}
          />
          <Button
            testID={`${ID}-delete`}
            variant="destructive"
            icon="trash"
            accessibilityLabel="Delete trip"
            onPress={() => setAsking(true)}>
            Delete trip
          </Button>
        </>
      )}
    </FormSheet>
  );
}

export function TripOptions({ visible, ...rest }: TripOptionsProps) {
  return (
    <FormModal testID={ID} visible={visible} onRequestClose={rest.onClose}>
      {/* Remount per opening so an abandoned edit or question does not linger. */}
      {visible ? <TripOptionsForm {...rest} /> : null}
    </FormModal>
  );
}
