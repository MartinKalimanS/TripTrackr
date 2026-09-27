/**
 * Note editor rules — tasks.md T084 (FR-017, FR-019); research D-21.
 *
 * The form's own fields — a title, a body, and the CHOSEN anchor by key — are
 * transformed into the wire's `CreateNoteRequest` and piped through it, so
 * `useForm` validates exactly what the server validates: the body length,
 * the title length, and FR-019's anchor rule. The anchor choices come from
 * the trip's stops (`anchorTargets`, use-move-note.ts).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateNoteRequest } from '@triptrackr/contracts';
import { z } from 'zod';

import type { FormCopy } from '@/lib/form-copy';

import type { AnchorTarget } from './use-move-note';

export const NOTE_FORM_COPY = {
  bodyMissing: 'Write something first.',
  bodyTooLong: 'Keep a note under 20,000 characters.',
  titleTooLong: 'Keep the title under 200 characters.',
  anchorMissing: 'Choose where this note belongs — the trip, a country, or a city.',
  saveFailed: 'The note could not be saved on this device. Please try again.',
} as const;

export interface NoteFormValues {
  title: string;
  body: string;
  /** `AnchorTarget.key`, or '' when nothing is chosen. */
  anchorKey: string;
}

export type NoteFormField = keyof NoteFormValues;

export const NOTE_FIELD_COPY: FormCopy<NoteFormField> = {
  title: { default: NOTE_FORM_COPY.titleTooLong },
  body: { default: NOTE_FORM_COPY.bodyMissing, too_big: NOTE_FORM_COPY.bodyTooLong },
  anchorKey: { default: NOTE_FORM_COPY.anchorMissing },
};

/**
 * The schema is built per set of targets: the anchor key resolves to the
 * target's `country_id` / `city_id`, and the wire schema then applies FR-019.
 * An unknown key (nothing chosen) is reported on `anchorKey` in the form's own
 * terms rather than as a `country_id` problem the traveller never saw.
 */
export function noteFormSchema(targets: readonly AnchorTarget[]) {
  return z
    .object({ title: z.string(), body: z.string(), anchorKey: z.string() })
    .transform((values, ctx): z.input<typeof CreateNoteRequest> => {
      const target = targets.find((candidate) => candidate.key === values.anchorKey);
      if (!target) {
        ctx.addIssue({
          code: 'custom',
          path: ['anchorKey'],
          message: 'Choose an anchor',
        });
        return z.NEVER;
      }
      const title = values.title.trim();
      return {
        title: title.length > 0 ? title : null,
        body: values.body,
        country_id: target.country_id,
        city_id: target.city_id,
      };
    })
    .pipe(CreateNoteRequest);
}

export function noteFormResolver(targets: readonly AnchorTarget[]) {
  return zodResolver(noteFormSchema(targets));
}
