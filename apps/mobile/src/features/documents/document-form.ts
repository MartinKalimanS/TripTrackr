/**
 * Boarding-pass confirmation rules — tasks.md T118 (FR-035; Constitution IV);
 * research D-21, D-33.
 *
 * The form's three fields — flight number, flight date, passenger name — are
 * the wire's `DocumentParsedFields`, pre-filled from the barcode for checking
 * or typed by hand when it could not be read. The one thing the wire cannot
 * know is how a traveller types a flight number: "ac 0834" is AC834. The
 * form normalises it the way the pass itself prints it — upper case, no
 * spaces, no leading zeros in the number — and then pipes the values through
 * `DocumentParsedFields`, so `useForm` validates exactly what the API does.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { DocumentParsedFields } from '@triptrackr/contracts';
import { z } from 'zod';

import type { FormCopy } from '@/lib/form-copy';

export const DOCUMENT_FORM_COPY = {
  flightNumberInvalid: 'Enter the flight number as it’s printed, like AC834.',
  flightDateMissing: 'Choose the date of the flight.',
  passengerNameMissing: 'Enter the passenger name as it’s printed on the pass.',
  passengerNameTooLong: 'Keep the name under 64 characters.',
  saveFailed: 'Those details could not be saved on this device. Please try again.',
} as const;

export interface DocumentFieldsFormValues {
  flight_number: string;
  /** `YYYY-MM-DD`, a local calendar day. */
  flight_date: string;
  passenger_name: string;
}

export type DocumentFieldsFormField = keyof DocumentFieldsFormValues;

export const DOCUMENT_FIELD_COPY: FormCopy<DocumentFieldsFormField> = {
  flight_number: { default: DOCUMENT_FORM_COPY.flightNumberInvalid },
  flight_date: { default: DOCUMENT_FORM_COPY.flightDateMissing },
  passenger_name: {
    default: DOCUMENT_FORM_COPY.passengerNameMissing,
    too_big: DOCUMENT_FORM_COPY.passengerNameTooLong,
  },
};

/** An airline designator (IATA two characters or ICAO three letters), then the number. */
const FLIGHT_PARTS = /^([A-Z]{3}|[A-Z0-9]{2})0*([1-9]\d{0,3}[A-Z]?)$/;

/**
 * "ac 0834" → "AC834". Anything that is not a flight number comes back
 * compacted and upper-cased, for the schema to refuse in words.
 */
export function normaliseFlightNumber(typed: string): string {
  const compact = typed.replace(/\s+/g, '').toUpperCase();
  const parts = FLIGHT_PARTS.exec(compact);
  return parts ? `${parts[1]}${parts[2]}` : compact;
}

export const DocumentFieldsFormSchema = z
  .object({
    flight_number: z.string(),
    flight_date: z.string(),
    passenger_name: z.string(),
  })
  .transform((values): z.input<typeof DocumentParsedFields> => ({
    flight_number: normaliseFlightNumber(values.flight_number),
    flight_date: values.flight_date,
    passenger_name: values.passenger_name,
  }))
  .pipe(DocumentParsedFields);

export const documentFieldsResolver = zodResolver(DocumentFieldsFormSchema);

/** The extracted fields to check, or an empty form on `today` for manual entry. */
export function initialFieldValues(
  fields: DocumentParsedFields | null,
  today: string,
): DocumentFieldsFormValues {
  return fields
    ? { ...fields }
    : { flight_number: '', flight_date: today, passenger_name: '' };
}
