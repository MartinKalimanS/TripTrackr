/**
 * The words of the Delete account sheet (feature 008; FR-002, FR-004). Plain data and one
 * function, so the sheet and its tests read the same sentences.
 */
import { ApiRequestError } from '@/lib/api-client';

export const DELETE_ACCOUNT_COPY = {
  title: 'Delete your account?',
  lead: 'This deletes everything you recorded for good, on every device. It cannot be undone.',
  lost: [
    'Your trips and stops',
    'Your notes',
    'Your expenses',
    'Your photos and documents, with their files',
  ],
  subscription:
    'Deleting your account does not cancel a subscription. Cancel it in the App Store or Google Play.',
  passwordLabel: 'Password',
  passwordHint:
    'Your password confirms it. If you signed in with Google or Apple, leave it empty.',
  action: 'Delete my account',
  busy: 'Deleting…',
} as const;

export const DELETE_ACCOUNT_ERRORS = {
  password: 'Enter your password to confirm.',
  offline:
    "We couldn't reach the server. Connect and try again: your account is only deleted once it can.",
  other: 'Something went wrong. Nothing was deleted.',
} as const;

const OFFLINE_CODES = new Set(['NETWORK', 'TIMEOUT']);

/** What to tell the traveller about a failed request; never the server's own wording. */
export function describeDeleteError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'REAUTHENTICATION_REQUIRED') return DELETE_ACCOUNT_ERRORS.password;
    if (OFFLINE_CODES.has(error.code)) return DELETE_ACCOUNT_ERRORS.offline;
  }
  return DELETE_ACCOUNT_ERRORS.other;
}
