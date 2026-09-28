/**
 * The form rules behind the note editor and the add-expense sheet (research
 * D-21), run outside a component through the same resolvers `useForm` uses:
 * each form's own fields are transformed into the wire request and piped
 * through it, so what the form accepts is what the server accepts. Also the
 * copy layer (`form-copy.ts`) and the locale helpers (D-27).
 */
import {
  EXPENSE_FIELD_COPY,
  EXPENSE_FORM_COPY,
  ExpenseFormSchema,
  expenseFormResolver,
  type ExpenseFormValues,
} from '@/features/expenses/expense-form';
import {
  NOTE_FIELD_COPY,
  NOTE_FORM_COPY,
  noteFormResolver,
  noteFormSchema,
  type NoteFormValues,
} from '@/features/notes/note-form';
import type { AnchorTarget } from '@/features/notes/use-move-note';
import { fieldMessage, messagesFor, validateWith } from '@/lib/form-copy';
import { describeRate, deviceLocale, formatMoney } from '@/lib/locale';

const targets: AnchorTarget[] = [
  {
    level: 'trip',
    key: 'country:1',
    label: 'Whole trip (Italy)',
    country_id: 1,
    city_id: null,
  },
  { level: 'city', key: 'city:100', label: 'Roma, Italy', country_id: 1, city_id: 100 },
];

describe('note form (FR-017, FR-019)', () => {
  const validate = (values: NoteFormValues) =>
    validateWith(noteFormResolver(targets), values, NOTE_FIELD_COPY);

  test('resolves the chosen anchor into the wire request, trimming the title to null', () => {
    expect(
      noteFormSchema(targets).parse({
        title: '  ',
        body: 'Raclette.',
        anchorKey: 'city:100',
      }),
    ).toEqual({
      title: null,
      body: 'Raclette.',
      country_id: 1,
      city_id: 100,
      is_public: false,
    });
  });

  test('refuses an empty body and a missing anchor, each in words', async () => {
    expect(await validate({ title: '', body: '', anchorKey: 'country:1' })).toEqual({
      body: NOTE_FORM_COPY.bodyMissing,
    });
    expect(await validate({ title: '', body: 'x', anchorKey: '' })).toEqual({
      anchorKey: NOTE_FORM_COPY.anchorMissing,
    });
    expect(
      await validate({ title: 'x'.repeat(201), body: 'x', anchorKey: 'country:1' }),
    ).toEqual({ title: NOTE_FORM_COPY.titleTooLong });
  });

  test('a valid note passes with no messages', async () => {
    expect(
      await validate({ title: 'Cheese', body: 'x', anchorKey: 'country:1' }),
    ).toEqual({});
  });
});

describe('expense form (FR-020, FR-021; research D-27)', () => {
  const base: ExpenseFormValues = {
    amount: '12,50',
    currency: 'eur',
    category_id: '00000000-0000-4000-8000-000000000001',
    spent_at: '2026-06-02',
    city_id: null,
    note: '  Lunch  ',
  };
  const validate = (values: ExpenseFormValues) =>
    validateWith(expenseFormResolver, values, EXPENSE_FIELD_COPY);

  test('reads the typed amount, upper-cases the code, trims the note', () => {
    expect(ExpenseFormSchema.parse(base)).toEqual({
      amount: '12.50',
      currency: 'EUR',
      category_id: base.category_id,
      spent_at: '2026-06-02',
      city_id: null,
      note: 'Lunch',
    });
    expect(
      ExpenseFormSchema.parse({ ...base, amount: '1.234,50', note: '' }),
    ).toMatchObject({
      amount: '1234.50',
      note: null,
    });
  });

  test('refuses what the wire would refuse, in the form’s own words', async () => {
    expect(await validate({ ...base, amount: 'abc' })).toEqual({
      amount: EXPENSE_FORM_COPY.amountInvalid,
    });
    expect(await validate({ ...base, currency: 'EURO' })).toEqual({
      currency: EXPENSE_FORM_COPY.currencyInvalid,
    });
    expect(await validate({ ...base, category_id: '' })).toEqual({
      category_id: EXPENSE_FORM_COPY.categoryMissing,
    });
    expect(await validate({ ...base, spent_at: 'yesterday' })).toEqual({
      spent_at: EXPENSE_FORM_COPY.dateMissing,
    });
    expect(await validate({ ...base, note: 'x'.repeat(501) })).toEqual({
      note: EXPENSE_FORM_COPY.noteTooLong,
    });
  });

  test('a refund is an amount too, and a valid form passes clean', async () => {
    expect(await validate({ ...base, amount: '-3' })).toEqual({});
    expect(await validate(base)).toEqual({});
  });
});

describe('form-copy', () => {
  test('fieldMessage prefers the sentence for the zod code and falls back to the default', () => {
    const copy = { default: 'Missing.', too_big: 'Too long.' };
    expect(fieldMessage(undefined, copy)).toBeUndefined();
    expect(fieldMessage({ type: 'too_big' }, copy)).toBe('Too long.');
    expect(fieldMessage({ type: 'invalid_format' }, copy)).toBe('Missing.');
    expect(fieldMessage({ type: 'custom', message: 'x' }, copy)).toBe('Missing.');
  });

  test('messagesFor collects one sentence per failing field', () => {
    expect(
      messagesFor(
        { a: { type: 'too_small' }, c: { type: 'too_big' } },
        {
          a: { default: 'A' },
          b: { default: 'B' },
          c: { default: 'C', too_big: 'C big' },
        },
      ),
    ).toEqual({ a: 'A', c: 'C big' });
  });
});

describe('locale (research D-27)', () => {
  test('reads the device locale from expo-localization', () => {
    expect(deviceLocale()).toEqual({
      languageTag: 'en-GB',
      decimalSeparator: '.',
      currencyCode: 'GBP',
      measurementSystem: 'metric',
    });
  });

  test('formats money in the device locale without widening the amount to a float', () => {
    expect(formatMoney('12.50', 'EUR', 'en-GB')).toBe('€12.50');
    expect(formatMoney('1234.50', 'CHF', 'de-CH')).toMatch(/1.234\.50/);
    expect(formatMoney('0.1', 'USD', 'en-US')).toBe('$0.10');
  });

  test('a test-range code still renders, with the code beside the amount', () => {
    const text = formatMoney('250000.00', 'XTS', 'en-GB');
    expect(text).toMatch(/XTS/);
    expect(text).toMatch(/250,000\.00/);
  });

  test('a code Intl refuses outright falls back to the amount plus the code', () => {
    expect(formatMoney('5.00', 'NOTACODE', 'en-GB')).toBe('5.00 NOTACODE');
  });

  test('describes a rate the way FR-026 asks for', () => {
    expect(describeRate('EUR', '0.888889', 'CHF')).toBe('1 EUR = 0.888889 CHF');
  });
});
