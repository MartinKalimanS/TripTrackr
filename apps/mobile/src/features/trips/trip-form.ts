/**
 * Add-trip form rules — tasks.md T066 (FR-009); research D-21.
 *
 * The wire schema `CreateTripRequest` is the rule. The form runs it through
 * `zodResolver`, and this file only supplies the words for each refusal, so
 * the form can never accept a trip the server would refuse for shape at sync
 * time.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTripRequest } from '@triptrackr/contracts';

import { validateWith, type FormCopy } from '@/lib/form-copy';

export const TRIP_FORM_COPY = {
  titleMissing: 'Give your trip a name.',
  titleTooLong: 'Keep the name under 200 characters.',
  currencyInvalid: 'Use a 3-letter currency code, like EUR.',
  saveFailed: 'The trip could not be saved on this device. Please try again.',
} as const;

export type TripFormValues = { title: string; home_currency: string };
export type TripFormField = keyof TripFormValues;
export type TripFormErrors = Partial<Record<TripFormField, string>>;

/** Per-field, per-zod-code sentences (form-copy.ts). */
export const TRIP_FIELD_COPY: FormCopy<TripFormField> = {
  title: { default: TRIP_FORM_COPY.titleMissing, too_big: TRIP_FORM_COPY.titleTooLong },
  home_currency: { default: TRIP_FORM_COPY.currencyInvalid },
};

export const tripFormResolver = zodResolver(CreateTripRequest);

/** The pure form of the rules — what `useForm` applies on submit. */
export function validateTripForm(values: TripFormValues): Promise<TripFormErrors> {
  return validateWith(tripFormResolver, values, TRIP_FIELD_COPY);
}

export function hasTripFormErrors(errors: TripFormErrors): boolean {
  return Boolean(errors.title || errors.home_currency);
}
