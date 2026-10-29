/**
 * The words of the Export my data sheet (spec 009). Plain data and one function, so the sheet and
 * its tests read the same sentences.
 */
import { ApiRequestError } from '@/lib/api-client';

export const EXPORT_COPY = {
  title: 'Export your data',
  lead: 'We put everything you recorded in one zip file: trips, stops, notes, expenses (also as a spreadsheet), and your photos and documents with their files.',
  keep: 'The file is ready in a few minutes and stays available for 24 hours. You can export once a day.',
  passwordLabel: 'Password',
  passwordHint:
    'Your password confirms it is you. If you signed in with Google or Apple, leave it empty.',
  request: 'Request my data',
  pending:
    'Preparing your file. You can close this: it keeps going, and you can come back to it.',
  ready: 'Your file is ready.',
  download: 'Download',
  ended: 'That file is no longer available. You can ask for a new one.',
  again: 'Ask again',
  close: 'Close',
} as const;

export const EXPORT_ERRORS = {
  password: 'Enter your password to confirm.',
  offline: "We couldn't reach the server. Connect and try again.",
  other: 'Something went wrong. Nothing was exported.',
} as const;

const OFFLINE_CODES = new Set(['NETWORK', 'TIMEOUT']);

/** What to tell the traveller about a failed request; never the server's own wording. */
export function describeExportError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'REAUTHENTICATION_REQUIRED') return EXPORT_ERRORS.password;
    if (OFFLINE_CODES.has(error.code)) return EXPORT_ERRORS.offline;
  }
  return EXPORT_ERRORS.other;
}
