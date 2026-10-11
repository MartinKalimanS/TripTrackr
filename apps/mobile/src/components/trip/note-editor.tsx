/**
 * Write or edit a note — tasks.md T084, T085, 004 T438 (FR-017, FR-018, FR-019; 004 FR-005,
 * FR-009, FR-025, FR-029, FR-030, FR-037); research D-21, D-24, D4-06.
 *
 * A React Native `Modal` (the shared `FormModal`: a page sheet on iOS, swipe down as Cancel,
 * the handle and the Android top inset, as the stop editor) rather than a router
 * modal: the notes screen opens it over its list, with the typed note kept on a failed
 * save. Inside it the body is the shared `FormSheet` with `host="modal"` (contract C4-8,
 * `components/ui/form-sheet.tsx`): the title ("New note" / "Edit note"), a scrolling,
 * keyboard-aware body of the anchor chooser and two `Field`s, and a sticky footer (Cancel,
 * Save note) that rides up with the keyboard, because nothing moves an RN `Modal` for it.
 * Save is the one primary; a refusal is words under its field and a failed save an
 * `InlineError` after the fields.
 *
 * The form is a `react-hook-form` whose resolver pipes it into the wire's
 * `CreateNoteRequest` (note-form.ts). The anchor chooser is the move control of FR-018:
 * choosing another level on an existing note is a move, and the body and creation date
 * travel untouched. The note field is a multiline `Field` of six lines (`numberOfLines`,
 * which `Field` turns into a minimum height on iOS too) that grows with the text size.
 *
 * Ids and names are unchanged: `note-editor` (the sheet), `note-editor-anchor`,
 * `note-editor-title`, `note-editor-body` (the multiline field, which is why the sheet's
 * scrolling body is `note-editor-scroll`), `note-editor-error`, `note-editor-cancel`,
 * `note-editor-save`. `note-editor-footer` and `<field id>-error` are new.
 */
import { useMemo } from 'react';
import { Controller, useForm, type Control } from 'react-hook-form';

import { AnchorPicker } from '@/components/trip/anchor-picker';
import { Field } from '@/components/ui/field';
import { FormModal } from '@/components/ui/form-modal';
import { FormSheet } from '@/components/ui/form-sheet';
import { InlineError } from '@/components/ui/inline-error';
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
        <Field
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
        <Field
          testID="note-editor-body"
          label="Note"
          value={field.value}
          onChangeText={field.onChange}
          onBlur={field.onBlur}
          placeholder="Try the raclette in Valais."
          multiline
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
    <FormSheet
      testID="note-editor"
      bodyTestID="note-editor-scroll"
      host="modal"
      title={mode.kind === 'add' ? 'New note' : 'Edit note'}
      actions={{
        testIDPrefix: 'note-editor',
        saveLabel: 'Save note',
        onCancel,
        onSave: () => void save(),
      }}>
      <AnchorField control={control} mode={mode} targets={targets} />

      <TitleField control={control} />

      <BodyField control={control} />

      <InlineError testID="note-editor-error" message={error ?? null} />
    </FormSheet>
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
    <FormModal testID="note-editor" visible={visible} onRequestClose={onCancel}>
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
    </FormModal>
  );
}
