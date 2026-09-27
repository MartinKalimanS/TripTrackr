/**
 * Product copy for form refusals — research D-21.
 *
 * Every form is a `react-hook-form` `useForm()` whose resolver is
 * `zodResolver(<schema from @triptrackr/contracts>)`, so the rule that decides
 * whether a value is acceptable is the wire schema itself — the same one the
 * server runs — and a form can never accept what sync would refuse. The
 * resolver reports each field's first zod issue as a `FieldError` whose `type`
 * is the zod issue code (`too_small`, `too_big`, `invalid_format`, `custom`,
 * …). This module turns that code into a sentence, once, from a per-form copy
 * table, instead of one hand-written translator per form.
 *
 * A table entry names a `default` sentence and may override specific codes:
 *
 *   title: { default: 'Give your trip a name.', too_big: 'Keep it under 200 characters.' }
 */
import type { FieldError, FieldErrors, FieldValues, Resolver } from 'react-hook-form';

export type FieldCopy = { readonly default: string } & Readonly<Record<string, string>>;

export type FormCopy<Field extends string> = Readonly<Record<Field, FieldCopy>>;

/** The sentence for one field's error, or `undefined` when the field is fine. */
export function fieldMessage(
  error: FieldError | undefined,
  copy: FieldCopy,
): string | undefined {
  if (!error) return undefined;
  const byCode = typeof error.type === 'string' ? copy[error.type] : undefined;
  return byCode ?? copy.default;
}

/** Every field's sentence at once — for tests and for summaries above a form. */
export function messagesFor<Field extends string>(
  errors: FieldErrors,
  copy: FormCopy<Field>,
): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(copy) as Field[]) {
    const message = fieldMessage(errors[field] as FieldError | undefined, copy[field]);
    if (message) out[field] = message;
  }
  return out;
}

/**
 * Runs a resolver outside a component — the pure form of "would this form
 * accept these values?" — so the rules can be unit-tested without rendering.
 */
export async function validateWith<
  Values extends FieldValues,
  Field extends string,
  Output extends FieldValues = Values,
>(
  resolver: Resolver<Values, unknown, Output>,
  values: Values,
  copy: FormCopy<Field>,
): Promise<Partial<Record<Field, string>>> {
  const result = await resolver(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
  return messagesFor(result.errors, copy);
}
