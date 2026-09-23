/**
 * Add-trip form rules — tasks.md T066 (FR-009).
 *
 * The wire schema `CreateTripRequest` is the rule; this file only translates
 * its issues into product copy keyed by field, so the form can never accept a
 * trip the server would refuse for shape at sync time.
 */
import { CreateTripRequest } from '@triptrackr/contracts';

export const TRIP_FORM_COPY = {
  titleMissing: 'Give your trip a name.',
  titleTooLong: 'Keep the name under 200 characters.',
  currencyInvalid: 'Use a 3-letter currency code, like EUR.',
  saveFailed: 'The trip could not be saved on this device. Please try again.',
} as const;

export type TripFormValues = { title: string; home_currency: string };
export type TripFormErrors = { title?: string; home_currency?: string };

export function validateTripForm(values: TripFormValues): TripFormErrors {
  const result = CreateTripRequest.safeParse(values);
  if (result.success) return {};

  const errors: TripFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === 'title' && !errors.title) {
      errors.title =
        issue.code === 'too_big'
          ? TRIP_FORM_COPY.titleTooLong
          : TRIP_FORM_COPY.titleMissing;
    }
    if (field === 'home_currency' && !errors.home_currency) {
      errors.home_currency = TRIP_FORM_COPY.currencyInvalid;
    }
  }
  return errors;
}

export function hasTripFormErrors(errors: TripFormErrors): boolean {
  return Boolean(errors.title || errors.home_currency);
}
