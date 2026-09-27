/**
 * Write or edit a note — tasks.md T084, T085 (FR-017, FR-018, FR-019);
 * research D-21, D-24.
 *
 * A React Native `Modal` sheet (as the stop editor), holding a
 * `react-hook-form` whose resolver pipes the form into the wire's
 * `CreateNoteRequest` (note-form.ts). The body sits under a
 * `KeyboardAwareScrollView` from react-native-keyboard-controller, so a long
 * entry stays above the keyboard on both platforms. The anchor pills are the
 * move control of FR-018: choosing another level on an existing note is a
 * move, and the body and creation date travel untouched.
 */
import { useMemo } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';
import { Modal, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AnchorPicker } from '@/components/trip/anchor-picker';
import { FormActions } from '@/components/ui/form-actions';
import { InlineError } from '@/components/ui/inline-error';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import {
  NOTE_FIELD_COPY,
  noteFormResolver,
  type NoteFormValues,
} from '@/features/notes/note-form';
import { isCurrentAnchor, type AnchorTarget } from '@/features/notes/use-move-note';
import { fieldMessage } from '@/lib/form-copy';

import type { CreateNoteRequest } from '@triptrackr/contracts';

export type NoteEditorValues = Pick<
  CreateNoteRequest,
  'title' | 'body' | 'country_id' | 'city_id'
>;

export type NoteEditorMode =
  | { kind: 'add'; initialAnchorKey?: string }
  | {
      kind: 'edit';
      note: {
        title: string | null;
        body: string;
        country_id: number | null;
        city_id: number | null;
      };
    };

export type NoteEditorProps = {
  visible: boolean;
  mode: NoteEditorMode;
  targets: readonly AnchorTarget[];
  onCancel: () => void;
  onSubmit: (values: NoteEditorValues) => void;
  /** A failed save, shown inside the sheet so the typed note is not lost. */
  error?: string | null;
};

function initialValues(
  mode: NoteEditorMode,
  targets: readonly AnchorTarget[],
): NoteFormValues {
  if (mode.kind === 'edit') {
    const current = targets.find((target) => isCurrentAnchor(target, mode.note));
    return {
      title: mode.note.title ?? '',
      body: mode.note.body,
      anchorKey: current?.key ?? '',
    };
  }
  return {
    title: '',
    body: '',
    anchorKey: mode.initialAnchorKey ?? targets[0]?.key ?? '',
  };
}

type NoteControl = Control<NoteFormValues, unknown, CreateNoteRequest>;

type AnchorFieldProps = {
  control: NoteControl;
  mode: NoteEditorMode;
  targets: readonly AnchorTarget[];
};

function AnchorField({ control, mode, targets }: AnchorFieldProps) {
  return (
    <Controller
      control={control}
      name="anchorKey"
      render={({ field, fieldState }) => (
        <AnchorPicker
          testID="note-editor-anchor"
          label={mode.kind === 'edit' ? 'Filed under (change to move)' : 'Filed under'}
          targets={targets}
          value={field.value}
          onChange={field.onChange}
          error={fieldMessage(fieldState.error, NOTE_FIELD_COPY.anchorKey)}
        />
      )}
    />
  );
}

function TitleField({ control }: { control: NoteControl }) {
  return (
    <Controller
      control={control}
      name="title"
      render={({ field, fieldState }) => (
        <TextField
          testID="note-editor-title"
          label="Title (optional)"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="Cheese"
          autoCapitalize="sentences"
          maxLength={200}
          error={fieldMessage(fieldState.error, NOTE_FIELD_COPY.title)}
        />
      )}
    />
  );
}

function BodyField({ control }: { control: NoteControl }) {
  return (
    <Controller
      control={control}
      name="body"
      render={({ field, fieldState }) => (
        <TextField
          testID="note-editor-body"
          label="Note"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="Try the raclette in Valais."
          multiline
          textAlignVertical="top"
          numberOfLines={6}
          autoCapitalize="sentences"
          error={fieldMessage(fieldState.error, NOTE_FIELD_COPY.body)}
        />
      )}
    />
  );
}

function NoteEditorForm({
  mode,
  targets,
  onCancel,
  onSubmit,
  error,
}: Omit<NoteEditorProps, 'visible'>) {
  const resolver = useMemo(() => noteFormResolver(targets), [targets]);
  const { control, handleSubmit } = useForm<NoteFormValues, unknown, CreateNoteRequest>({
    resolver,
    defaultValues: initialValues(mode, targets),
  });

  const save = handleSubmit((values) =>
    onSubmit({
      title: values.title,
      body: values.body,
      country_id: values.country_id,
      city_id: values.city_id,
    }),
  );

  return (
    <View style={styles.form}>
      <ThemedText type="subtitle">
        {mode.kind === 'add' ? 'New note' : 'Edit note'}
      </ThemedText>

      <AnchorField control={control} mode={mode} targets={targets} />

      <TitleField control={control} />

      <BodyField control={control} />

      <InlineError testID="note-editor-error" message={error ?? null} />

      <FormActions
        testIDPrefix="note-editor"
        saveLabel="Save note"
        onCancel={onCancel}
        onSave={() => void save()}
      />
    </View>
  );
}

export function NoteEditor({
  visible,
  mode,
  targets,
  onCancel,
  onSubmit,
  error,
}: NoteEditorProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}>
      <ThemedView type="canvas" style={styles.sheet} testID="note-editor">
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={Spacing.four}>
          <SafeAreaView edges={['bottom']}>
            {/* Remount per opening so a cancelled draft does not linger. */}
            {visible ? (
              <NoteEditorForm
                mode={mode}
                targets={targets}
                onCancel={onCancel}
                onSubmit={onSubmit}
                error={error}
              />
            ) : null}
          </SafeAreaView>
        </KeyboardAwareScrollView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  scroll: { flexGrow: 1, padding: Spacing.four },
  form: { gap: Spacing.three },
});
