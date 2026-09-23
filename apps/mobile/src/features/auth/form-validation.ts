/**
 * Inline validation for the auth forms — tasks.md T064.
 *
 * The rules are the contracts' own (`RegisterRequest`, `LoginRequest`): the
 * form runs `safeParse` and translates each issue into product copy keyed by
 * field. The server applies the same schema, so a form that passes here is a
 * request the server will not refuse for shape — and the copy can never drift
 * from the rule because the rule is imported, not restated.
 */
import { LoginRequest, RegisterRequest } from '@triptrackr/contracts';
import type { z } from 'zod';

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

const FIELD_COPY: Record<string, string> = {
  email: 'Enter a valid email address.',
  password: 'Use at least 12 characters.',
  display_name: 'Tell us what to call you (up to 60 characters).',
};

function firstIssuePerField<Field extends string>(
  issues: z.core.$ZodIssue[],
): FieldErrors<Field> {
  const errors: FieldErrors<Field> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? '') as Field;
    if (!field || errors[field]) continue;
    errors[field] = FIELD_COPY[field] ?? issue.message;
  }
  return errors;
}

export type RegisterFields = 'email' | 'password' | 'display_name';
export type LoginFields = 'email' | 'password';

export function validateRegister(values: {
  email: string;
  password: string;
  display_name: string;
}): FieldErrors<RegisterFields> {
  const result = RegisterRequest.safeParse(values);
  return result.success ? {} : firstIssuePerField<RegisterFields>(result.error.issues);
}

export function validateLogin(values: {
  email: string;
  password: string;
}): FieldErrors<LoginFields> {
  const result = LoginRequest.safeParse(values);
  if (result.success) return {};
  const errors = firstIssuePerField<LoginFields>(result.error.issues);
  // Login does not judge password length — the only thing to say is "type it".
  if (errors.password) errors.password = 'Enter your password.';
  return errors;
}

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.keys(errors).length > 0;
}
