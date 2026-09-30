/**
 * T118 — the rules behind the boarding-pass confirmation form (FR-035;
 * research D-21, D-33), run outside a component through the same resolver
 * `useForm` uses. The form's three fields are normalised the way a pass
 * prints them and then piped through the wire's own `DocumentParsedFields`,
 * so what the form accepts is exactly what the API accepts.
 */
import { DocumentParsedFields } from '@triptrackr/contracts';

import {
  DOCUMENT_FIELD_COPY,
  DOCUMENT_FORM_COPY,
  DocumentFieldsFormSchema,
  documentFieldsResolver,
  initialFieldValues,
  normaliseFlightNumber,
  type DocumentFieldsFormValues,
} from '@/features/documents/document-form';
import { validateWith } from '@/lib/form-copy';

const valid: DocumentFieldsFormValues = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

const validate = (values: DocumentFieldsFormValues) =>
  validateWith(documentFieldsResolver, values, DOCUMENT_FIELD_COPY);

describe('normaliseFlightNumber', () => {
  test.each([
    ['ac 834', 'AC834'],
    ['AC0834', 'AC834'],
    [' ac 0 8 3 4 ', 'AC834'],
    ['u2 01234', 'U21234'],
    ['9w0012', '9W12'],
    ['baw 0012', 'BAW12'],
    ['lh0400a', 'LH400A'],
  ])('%j → %j', (typed, expected) => {
    expect(normaliseFlightNumber(typed)).toBe(expected);
  });

  test('leaves what is not a flight number for the schema to refuse, only compacted', () => {
    expect(normaliseFlightNumber('ac-834')).toBe('AC-834');
    expect(normaliseFlightNumber('AC 0')).toBe('AC0');
    expect(normaliseFlightNumber('')).toBe('');
  });
});

describe('DocumentFieldsFormSchema', () => {
  test('normalises the flight number and trims the name, then satisfies the wire schema', () => {
    const parsed = DocumentFieldsFormSchema.parse({
      flight_number: 'ac 0834',
      flight_date: '2026-11-22',
      passenger_name: '  DESMARAIS/LUC  ',
    });

    expect(parsed).toEqual(valid);
    expect(DocumentParsedFields.safeParse(parsed).success).toBe(true);
  });

  test('a valid form passes with no messages', async () => {
    expect(await validate(valid)).toEqual({});
    expect(await validate({ ...valid, flight_number: 'ac 834' })).toEqual({});
  });

  test('refuses what the wire refuses, in the form’s own words', async () => {
    expect(await validate({ ...valid, flight_number: 'AC-834' })).toEqual({
      flight_number: DOCUMENT_FORM_COPY.flightNumberInvalid,
    });
    expect(await validate({ ...valid, flight_number: '' })).toEqual({
      flight_number: DOCUMENT_FORM_COPY.flightNumberInvalid,
    });
    expect(await validate({ ...valid, flight_date: '22/11/2026' })).toEqual({
      flight_date: DOCUMENT_FORM_COPY.flightDateMissing,
    });
    expect(await validate({ ...valid, passenger_name: '   ' })).toEqual({
      passenger_name: DOCUMENT_FORM_COPY.passengerNameMissing,
    });
    expect(await validate({ ...valid, passenger_name: 'X'.repeat(65) })).toEqual({
      passenger_name: DOCUMENT_FORM_COPY.passengerNameTooLong,
    });
  });
});

describe('initialFieldValues', () => {
  test('pre-fills the extracted fields for checking', () => {
    expect(initialFieldValues(valid, '2026-11-20')).toEqual(valid);
  });

  test('manual entry starts empty, on today’s date', () => {
    expect(initialFieldValues(null, '2026-11-20')).toEqual({
      flight_number: '',
      flight_date: '2026-11-20',
      passenger_name: '',
    });
  });
});
